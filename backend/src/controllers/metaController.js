import Device, { DEVICE_TYPES, VENDORS, PROTOCOLS, DRIVERS } from '../models/Device.js';
import Site from '../models/Site.js';
import { ROLES } from '../models/User.js';
import { JOB_TYPES, JOB_STATUSES } from '../models/Job.js';
import { SCHEDULE_TYPES } from '../models/Schedule.js';
import { driverCatalog } from '../drivers/index.js';

/** Everything the UI needs to build select boxes and driver help texts. */
export async function meta(req, res) {
  const [siteRows, locations] = await Promise.all([
    Site.find({ active: true }).sort({ name: 1 }).lean().then((rows) => rows.map((site) => site.name)),
    Device.distinct('location').then((rows) => rows.filter(Boolean).sort((a, b) => a.localeCompare(b))),
  ]);

  const deviceSiteRows = await Device.distinct('site').then((rows) => rows.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  const sites = [...new Set([...siteRows, ...deviceSiteRows])];

  res.json({
    vendors: VENDORS,
    deviceTypes: DEVICE_TYPES,
    protocols: PROTOCOLS,
    drivers: DRIVERS,
    roles: ROLES,
    jobTypes: JOB_TYPES,
    jobStatuses: JOB_STATUSES,
    scheduleTypes: SCHEDULE_TYPES,
    sites,
    locations,
    driverCatalog: driverCatalog(),
  });
}

export default { meta };
