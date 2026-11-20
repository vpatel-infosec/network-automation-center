import Device from '../models/Device.js';
import Job from '../models/Job.js';
import ConfigVersion from '../models/ConfigVersion.js';
import AuditLog from '../models/AuditLog.js';
import packageJson from '../../package.json' assert { type: 'json' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest vendor OS versions for update advisory checks */
const VENDOR_LATEST_VERSIONS = {
  cisco: { latestOs: '17.12.01', name: 'Cisco IOS-XE / NX-OS', advisoryUrl: 'https://software.cisco.com' },
  aruba: { latestOs: '10.13.00', name: 'ArubaOS-CX', advisoryUrl: 'https://asp.arubanetworks.com' },
  juniper: { latestOs: '23.4R1', name: 'Junos OS', advisoryUrl: 'https://support.juniper.net' },
  ubiquiti: { latestOs: '3.2.12', name: 'UniFi OS / EdgeOS', advisoryUrl: 'https://ui.com/download' },
  generic: { latestOs: 'N/A', name: 'Generic SSH', advisoryUrl: '' },
};

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
    devicesWithOs,
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
    Device.find({}, 'name vendor model osVersion status.reachable').lean(),
  ]);

  // Evaluate vendor updates / notifications
  const vendorNotifications = Object.keys(VENDOR_LATEST_VERSIONS)
    .filter((v) => v !== 'generic')
    .map((vendorKey) => {
      const vendorInfo = VENDOR_LATEST_VERSIONS[vendorKey];
      const vendorDevices = devicesWithOs.filter((d) => d.vendor === vendorKey);
      const outdatedDevices = vendorDevices.filter(
        (d) => d.osVersion && d.osVersion.trim() !== '' && d.osVersion.trim() !== vendorInfo.latestOs
      );
      return {
        vendor: vendorKey,
        vendorName: vendorInfo.name,
        latestOs: vendorInfo.latestOs,
        advisoryUrl: vendorInfo.advisoryUrl,
        totalDevices: vendorDevices.length,
        outdatedCount: outdatedDevices.length,
        outdatedDevices: outdatedDevices.map((d) => ({ id: d._id, name: d.name, currentOs: d.osVersion })),
      };
    })
    .filter((v) => v.totalDevices > 0);

  res.json({
    appVersion: packageJson.version || '1.0.0',
    vendorLatestVersions: VENDOR_LATEST_VERSIONS,
    vendorNotifications,
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

