import {
  listDevices,
  listAllDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  testConnection,
} from '../services/deviceService.js';
import { backupDevice } from '../services/backupService.js';

export async function list(req, res) {
  res.json(await listDevices(req.query));
}

/** Compact list for device pickers in jobs / templates / schedules. */
export async function listAll(req, res) {
  res.json({ items: await listAllDevices() });
}

export async function get(req, res) {
  res.json({ device: await getDevice(req.params.id) });
}

export async function create(req, res) {
  const device = await createDevice(req.body, req.user);
  res.status(201).json({ device });
}

export async function update(req, res) {
  const device = await updateDevice(req.params.id, req.body, req.user);
  res.json({ device });
}

export async function remove(req, res) {
  await deleteDevice(req.params.id, req.user);
  res.json({ success: true });
}

export async function test(req, res) {
  const result = await testConnection(req.params.id, req.user);
  res.json(result);
}

/** Manual "backup now" for a single device. */
export async function backupNow(req, res) {
  const result = await backupDevice({
    deviceId: req.params.id,
    user: req.user,
    trigger: 'manual',
    note: req.body?.note || '',
  });
  res.json(result);
}

export default { list, listAll, get, create, update, remove, test, backupNow };
