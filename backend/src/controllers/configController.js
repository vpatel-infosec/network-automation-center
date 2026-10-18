import ConfigVersion from '../models/ConfigVersion.js';
import AppError from '../utils/AppError.js';
import { lineDiff, diffSummary, collapseContext } from '../utils/diff.js';
import { createJob, startJob } from '../services/jobService.js';
import { audit } from '../services/auditService.js';
import { getBackupStorageStatus } from '../services/backupStorageService.js';

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));

export async function list(req, res) {
  const { device } = req.query;
  const page = clamp(req.query.page, 1, 10000, 1);
  const limit = clamp(req.query.limit, 1, 200, 50);
  const query = device ? { device } : {};

  const [items, total] = await Promise.all([
    ConfigVersion.find(query)
      .select('-content -startupContent')
      .populate('device', 'name host vendor deviceType')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ConfigVersion.countDocuments(query),
  ]);

  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function get(req, res) {
  const version = await ConfigVersion.findById(req.params.id)
    .populate('device', 'name host vendor deviceType')
    .populate('createdBy', 'name');
  if (!version) throw new AppError('Configuration version not found', 404);
  res.json({ version });
}

export async function storageStatus(req, res) {
  res.json(getBackupStorageStatus());
}

/** Line diff between two versions of the same device. */
export async function diff(req, res) {
  const { from, to } = req.query;
  if (!from || !to) throw new AppError('Query parameters "from" and "to" (configuration version ids) are required', 400);

  const [older, newer] = await Promise.all([ConfigVersion.findById(from), ConfigVersion.findById(to)]);
  if (!older || !newer) throw new AppError('One of the configuration versions was not found', 404);
  if (String(older.device) !== String(newer.device)) {
    throw new AppError('Both versions must belong to the same device', 400);
  }

  const allRows = lineDiff(older.content, newer.content);
  const context = clamp(req.query.context, 0, 50, 3);
  const rows = req.query.full === 'true' ? allRows : collapseContext(allRows, context);

  res.json({
    from: { id: older._id, version: older.version, createdAt: older.createdAt, trigger: older.trigger },
    to: { id: newer._id, version: newer.version, createdAt: newer.createdAt, trigger: newer.trigger },
    summary: diffSummary(allRows),
    rows,
  });
}

/** Queue a restore job for the given version (device is taken from the version). */
export async function restore(req, res) {
  const version = await ConfigVersion.findById(req.params.id).populate('device', 'name host');
  if (!version) throw new AppError('Configuration version not found', 404);

  const job = await createJob(
    {
      type: 'restore',
      name: `Restore ${version.device?.name || 'device'} to v${version.version}`,
      configVersionId: version._id,
      options: { persist: true, backupAfter: req.body?.backupAfter !== false },
    },
    req.user
  );
  await audit({
    user: req.user,
    action: 'config.restore',
    entity: 'configVersion',
    entityId: version._id,
    details: { device: version.device?.name, version: version.version, jobId: job._id },
    ip: req.ip,
  });
  startJob(job._id);
  res.status(202).json({ job });
}

export async function remove(req, res) {
  const version = await ConfigVersion.findByIdAndDelete(req.params.id);
  if (!version) throw new AppError('Configuration version not found', 404);
  await audit({ user: req.user, action: 'config.delete', entity: 'configVersion', entityId: req.params.id, details: { version: version.version }, ip: req.ip });
  res.json({ success: true });
}

export default { list, get, storageStatus, diff, restore, remove };
