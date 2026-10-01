import Device from '../models/Device.js';
import Job from '../models/Job.js';
import ConfigVersion from '../models/ConfigVersion.js';
import AuditLog from '../models/AuditLog.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregated numbers for the dashboard page. */
export async function summary(req, res) {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const staleBefore = new Date(Date.now() - DAY_MS);

  const [
    total,
    reachable,
    byVendor,
    byType,
    jobsByStatus,
    recentJobs,
    recentAudit,
    backupsPerDay,
    latestPerDevice,
    configTotal,
    staleBackups,
  ] = await Promise.all([
    Device.countDocuments(),
    Device.countDocuments({ 'status.reachable': true }),
    Device.aggregate([{ $group: { _id: '$vendor', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Device.aggregate([{ $group: { _id: '$deviceType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Job.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Job.find().select('-results').sort({ createdAt: -1 }).limit(8),
    AuditLog.find().sort({ createdAt: -1 }).limit(10),
    ConfigVersion.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ConfigVersion.aggregate([
      { $sort: { device: 1, version: -1 } },
      {
        $group: {
          _id: '$device',
          version: { $first: '$version' },
          createdAt: { $first: '$createdAt' },
          size: { $first: '$size' },
        },
      },
      { $lookup: { from: 'devices', localField: '_id', foreignField: '_id', as: 'device' } },
      { $unwind: '$device' },
      {
        $project: {
          _id: 0,
          deviceId: '$_id',
          name: '$device.name',
          host: '$device.host',
          vendor: '$device.vendor',
          deviceType: '$device.deviceType',
          version: 1,
          createdAt: 1,
          size: 1,
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
    ]),
    ConfigVersion.countDocuments(),
    Device.countDocuments({
      $or: [{ 'status.lastBackupAt': { $exists: false } }, { 'status.lastBackupAt': { $lt: staleBefore } }],
    }),
  ]);

  res.json({
    devices: {
      total,
      reachable,
      unreachable: Math.max(0, total - reachable),
      byVendor,
      byType,
      staleBackups,
    },
    jobs: { byStatus: jobsByStatus, recent: recentJobs },
    configs: { total: configTotal, backupsPerDay, latestPerDevice },
    audit: recentAudit,
    generatedAt: new Date(),
  });
}

export default { summary };
