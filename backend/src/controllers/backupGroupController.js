import BackupGroup from '../models/BackupGroup.js';
import Device from '../models/Device.js';
import AppError from '../utils/AppError.js';
import { audit } from '../services/auditService.js';

const DEVICE_FIELDS = 'name host vendor deviceType site status.reachable';

async function validateDevices(deviceIds = []) {
  const uniqueIds = [...new Set(deviceIds.map(String))];
  if (!uniqueIds.length) return uniqueIds;
  const count = await Device.countDocuments({ _id: { $in: uniqueIds } });
  if (count !== uniqueIds.length) throw new AppError('One or more group devices do not exist', 400);
  return uniqueIds;
}

export async function list(req, res) {
  const items = await BackupGroup.find()
    .populate('devices', DEVICE_FIELDS)
    .populate('createdBy', 'name')
    .sort({ name: 1 });
  res.json({ items });
}

export async function create(req, res) {
  const devices = await validateDevices(req.body.deviceIds);
  const group = new BackupGroup({ ...req.body, devices, createdBy: req.user?._id });
  try {
    await group.save();
  } catch (error) {
    if (error?.code === 11000) throw new AppError('A backup group with this name already exists', 409);
    throw error;
  }
  await group.populate('devices', DEVICE_FIELDS);
  await audit({ user: req.user, action: 'backup_group.create', entity: 'backupGroup', entityId: group._id, details: { name: group.name, devices: devices.length }, ip: req.ip });
  res.status(201).json({ group });
}

export async function update(req, res) {
  const group = await BackupGroup.findById(req.params.id);
  if (!group) throw new AppError('Backup group not found', 404);
  const payload = { ...req.body };
  if (payload.deviceIds !== undefined) group.devices = await validateDevices(payload.deviceIds);
  if (payload.name !== undefined) group.name = payload.name;
  if (payload.description !== undefined) group.description = payload.description;
  try {
    await group.save();
  } catch (error) {
    if (error?.code === 11000) throw new AppError('A backup group with this name already exists', 409);
    throw error;
  }
  await group.populate('devices', DEVICE_FIELDS);
  await audit({ user: req.user, action: 'backup_group.update', entity: 'backupGroup', entityId: group._id, details: { name: group.name, devices: group.devices.length }, ip: req.ip });
  res.json({ group });
}

export async function remove(req, res) {
  const group = await BackupGroup.findByIdAndDelete(req.params.id);
  if (!group) throw new AppError('Backup group not found', 404);
  await audit({ user: req.user, action: 'backup_group.delete', entity: 'backupGroup', entityId: group._id, details: { name: group.name }, ip: req.ip });
  res.json({ success: true });
}

export default { list, create, update, remove };