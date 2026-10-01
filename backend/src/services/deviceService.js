import Device from '../models/Device.js';
import ConfigVersion from '../models/ConfigVersion.js';
import Schedule from '../models/Schedule.js';
import { resolveDriver } from '../drivers/index.js';
import { withDeviceSession } from './deviceConnection.js';
import { SECRET_FIELDS } from './credentialService.js';
import { audit } from './auditService.js';
import AppError from '../utils/AppError.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shortMessage = (text, max = 300) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ')
    .slice(0, max);

export function buildListQuery(filters = {}) {
  const query = {};
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q), 'i');
    query.$or = [{ name: rx }, { host: rx }, { location: rx }, { tags: rx }];
  }
  if (filters.vendor) query.vendor = filters.vendor;
  if (filters.deviceType) query.deviceType = filters.deviceType;
  if (filters.reachable === 'true') query['status.reachable'] = true;
  if (filters.reachable === 'false') query['status.reachable'] = false;
  return query;
}

export async function listDevices(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const query = buildListQuery(filters);
  const [items, total] = await Promise.all([
    Device.find(query)
      .populate('credential', 'name username')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Device.countDocuments(query),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Lightweight device list for pickers (jobs, templates, schedules). */
export async function listAllDevices() {
  return Device.find()
    .select('name host vendor deviceType protocol driver status.reachable credential')
    .populate('credential', 'name username')
    .sort({ name: 1 });
}

export async function getDevice(id, { withCredential = false } = {}) {
  let query = Device.findById(id);
  if (withCredential) {
    query = query.populate({ path: 'credential', select: `name username ${SECRET_FIELDS}` });
  } else {
    query = query.populate('credential', 'name username');
  }
  const device = await query;
  if (!device) throw new AppError('Device not found', 404);
  return device;
}

export async function createDevice(payload, user) {
  const device = new Device({
    ...payload,
    port: payload.port || (payload.protocol === 'restconf' ? 443 : 22),
  });
  await device.save();
  await audit({ user, action: 'device.create', entity: 'device', entityId: device._id, details: { name: device.name, host: device.host } });
  return getDevice(device._id);
}

export async function updateDevice(id, payload, user) {
  const device = await getDevice(id);
  const previousName = device.name;
  Object.assign(device, payload);
  await device.save();
  await audit({ user, action: 'device.update', entity: 'device', entityId: device._id, details: { name: device.name, previousName } });
  return getDevice(device._id);
}

export async function deleteDevice(id, user) {
  const device = await getDevice(id);
  const [versions] = await Promise.all([
    ConfigVersion.countDocuments({ device: device._id }),
    Schedule.updateMany({ devices: device._id }, { $pull: { devices: device._id } }),
  ]);
  await ConfigVersion.deleteMany({ device: device._id });
  await device.deleteOne();
  await audit({
    user,
    action: 'device.delete',
    entity: 'device',
    entityId: id,
    details: { name: device.name, host: device.host, configVersionsDeleted: versions },
  });
  return device;
}

/** Connect, run the driver identify command and persist the result on the device. */
export async function testConnection(id, user) {
  const device = await getDevice(id, { withCredential: true });
  if (!device.credential) throw new AppError('Device has no credential assigned', 400);
  const driver = resolveDriver(device);
  const startedAt = Date.now();
  try {
    const output = await withDeviceSession(device, device.credential, (session, drv) =>
      drv.identify(session, { device })
    );
    const latencyMs = Date.now() - startedAt;
    device.status.reachable = true;
    device.status.latencyMs = latencyMs;
    device.status.lastCheckedAt = new Date();
    device.status.lastCheckMessage = shortMessage(output);
    await device.save();
    await audit({ user, action: 'device.test', entity: 'device', entityId: device._id, details: { reachable: true, latencyMs, driver: driver.id } });
    return { reachable: true, latencyMs, driver: driver.id, output };
  } catch (error) {
    device.status.reachable = false;
    device.status.lastCheckedAt = new Date();
    device.status.lastCheckMessage = error.message;
    await device.save();
    await audit({ user, action: 'device.test', entity: 'device', entityId: device._id, details: { reachable: false, error: error.message } });
    return { reachable: false, driver: driver.id, error: error.message };
  }
}

export default {
  listDevices,
  listAllDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  testConnection,
};
