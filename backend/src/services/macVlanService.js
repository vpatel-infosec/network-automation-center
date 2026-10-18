import Device from '../models/Device.js';
import { resolveDriver } from '../drivers/index.js';
import { withDeviceSession } from './deviceConnection.js';
import { SECRET_FIELDS } from './credentialService.js';
import { audit } from './auditService.js';
import runPool from '../utils/asyncPool.js';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';

const DEVICE_FIELDS = `name host vendor deviceType platform model driver protocol credential ${SECRET_FIELDS}`;
const PORT_RE = /\b(?:Eth(?:ernet)?|Gi(?:gabitEthernet)?|Fa(?:stEthernet)?|Te(?:nGigabitEthernet)?|Twe|Fo|Hu|Po(?:rt-channel)?|TwentyFiveGigE|FortyGigabitEthernet|HundredGigE)\S+|\b(?:ge|xe|et|ae)-[\w./-]+|\b\d+\/\d+(?:\/\d+)?|\b[A-Z]\d+(?:-[A-Z]\d+)?|\bTrk\d+\b/gi;

export function normalizeMac(value) {
  const normalized = String(value ?? '').replace(/[.:-]/g, '').trim().toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(normalized)) {
    throw new AppError('Enter a valid 48-bit MAC address', 400);
  }
  return normalized;
}

function formatMac(mac, separator) {
  if (separator === '.') return `${mac.slice(0, 4)}.${mac.slice(4, 8)}.${mac.slice(8)}`;
  return mac.match(/.{2}/g).join(separator);
}

export function parseMacPorts(output, macAddress) {
  const mac = normalizeMac(macAddress);
  const ports = new Set();
  for (const line of String(output ?? '').split(/\r?\n/)) {
    if (normalizeLine(line).includes(mac)) {
      const matches = line.match(new RegExp(PORT_RE.source, 'gi')) || [];
      for (const port of matches) ports.add(port);
    }
  }
  return [...ports];
}

function normalizeLine(value) {
  return String(value).replace(/[.:-]/g, '').toLowerCase();
}

function customCommand(device, key, mac) {
  const value = device.commandOverrides?.[key];
  if (!value || !String(value).trim()) return null;
  return String(value).trim().replaceAll('{{mac}}', formatMac(mac, ':'));
}

export function getMacLookupCommand(device, macAddress) {
  const mac = normalizeMac(macAddress);
  const override = customCommand(device, 'macLookup', mac);
  if (override) return override;

  switch (resolveDriver(device).id) {
    case 'cisco_ios':
    case 'cisco_nxos':
      return `show mac address-table address ${formatMac(mac, '.')}`;
    case 'aruba_os':
      return /\b(?:cx|arubaos-cx)\b/i.test(`${device.platform || ''} ${device.model || ''}`)
        ? `show mac-address-table address ${formatMac(mac, ':')}`
        : `show mac-address ${formatMac(mac, ':')}`;
    case 'juniper':
      return `show ethernet-switching table | match ${formatMac(mac, ':')}`;
    case 'ubiquiti':
      return 'show mac-addr-table';
    default:
      throw new AppError('No MAC lookup command is configured for this switch', 400);
  }
}

function validatePort(port) {
  const value = String(port ?? '').trim();
  if (!value || value.length > 64 || /[\s;|<>\r\n]/.test(value)) {
    throw new AppError('The discovered interface name is not safe to use', 400);
  }
  return value;
}

export function buildVlanConfig(device, port, vlan) {
  const interfaceName = validatePort(port);
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
    throw new AppError('VLAN must be an integer from 1 to 4094', 400);
  }

  const custom = device.commandOverrides?.vlanAssignment;
  if (custom && String(custom).trim()) {
    return String(custom)
      .trim()
      .replaceAll('{{interface}}', interfaceName)
      .replaceAll('{{vlan}}', String(vlan));
  }

  switch (resolveDriver(device).id) {
    case 'cisco_ios':
    case 'cisco_nxos':
      return `interface ${interfaceName}\n shutdown\n switchport access vlan ${vlan}\n no shutdown`;
    case 'aruba_os':
      if (/\b(?:cx|arubaos-cx)\b/i.test(`${device.platform || ''} ${device.model || ''}`)) {
        return `interface ${interfaceName}\n shutdown\n vlan access ${vlan}\n no shutdown`;
      }
      break;
    case 'ubiquiti':
      return `interface ${interfaceName}\n shutdown\n switchport access vlan ${vlan}\n no shutdown\n exit`;
    default:
      break;
  }
  throw new AppError(
    `VLAN assignment is not supported for ${device.vendor} ${device.platform || device.model || 'switch'}; configure a vlanAssignment command override to enable it`,
    400
  );
}

function toDeviceResult(device, status, extra = {}) {
  return {
    deviceId: String(device._id),
    deviceName: device.name,
    host: device.host,
    vendor: device.vendor,
    platform: device.platform || device.model || '',
    status,
    ...extra,
  };
}

async function lookupOnDevice(device, mac) {
  if (!device.credential) {
    return toDeviceResult(device, 'failed', { message: 'No credential is assigned' });
  }
  try {
    const command = getMacLookupCommand(device, mac);
    const output = await withDeviceSession(device, device.credential, async (session, driver) => {
      if (typeof driver.runCommands !== 'function') {
        throw new AppError(`Driver "${driver.id}" does not support CLI MAC lookup`, 400);
      }
      const results = await driver.runCommands(session, { device }, [command]);
      const result = results[0];
      if (!result?.ok) throw new AppError(result?.error || 'MAC lookup command failed', 502);
      return result.output;
    });
    const ports = parseMacPorts(output, mac);
    if (!ports.length) return toDeviceResult(device, 'not_found', { message: 'MAC not present in the switch table' });
    return toDeviceResult(device, ports.length === 1 ? 'found' : 'ambiguous', { ports });
  } catch (error) {
    const status = /No MAC lookup command|does not support CLI MAC lookup/i.test(error.message)
      ? 'unsupported'
      : 'failed';
    return toDeviceResult(device, status, { message: error.message });
  }
}

export async function searchMacInSite(site, macAddress) {
  const siteName = String(site ?? '').trim();
  if (!siteName) throw new AppError('Select a site before searching', 400);
  const mac = normalizeMac(macAddress);
  const devices = await Device.find({ site: siteName, deviceType: 'switch' })
    .select(DEVICE_FIELDS)
    .populate({ path: 'credential', select: `name username ${SECRET_FIELDS}` })
    .sort({ name: 1 });
  const results = await runPool(devices, config.jobConcurrency, (device) => lookupOnDevice(device, mac));
  const matches = results.filter((result) => result.status === 'found' || result.status === 'ambiguous');
  return { site: siteName, macAddress: formatMac(mac, ':'), scanned: devices.length, results, matches };
}

export async function assignVlan({ site, deviceId, macAddress, port, vlan }, user) {
  const siteName = String(site ?? '').trim();
  const mac = normalizeMac(macAddress);
  const interfaceName = validatePort(port);
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
    throw new AppError('VLAN must be an integer from 1 to 4094', 400);
  }

  const device = await Device.findOne({ _id: deviceId, site: siteName, deviceType: 'switch' })
    .select(DEVICE_FIELDS)
    .populate({ path: 'credential', select: `name username ${SECRET_FIELDS}` });
  if (!device) throw new AppError('The selected switch is not in the selected site', 404);
  if (!device.credential) throw new AppError('The selected switch has no credential assigned', 400);

  const configText = buildVlanConfig(device, interfaceName, vlan);
  let changeResult;
  try {
    changeResult = await withDeviceSession(device, device.credential, async (session, driver) => {
      const lookupCommand = getMacLookupCommand(device, mac);
      if (typeof driver.runCommands !== 'function') {
        throw new AppError(`Driver "${driver.id}" does not support CLI MAC lookup`, 400);
      }
      const lookup = await driver.runCommands(session, { device }, [lookupCommand]);
      if (!lookup[0]?.ok) throw new AppError(lookup[0]?.error || 'MAC revalidation failed', 502);
      const currentPorts = parseMacPorts(lookup[0].output, mac);
      if (currentPorts.length !== 1 || currentPorts[0] !== interfaceName) {
        throw new AppError('MAC location changed or is ambiguous; search again before assigning the VLAN', 409);
      }
      if (typeof driver.pushConfig !== 'function' || driver.supportsPush === false) {
        throw new AppError(`Driver "${driver.id}" does not support configuration changes`, 400);
      }
      const pushed = await driver.pushConfig(session, { device }, configText, { save: true });
      if (pushed.errors.length) {
        throw new AppError(`Switch rejected VLAN configuration: ${pushed.errors.join(' | ')}`, 502);
      }
      return pushed;
    });
  } catch (error) {
    await audit({
      user,
      action: 'device.vlan_assignment.failed',
      entity: 'device',
      entityId: device._id,
      details: { site: siteName, macAddress: formatMac(mac, ':'), port: interfaceName, vlan, error: error.message },
    });
    throw error;
  }

  await audit({
    user,
    action: 'device.vlan_assignment',
    entity: 'device',
    entityId: device._id,
    details: { site: siteName, macAddress: formatMac(mac, ':'), port: interfaceName, vlan },
  });
  return {
    deviceId: String(device._id),
    deviceName: device.name,
    host: device.host,
    macAddress: formatMac(mac, ':'),
    port: interfaceName,
    vlan,
    output: changeResult.output,
  };
}

export default { normalizeMac, parseMacPorts, getMacLookupCommand, buildVlanConfig, searchMacInSite, assignVlan };