import os from 'node:os';
import Device from '../models/Device.js';
import Credential from '../models/Credential.js';
import { withDeviceSession, plainCredential } from './deviceConnection.js';
import { SshConnection, enterEnableMode } from './ssh.js';
import { decrypt } from '../utils/crypto.js';
import AppError from '../utils/AppError.js';

const normalizeName = (value = '') => String(value ?? '').trim().replace(/\.$/, '').toLowerCase();
const normalizeInterface = (value = '') => String(value ?? '').trim().replace(/\s+/g, ' ');

function pushNeighbor(list, current, protocol) {
  if (!current || !current.device || !current.remoteDevice || !current.localInterface || !current.remoteInterface) {
    return;
  }
  list.push({
    device: String(current.device).trim(),
    remoteDevice: String(current.remoteDevice).trim(),
    localInterface: normalizeInterface(current.localInterface),
    remoteInterface: normalizeInterface(current.remoteInterface),
    protocol,
  });
}

export function parseCdpNeighbors(output, deviceName = '') {
  const neighbors = [];
  let current = null;
  const lines = String(output ?? '').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const deviceMatch = line.match(/^Device ID:\s*(.+)$/i);
    if (deviceMatch) {
      pushNeighbor(neighbors, current, 'cdp');
      current = { device: deviceName, remoteDevice: deviceMatch[1].trim(), localInterface: '', remoteInterface: '' };
      continue;
    }

    if (!current) continue;

    const interfaceMatch = line.match(/^Interface:\s*(.+?),\s*Port ID \(outgoing port\):\s*(.+)$/i);
    if (interfaceMatch) {
      current.localInterface = interfaceMatch[1].trim();
      current.remoteInterface = interfaceMatch[2].trim();
      continue;
    }

    const localMatch = line.match(/^Local Intrfce\s*:\s*(.+?),\s*Port ID \(outgoing port\):\s*(.+)$/i);
    if (localMatch) {
      current.localInterface = localMatch[1].trim();
      current.remoteInterface = localMatch[2].trim();
      continue;
    }

    const portMatch = line.match(/^Port ID \(outgoing port\):\s*(.+)$/i);
    if (portMatch && current.localInterface && !current.remoteInterface) {
      current.remoteInterface = portMatch[1].trim();
    }
  }

  pushNeighbor(neighbors, current, 'cdp');
  return neighbors.filter((neighbor) => neighbor.remoteDevice && neighbor.localInterface && neighbor.remoteInterface);
}

export function parseLldpNeighbors(output, deviceName = '') {
  const neighbors = [];
  let current = null;
  const lines = String(output ?? '').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-+]{3,}$/.test(line)) continue;

    const localMatch = line.match(/^Local\s+Intf(?:ace)?\s*:\s*(.+)$/i);
    if (localMatch) {
      pushNeighbor(neighbors, current, 'lldp');
      current = { device: deviceName, remoteDevice: '', localInterface: localMatch[1].trim(), remoteInterface: '' };
      continue;
    }

    if (!current) continue;

    const deviceMatch = line.match(/^System Name\s*:\s*(.+)$/i) || line.match(/^Device ID\s*:\s*(.+)$/i) || line.match(/^Chassis id\s*:\s*(.+)$/i);
    if (deviceMatch) {
      current.remoteDevice = deviceMatch[1].trim();
      continue;
    }

    const portMatch = line.match(/^Port\s+ID\s*:\s*(.+)$/i) || line.match(/^Port id\s*:\s*(.+)$/i);
    if (portMatch) {
      current.remoteInterface = portMatch[1].trim();
      continue;
    }

    const localPortMatch = line.match(/^Port\s+Description\s*:\s*(.+)$/i);
    if (localPortMatch && !current.remoteInterface) {
      current.remoteInterface = localPortMatch[1].trim();
    }
  }

  pushNeighbor(neighbors, current, 'lldp');
  return neighbors.filter((neighbor) => neighbor.remoteDevice && neighbor.localInterface && neighbor.remoteInterface);
}

export function buildTopologyGraph(devices = [], neighbors = []) {
  const nodes = new Map();
  const links = new Map();

  for (const device of devices) {
    const id = String(device.name || device.host || device._id).trim();
    if (!id) continue;
    nodes.set(normalizeName(id), {
      id,
      label: device.name || device.host || 'Unknown',
      host: device.host || '',
      vendor: device.vendor || 'generic',
      deviceType: device.deviceType || 'other',
      reachable: Boolean(device.status?.reachable),
    });
  }

  for (const neighbor of neighbors) {
    const sourceName = String(neighbor.device || '').trim();
    const targetName = String(neighbor.remoteDevice || '').trim();
    if (!sourceName || !targetName) continue;

    const pair = [sourceName, targetName].sort((left, right) => left.localeCompare(right));
    const interfaceKey = `${normalizeInterface(neighbor.localInterface)}|${normalizeInterface(neighbor.remoteInterface)}`;
    const key = `${pair[0]}|${pair[1]}|${interfaceKey}`;

    const existing = links.get(key) || {
      id: key,
      sourceDevice: sourceName,
      targetDevice: targetName,
      localInterface: normalizeInterface(neighbor.localInterface),
      remoteInterface: normalizeInterface(neighbor.remoteInterface),
      protocols: new Set(),
    };

    existing.protocols.add(String(neighbor.protocol || 'unknown').toLowerCase());
    if (!existing.localInterface && neighbor.localInterface) existing.localInterface = normalizeInterface(neighbor.localInterface);
    if (!existing.remoteInterface && neighbor.remoteInterface) existing.remoteInterface = normalizeInterface(neighbor.remoteInterface);

    links.set(key, existing);

    nodes.set(normalizeName(sourceName), {
      id: sourceName,
      label: sourceName,
      host: '',
      vendor: 'unknown',
      deviceType: 'other',
      reachable: false,
    });

    nodes.set(normalizeName(targetName), {
      id: targetName,
      label: targetName,
      host: '',
      vendor: 'unknown',
      deviceType: 'other',
      reachable: false,
    });
  }

  const nodeList = Array.from(nodes.values()).map((node) => ({
    ...node,
    id: node.id,
    color: node.vendor === 'cisco' ? '#38bdf8' : node.vendor === 'aruba' ? '#34d399' : '#a5b4fc',
  }));

  const linkList = Array.from(links.values()).map((link) => {
    const protocols = Array.from(link.protocols).sort();
    return {
      id: link.id,
      sourceDevice: link.sourceDevice,
      targetDevice: link.targetDevice,
      localInterface: link.localInterface,
      remoteInterface: link.remoteInterface,
      protocols,
      protocol: protocols.length > 1 ? 'mixed' : protocols[0] || 'unknown',
    };
  });

  return {
    nodes: nodeList,
    links: linkList,
    protocols: Array.from(new Set(linkList.flatMap((link) => link.protocols))).sort(),
    generatedAt: new Date().toISOString(),
  };
}

export function expandTargetAddresses(ipAddress = '', ipRange = '') {
  const values = [];
  const addValue = (value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return;
    const match = trimmed.match(/^\d+\.\d+\.\d+\.\d+$/);
    if (match) values.push(trimmed);
  };

  if (ipAddress) {
    for (const part of String(ipAddress).split(',')) addValue(part.trim());
  }

  if (ipRange) {
    const raw = String(ipRange).trim();
    if (raw.includes('/')) {
      const parts = raw.split('/');
      const base = parts[0].trim();
      const prefix = Number.parseInt(parts[1], 10);
      if (base && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
        const [a, b, c, d] = base.split('.').map((segment) => Number.parseInt(segment, 10));
        if ([a, b, c, d].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
          let start = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
          const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
          const network = start & mask;
          const broadcast = network | (~mask >>> 0);
          for (let current = network + 1; current < broadcast; current += 1) {
            values.push(((current >>> 24) & 255) + '.' + ((current >>> 16) & 255) + '.' + ((current >>> 8) & 255) + '.' + (current & 255));
          }
        }
      }
    } else if (raw.includes('-')) {
      const [startValue, endValue] = raw.split('-').map((part) => part.trim());
      const start = startValue.split('.').map((segment) => Number.parseInt(segment, 10));
      const end = endValue.split('.').map((segment) => Number.parseInt(segment, 10));
      if (start.length === 4 && end.length === 4 && start.every((segment) => Number.isInteger(segment)) && end.every((segment) => Number.isInteger(segment))) {
        const startInt = start[0] * 16777216 + start[1] * 65536 + start[2] * 256 + start[3];
        const endInt = end[0] * 16777216 + end[1] * 65536 + end[2] * 256 + end[3];
        const from = Math.min(startInt, endInt);
        const to = Math.max(startInt, endInt);
        for (let current = from; current <= to; current += 1) {
          values.push(`${(current >>> 24) & 255}.${(current >>> 16) & 255}.${(current >>> 8) & 255}.${current & 255}`);
        }
      }
    } else {
      for (const part of raw.split(',')) addValue(part.trim());
    }
  }

  return Array.from(new Set(values.filter((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value))));
}

export async function verifyTopologyTargets({ ipAddress = '', ipRange = '', credentialId = '' }) {
  if (!credentialId) throw new AppError('A credential is required to verify a topology target', 400);
  const credential = await Credential.findById(credentialId).select('+passwordEnc +enablePasswordEnc +sshPrivateKeyEnc +sshPassphraseEnc');
  if (!credential) throw new AppError('Credential not found', 404);

  const targets = expandTargetAddresses(ipAddress, ipRange);
  if (!targets.length) throw new AppError('Provide at least one valid IP address or IP range to verify', 400);

  const plain = plainCredential(credential);
  const results = [];
  for (const host of targets) {
    try {
      const conn = new SshConnection({
        host,
        port: 22,
        username: plain.username,
        password: plain.password || undefined,
        privateKey: plain.privateKey || undefined,
        passphrase: plain.passphrase || undefined,
        name: host,
      });
      await conn.connect();
      conn.close();
      results.push({ host, reachable: true, status: 'ssh_ok' });
    } catch (error) {
      results.push({ host, reachable: false, status: 'ssh_failed', reason: error.message });
    }
  }

  const reachable = results.filter((result) => result.reachable).map((result) => result.host);
  const unreachable = results.filter((result) => !result.reachable).map((result) => ({ ip: result.host, reason: result.reason }));
  const message = reachable.length
    ? ''
    : 'Device is not reachable, please check connection';

  return {
    targetIp: ipAddress || '',
    targetRange: ipRange || '',
    totalTargets: targets.length,
    reachable,
    unreachable,
    verified: reachable.length > 0,
    results,
    message,
  };
}

export async function buildTopologyFromTargets({ ipAddress = '', ipRange = '', credentialId = '' }) {
  const verification = await verifyTopologyTargets({ ipAddress, ipRange, credentialId });
  if (!verification.reachable.length) {
    return { ...verification, nodes: [], links: [], protocols: [], generatedAt: new Date().toISOString() };
  }

  const credential = await Credential.findById(credentialId).select('+passwordEnc +enablePasswordEnc +sshPrivateKeyEnc +sshPassphraseEnc');
  const plain = plainCredential(credential);
  const deviceList = verification.reachable.map((host) => ({
    _id: host,
    name: host,
    host,
    vendor: 'generic',
    deviceType: 'switch',
    status: { reachable: true },
  }));

  const neighbors = [];
  for (const host of verification.reachable) {
    try {
      const conn = new SshConnection({
        host,
        port: 22,
        username: plain.username,
        password: plain.password || undefined,
        privateKey: plain.privateKey || undefined,
        passphrase: plain.passphrase || undefined,
        name: host,
      });
      await conn.connect();
      await enterEnableMode(conn, plain.enablePassword);

      for (const protocol of ['cdp', 'lldp']) {
        try {
          const command = protocol === 'cdp' ? 'show cdp neighbors detail' : 'show lldp neighbors detail';
          const output = await conn.runCommand(command, { timeout: 20000 });
          if (!output || !output.trim()) continue;
          const parsed = protocol === 'cdp' ? parseCdpNeighbors(output, host) : parseLldpNeighbors(output, host);
          neighbors.push(...parsed);
        } catch {
          // The device may not support the current protocol.
        }
      }

      conn.close();
    } catch {
      // Skip unreachable or unsupported hosts.
    }
  }

  return {
    ...verification,
    ...buildTopologyGraph(deviceList, neighbors),
  };
}

export async function discoverTopology(deviceIds = []) {
  const filters = Array.isArray(deviceIds) && deviceIds.length ? { _id: { $in: deviceIds } } : {};
  const devices = await Device.find(filters).populate('credential', 'name username passwordEnc enablePasswordEnc sshPrivateKeyEnc sshPassphraseEnc').sort({ name: 1 });

  const neighbors = [];
  for (const device of devices) {
    if (!device.credential) continue;

    for (const protocol of ['cdp', 'lldp']) {
      const command = protocol === 'cdp' ? 'show cdp neighbors detail' : 'show lldp neighbors detail';
      try {
        const output = await withDeviceSession(device, device.credential, async (session) => {
          try {
            return await session.runCommand(command, { timeout: 20000 });
          } catch (error) {
            return '';
          }
        });

        if (typeof output === 'string' && output.trim()) {
          const parsed = protocol === 'cdp' ? parseCdpNeighbors(output, device.name) : parseLldpNeighbors(output, device.name);
          neighbors.push(...parsed);
        }
      } catch {
        // Device may not support the protocol or the SSH session may fail.
      }
    }
  }

  return buildTopologyGraph(devices, neighbors);
}

export default {
  parseCdpNeighbors,
  parseLldpNeighbors,
  buildTopologyGraph,
  discoverTopology,
  expandTargetAddresses,
  verifyTopologyTargets,
  buildTopologyFromTargets,
};
