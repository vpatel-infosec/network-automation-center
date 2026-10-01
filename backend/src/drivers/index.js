import AppError from '../utils/AppError.js';
import ciscoIos from './ciscoIos.js';
import ciscoNxos from './ciscoNxos.js';
import ciscoWlc from './ciscoWlc.js';
import ciscoRestconf from './ciscoRestconf.js';
import arubaOs from './arubaOs.js';
import juniper from './juniper.js';
import ubiquiti from './ubiquiti.js';
import genericSsh from './genericSsh.js';

/** Keep this list in sync with DRIVERS in models/Device.js */
export const drivers = {
  cisco_ios: ciscoIos,
  cisco_nxos: ciscoNxos,
  cisco_wlc: ciscoWlc,
  cisco_restconf: ciscoRestconf,
  aruba_os: arubaOs,
  juniper,
  ubiquiti,
  generic_ssh: genericSsh,
};

const BY_VENDOR_TYPE = {
  'cisco:switch': 'cisco_ios',
  'cisco:router': 'cisco_ios',
  'cisco:access_point': 'cisco_ios',
  'cisco:wlc': 'cisco_wlc',
  'cisco:firewall': 'cisco_ios',
  'cisco:other': 'cisco_ios',
  'aruba:switch': 'aruba_os',
  'aruba:router': 'aruba_os',
  'aruba:access_point': 'aruba_os',
  'aruba:wlc': 'aruba_os',
  'aruba:other': 'aruba_os',
  'juniper:switch': 'juniper',
  'juniper:router': 'juniper',
  'juniper:firewall': 'juniper',
  'juniper:other': 'juniper',
  'ubiquiti:switch': 'ubiquiti',
  'ubiquiti:router': 'ubiquiti',
  'ubiquiti:access_point': 'ubiquiti',
  'ubiquiti:other': 'ubiquiti',
};

export function resolveDriverId(device) {
  if (device.driver && device.driver !== 'auto') return device.driver;
  if (device.protocol === 'restconf') return 'cisco_restconf';
  return BY_VENDOR_TYPE[`${device.vendor}:${device.deviceType}`] || 'generic_ssh';
}

export function resolveDriver(device) {
  const id = resolveDriverId(device);
  const driver = drivers[id];
  if (!driver) throw new AppError(`Unknown driver "${id}" for device ${device.name}`, 400);
  return driver;
}

export function driverCatalog() {
  return Object.values(drivers).map((driver) => ({
    id: driver.id,
    label: driver.label,
    protocol: driver.protocol,
    vendors: driver.vendors,
    deviceTypes: driver.deviceTypes,
    supportsBackup: driver.supportsBackup !== false,
    supportsPush: driver.supportsPush !== false,
  }));
}

export default drivers;
