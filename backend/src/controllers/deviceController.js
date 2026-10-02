import {
  listDevices,
  listAllDevices,
  listMonitoring,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  testConnection,
} from '../services/deviceService.js';
import { backupDevice } from '../services/backupService.js';
import { deviceSchema } from '../utils/deviceValidation.js';

export async function list(req, res) {
  res.json(await listDevices(req.query));
}

/** Compact list for device pickers in jobs / templates / schedules. */
export async function listAll(req, res) {
  res.json({ items: await listAllDevices() });
}

export async function monitoring(req, res) {
  res.json(await listMonitoring());
}

export async function get(req, res) {
  res.json({ device: await getDevice(req.params.id) });
}

export async function create(req, res) {
  const device = await createDevice(req.body, req.user);
  res.status(201).json({ device });
}

export async function bulkCreate(req, res) {
  const results = await Promise.all(
    req.body.rows.map(async (row, index) => {
      const parsed = deviceSchema.safeParse(row);
      const sheetRow = Number(row._row) || index + 2;
      if (!parsed.success) {
        return {
          row: sheetRow,
          name: String(row.name || ''),
          error: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`).join('; '),
        };
      }

      try {
        const device = await createDevice(parsed.data, req.user);
        return { row: sheetRow, name: device.name, id: device._id, success: true };
      } catch (error) {
        return { row: sheetRow, name: parsed.data.name, error: error.message };
      }
    })
  );

  const created = results.filter((result) => result.success).length;
  res.status(200).json({ created, failed: results.length - created, results });
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

export default { list, listAll, monitoring, get, create, bulkCreate, update, remove, test, backupNow };
