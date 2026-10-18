import Device from '../models/Device.js';
import { resolveDriver } from '../drivers/index.js';
import AppError from '../utils/AppError.js';

const SITE_SWITCH_FIELDS = '_id name host vendor deviceType platform model driver protocol commandOverrides';

function validateVlanId(value) {
  const vlanId = Number(value);
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
    throw new AppError('VLAN ID must be an integer from 1 to 4094', 400);
  }
  return vlanId;
}

function normalizeVlanName(vlanId, value) {
  const name = String(value ?? '').trim() || `VLAN_${vlanId}`;
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(name)) {
    throw new AppError('VLAN name must be 1-32 characters: letters, numbers, underscore, period or hyphen', 400);
  }
  return name;
}

export function buildSiteVlanConfig(device, requestedVlanId, requestedVlanName = '') {
  const vlanId = validateVlanId(requestedVlanId);
  const vlanName = normalizeVlanName(vlanId, requestedVlanName);
  const override = device.commandOverrides?.vlanCreate;
  if (override && String(override).trim()) {
    return String(override)
      .trim()
      .replaceAll('{{vlan}}', String(vlanId))
      .replaceAll('{{name}}', vlanName);
  }

  switch (resolveDriver(device).id) {
    case 'cisco_ios':
    case 'cisco_nxos':
    case 'aruba_os':
      return `vlan ${vlanId}\n name ${vlanName}`;
    case 'juniper':
      return `set vlans ${vlanName} vlan-id ${vlanId}`;
    default:
      throw new AppError(
        `Automatic VLAN creation is not configured for ${device.vendor} ${device.platform || device.model || 'switch'}; add a vlanCreate command override`,
        400
      );
  }
}

function describeDevice(device, vlanId, vlanName) {
  try {
    return {
      deviceId: String(device._id),
      name: device.name,
      host: device.host,
      vendor: device.vendor,
      platform: device.platform || device.model || '',
      supported: true,
      config: buildSiteVlanConfig(device, vlanId, vlanName),
    };
  } catch (error) {
    return {
      deviceId: String(device._id),
      name: device.name,
      host: device.host,
      vendor: device.vendor,
      platform: device.platform || device.model || '',
      supported: false,
      message: error.message,
    };
  }
}

export async function previewSiteVlan(site, requestedVlanId, requestedVlanName = '') {
  const siteName = String(site ?? '').trim();
  if (!siteName) throw new AppError('Select a site before previewing VLAN creation', 400);
  const vlanId = validateVlanId(requestedVlanId);
  const vlanName = normalizeVlanName(vlanId, requestedVlanName);
  const switches = await Device.find({ site: siteName, deviceType: 'switch' })
    .select(SITE_SWITCH_FIELDS)
    .sort({ name: 1 });
  const devices = switches.map((device) => describeDevice(device, vlanId, vlanName));
  return {
    site: siteName,
    vlanId,
    vlanName,
    total: devices.length,
    canCreate: devices.length > 0 && devices.every((device) => device.supported),
    devices,
  };
}

export default { buildSiteVlanConfig, previewSiteVlan };