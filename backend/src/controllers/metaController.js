import { DEVICE_TYPES, VENDORS, PROTOCOLS, DRIVERS } from '../models/Device.js';
import { ROLES } from '../models/User.js';
import { JOB_TYPES, JOB_STATUSES } from '../models/Job.js';
import { SCHEDULE_TYPES } from '../models/Schedule.js';
import { driverCatalog } from '../drivers/index.js';

/** Everything the UI needs to build select boxes and driver help texts. */
export function meta(req, res) {
  res.json({
    vendors: VENDORS,
    deviceTypes: DEVICE_TYPES,
    protocols: PROTOCOLS,
    drivers: DRIVERS,
    roles: ROLES,
    jobTypes: JOB_TYPES,
    jobStatuses: JOB_STATUSES,
    scheduleTypes: SCHEDULE_TYPES,
    driverCatalog: driverCatalog(),
  });
}

export default { meta };
