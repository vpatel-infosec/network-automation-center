/**
 * Seeds 50 dummy devices (30 switches + 20 access points) across 4 sites
 * and generates a topology graph for demo purposes.
 *
 *   node scripts/seedDemoData.js          # seed demo data
 *   node scripts/seedDemoData.js --clear  # remove demo data first, then re-seed
 */
import logger from '../src/utils/logger.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import Device from '../src/models/Device.js';
import Credential from '../src/models/Credential.js';
import Topology from '../src/models/Topology.js';
import { encrypt } from '../src/utils/crypto.js';

const DEMO_TAG = 'demo-seed';

const SWITCHES = [
  // HQ (10 switches)
  { name: 'HQ-CORE-SW01', host: '10.10.0.1', vendor: 'cisco', model: 'Catalyst 9500-48Y', platform: 'IOS-XE', site: 'HQ', location: 'Rack A1, Floor 1', tags: ['core', 'production'] },
  { name: 'HQ-CORE-SW02', host: '10.10.0.2', vendor: 'cisco', model: 'Catalyst 9500-48Y', platform: 'IOS-XE', site: 'HQ', location: 'Rack A2, Floor 1', tags: ['core', 'production'] },
  { name: 'HQ-DIST-SW01', host: '10.10.1.1', vendor: 'cisco', model: 'Catalyst 9300-48P', platform: 'IOS-XE', site: 'HQ', location: 'Rack B1, Floor 2', tags: ['distribution'] },
  { name: 'HQ-DIST-SW02', host: '10.10.1.2', vendor: 'cisco', model: 'Catalyst 9300-48P', platform: 'IOS-XE', site: 'HQ', location: 'Rack B2, Floor 2', tags: ['distribution'] },
  { name: 'HQ-ACC-SW01', host: '10.10.2.1', vendor: 'cisco', model: 'Catalyst 9200-48P', platform: 'IOS-XE', site: 'HQ', location: 'Rack C1, Floor 3', tags: ['access'] },
  { name: 'HQ-ACC-SW02', host: '10.10.2.2', vendor: 'cisco', model: 'Catalyst 9200-48P', platform: 'IOS-XE', site: 'HQ', location: 'Rack C2, Floor 3', tags: ['access'] },
  { name: 'HQ-ACC-SW03', host: '10.10.2.3', vendor: 'cisco', model: 'Catalyst 9200-24T', platform: 'IOS-XE', site: 'HQ', location: 'Rack C3, Floor 4', tags: ['access'] },
  { name: 'HQ-ACC-SW04', host: '10.10.2.4', vendor: 'cisco', model: 'Catalyst 9200-24T', platform: 'IOS-XE', site: 'HQ', location: 'Rack C4, Floor 4', tags: ['access'] },
  { name: 'HQ-TOU-SW01', host: '10.10.3.1', vendor: 'cisco', model: 'Catalyst 9400-48X', platform: 'NX-OS', site: 'HQ', location: 'Rack D1, Floor 1', tags: ['tor', 'server'] },
  { name: 'HQ-TOU-SW02', host: '10.10.3.2', vendor: 'cisco', model: 'Catalyst 9400-48X', platform: 'NX-OS', site: 'HQ', location: 'Rack D2, Floor 1', tags: ['tor', 'server'] },

  // Branch-North (8 switches)
  { name: 'BN-CORE-SW01', host: '10.20.0.1', vendor: 'cisco', model: 'Catalyst 9300-24T', platform: 'IOS-XE', site: 'Branch-North', location: 'Rack A1', tags: ['core'] },
  { name: 'BN-DIST-SW01', host: '10.20.1.1', vendor: 'aruba', model: 'Aruba 6300M', platform: 'ArubaOS', site: 'Branch-North', location: 'Rack A1', tags: ['distribution'] },
  { name: 'BN-ACC-SW01', host: '10.20.2.1', vendor: 'aruba', model: 'Aruba 2930F-24G', platform: 'ArubaOS-CX', site: 'Branch-North', location: 'Floor 1, Rack B1', tags: ['access'] },
  { name: 'BN-ACC-SW02', host: '10.20.2.2', vendor: 'aruba', model: 'Aruba 2930F-24G', platform: 'ArubaOS-CX', site: 'Branch-North', location: 'Floor 1, Rack B2', tags: ['access'] },
  { name: 'BN-ACC-SW03', host: '10.20.2.3', vendor: 'aruba', model: 'Aruba 2930F-12G', platform: 'ArubaOS-CX', site: 'Branch-North', location: 'Floor 2, Rack B1', tags: ['access'] },
  { name: 'BN-ACC-SW04', host: '10.20.2.4', vendor: 'juniper', model: 'EX4400-48F', platform: 'Junos', site: 'Branch-North', location: 'Floor 2, Rack B2', tags: ['access'] },
  { name: 'BN-ACC-SW05', host: '10.20.2.5', vendor: 'juniper', model: 'EX4300-48T', platform: 'Junos', site: 'Branch-North', location: 'Floor 3, Rack B1', tags: ['access'] },
  { name: 'BN-EDGE-SW01', host: '10.20.3.1', vendor: 'cisco', model: 'Catalyst 9200-48P', platform: 'IOS-XE', site: 'Branch-North', location: 'MDF, Floor 1', tags: ['edge'] },

  // Branch-South (7 switches)
  { name: 'BS-CORE-SW01', host: '10.30.0.1', vendor: 'cisco', model: 'Catalyst 9300-48P', platform: 'IOS-XE', site: 'Branch-South', location: 'Rack A1', tags: ['core'] },
  { name: 'BS-DIST-SW01', host: '10.30.1.1', vendor: 'cisco', model: 'Catalyst 9300-24T', platform: 'IOS-XE', site: 'Branch-South', location: 'Rack A1', tags: ['distribution'] },
  { name: 'BS-ACC-SW01', host: '10.30.2.1', vendor: 'cisco', model: 'Catalyst 9200-48P', platform: 'IOS-XE', site: 'Branch-South', location: 'Floor 1, Rack B1', tags: ['access'] },
  { name: 'BS-ACC-SW02', host: '10.30.2.2', vendor: 'cisco', model: 'Catalyst 9200-24T', platform: 'IOS-XE', site: 'Branch-South', location: 'Floor 1, Rack B2', tags: ['access'] },
  { name: 'BS-ACC-SW03', host: '10.30.2.3', vendor: 'juniper', model: 'EX4400-24F', platform: 'Junos', site: 'Branch-South', location: 'Floor 2, Rack B1', tags: ['access'] },
  { name: 'BS-ACC-SW04', host: '10.30.2.4', vendor: 'juniper', model: 'EX4300-48T', platform: 'Junos', site: 'Branch-South', location: 'Floor 2, Rack B2', tags: ['access'] },
  { name: 'BS-TOU-SW01', host: '10.30.3.1', vendor: 'aruba', model: 'Aruba 6100DX', platform: 'ArubaOS', site: 'Branch-South', location: 'Server Room, Rack S1', tags: ['tor', 'server'] },

  // Data-Center (5 switches)
  { name: 'DC-CORE-SW01', host: '10.40.0.1', vendor: 'cisco', model: 'Catalyst 9500-96Q', platform: 'IOS-XE', site: 'Data-Center', location: 'Row A, Rack 1', tags: ['core', 'datacenter'] },
  { name: 'DC-CORE-SW02', host: '10.40.0.2', vendor: 'cisco', model: 'Catalyst 9500-96Q', platform: 'IOS-XE', site: 'Data-Center', location: 'Row A, Rack 2', tags: ['core', 'datacenter'] },
  { name: 'DC-TOU-SW01', host: '10.40.1.1', vendor: 'cisco', model: 'Catalyst 9400-48X', platform: 'NX-OS', site: 'Data-Center', location: 'Row B, Rack 1', tags: ['tor', 'server'] },
  { name: 'DC-TOU-SW02', host: '10.40.1.2', vendor: 'cisco', model: 'Catalyst 9400-48X', platform: 'NX-OS', site: 'Data-Center', location: 'Row B, Rack 2', tags: ['tor', 'server'] },
  { name: 'DC-DIST-SW01', host: '10.40.2.1', vendor: 'cisco', model: 'Catalyst 9300-48P', platform: 'IOS-XE', site: 'Data-Center', location: 'Row C, Rack 1', tags: ['distribution'] },
];

const ACCESS_POINTS = [
  // HQ (8 APs)
  { name: 'HQ-AP001', host: '10.10.10.1', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'HQ', location: 'Floor 1, Zone A', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP002', host: '10.10.10.2', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'HQ', location: 'Floor 1, Zone B', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP003', host: '10.10.10.3', vendor: 'cisco', model: 'Cisco 3802i', platform: 'WLC', site: 'HQ', location: 'Floor 2, Zone A', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP004', host: '10.10.10.4', vendor: 'cisco', model: 'Cisco 3802i', platform: 'WLC', site: 'HQ', location: 'Floor 2, Zone B', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP005', host: '10.10.10.5', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'HQ', location: 'Floor 3, Zone A', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP006', host: '10.10.10.6', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'HQ', location: 'Floor 4, Zone A', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP007', host: '10.10.10.7', vendor: 'cisco', model: 'Cisco 3802i', platform: 'WLC', site: 'HQ', location: 'Floor 4, Zone B', tags: ['wireless', 'hq'] },
  { name: 'HQ-AP008', host: '10.10.10.8', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'HQ', location: 'Floor 1, Cafeteria', tags: ['wireless', 'hq'] },

  // Branch-North (5 APs)
  { name: 'BN-AP001', host: '10.20.10.1', vendor: 'aruba', model: 'Aruba AP-535', platform: 'ArubaOS', site: 'Branch-North', location: 'Floor 1, Zone A', tags: ['wireless'] },
  { name: 'BN-AP002', host: '10.20.10.2', vendor: 'aruba', model: 'Aruba AP-535', platform: 'ArubaOS', site: 'Branch-North', location: 'Floor 1, Zone B', tags: ['wireless'] },
  { name: 'BN-AP003', host: '10.20.10.3', vendor: 'aruba', model: 'Aruba AP-555', platform: 'ArubaOS', site: 'Branch-North', location: 'Floor 2, Zone A', tags: ['wireless'] },
  { name: 'BN-AP004', host: '10.20.10.4', vendor: 'aruba', model: 'Aruba AP-535', platform: 'ArubaOS', site: 'Branch-North', location: 'Floor 2, Zone B', tags: ['wireless'] },
  { name: 'BN-AP005', host: '10.20.10.5', vendor: 'aruba', model: 'Aruba AP-555', platform: 'ArubaOS', site: 'Branch-North', location: 'Floor 3, Zone A', tags: ['wireless'] },

  // Branch-South (5 APs)
  { name: 'BS-AP001', host: '10.30.10.1', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'Branch-South', location: 'Floor 1, Zone A', tags: ['wireless'] },
  { name: 'BS-AP002', host: '10.30.10.2', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'Branch-South', location: 'Floor 1, Zone B', tags: ['wireless'] },
  { name: 'BS-AP003', host: '10.30.10.3', vendor: 'cisco', model: 'Cisco 3802i', platform: 'WLC', site: 'Branch-South', location: 'Floor 2, Zone A', tags: ['wireless'] },
  { name: 'BS-AP004', host: '10.30.10.4', vendor: 'cisco', model: 'Cisco 2802i', platform: 'WLC', site: 'Branch-South', location: 'Floor 2, Zone B', tags: ['wireless'] },
  { name: 'BS-AP005', host: '10.30.10.5', vendor: 'cisco', model: 'Cisco 3802i', platform: 'WLC', site: 'Branch-South', location: 'Floor 3, Zone A', tags: ['wireless'] },

  // Data-Center (2 APs)
  { name: 'DC-AP001', host: '10.40.10.1', vendor: 'ubiquiti', model: 'UniFi 6 Pro', platform: 'UniFi', site: 'Data-Center', location: 'Server Room', tags: ['wireless', 'datacenter'] },
  { name: 'DC-AP002', host: '10.40.10.2', vendor: 'ubiquiti', model: 'UniFi 6 LR', platform: 'UniFi', site: 'Data-Center', location: 'Loading Dock', tags: ['wireless', 'datacenter'] },
];

const TOPOLOGY_LINKS = [
  // HQ core pair
  { source: 'HQ-CORE-SW01', target: 'HQ-CORE-SW02', localIface: 'Te1/0/1', remoteIface: 'Te1/0/1', protocol: 'cdp' },
  // HQ core to distribution
  { source: 'HQ-CORE-SW01', target: 'HQ-DIST-SW01', localIface: 'Te1/0/2', remoteIface: 'Gi1/1/1', protocol: 'cdp' },
  { source: 'HQ-CORE-SW02', target: 'HQ-DIST-SW02', localIface: 'Te1/0/2', remoteIface: 'Gi1/1/1', protocol: 'cdp' },
  { source: 'HQ-CORE-SW01', target: 'HQ-DIST-SW02', localIface: 'Te1/0/3', remoteIface: 'Gi1/1/2', protocol: 'lldp' },
  { source: 'HQ-CORE-SW02', target: 'HQ-DIST-SW01', localIface: 'Te1/0/3', remoteIface: 'Gi1/1/2', protocol: 'lldp' },
  // HQ distribution to access
  { source: 'HQ-DIST-SW01', target: 'HQ-ACC-SW01', localIface: 'Gi1/0/10', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  { source: 'HQ-DIST-SW01', target: 'HQ-ACC-SW02', localIface: 'Gi1/0/11', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  { source: 'HQ-DIST-SW02', target: 'HQ-ACC-SW03', localIface: 'Gi1/0/10', remoteIface: 'Gi1/0/47', protocol: 'lldp' },
  { source: 'HQ-DIST-SW02', target: 'HQ-ACC-SW04', localIface: 'Gi1/0/11', remoteIface: 'Gi1/0/47', protocol: 'lldp' },
  // HQ core to ToR
  { source: 'HQ-CORE-SW01', target: 'HQ-TOU-SW01', localIface: 'Te1/0/4', remoteIface: 'Eth1/1', protocol: 'cdp' },
  { source: 'HQ-CORE-SW02', target: 'HQ-TOU-SW02', localIface: 'Te1/0/4', remoteIface: 'Eth1/1', protocol: 'cdp' },
  { source: 'HQ-TOU-SW01', target: 'HQ-TOU-SW02', localIface: 'Eth1/2', remoteIface: 'Eth1/2', protocol: 'lldp' },
  // HQ APs to access switches
  { source: 'HQ-ACC-SW01', target: 'HQ-AP001', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW01', target: 'HQ-AP002', localIface: 'Gi1/0/2', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW01', target: 'HQ-AP003', localIface: 'Gi1/0/3', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW02', target: 'HQ-AP004', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW02', target: 'HQ-AP005', localIface: 'Gi1/0/2', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW03', target: 'HQ-AP006', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW03', target: 'HQ-AP007', localIface: 'Gi1/0/2', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'HQ-ACC-SW04', target: 'HQ-AP008', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },

  // Branch-North: core to distribution
  { source: 'BN-CORE-SW01', target: 'BN-DIST-SW01', localIface: 'Gi1/0/1', remoteIface: '1/1/48', protocol: 'cdp' },
  // Branch-North: distribution to access
  { source: 'BN-DIST-SW01', target: 'BN-ACC-SW01', localIface: '1/1/1', remoteIface: '1/1/48', protocol: 'lldp' },
  { source: 'BN-DIST-SW01', target: 'BN-ACC-SW02', localIface: '1/1/2', remoteIface: '1/1/48', protocol: 'lldp' },
  { source: 'BN-DIST-SW01', target: 'BN-ACC-SW03', localIface: '1/1/3', remoteIface: '1/1/48', protocol: 'lldp' },
  { source: 'BN-DIST-SW01', target: 'BN-ACC-SW04', localIface: '1/1/4', remoteIface: 'ge-0/0/48', protocol: 'lldp' },
  { source: 'BN-DIST-SW01', target: 'BN-ACC-SW05', localIface: '1/1/5', remoteIface: 'ge-0/0/48', protocol: 'lldp' },
  { source: 'BN-DIST-SW01', target: 'BN-EDGE-SW01', localIface: '1/1/6', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  // Branch-North: core to HQ (uplink)
  { source: 'BN-CORE-SW01', target: 'HQ-CORE-SW01', localIface: 'Gi1/0/2', remoteIface: 'Te1/0/5', protocol: 'cdp' },
  // Branch-North APs
  { source: 'BN-ACC-SW01', target: 'BN-AP001', localIface: '1/1/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BN-ACC-SW01', target: 'BN-AP002', localIface: '1/1/2', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BN-ACC-SW02', target: 'BN-AP003', localIface: '1/1/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BN-ACC-SW03', target: 'BN-AP004', localIface: '1/1/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BN-ACC-SW04', target: 'BN-AP005', localIface: 'ge-0/0/1', remoteIface: 'eth0', protocol: 'lldp' },

  // Branch-South: core to distribution
  { source: 'BS-CORE-SW01', target: 'BS-DIST-SW01', localIface: 'Gi1/0/1', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  // Branch-South: distribution to access
  { source: 'BS-DIST-SW01', target: 'BS-ACC-SW01', localIface: 'Gi1/0/10', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  { source: 'BS-DIST-SW01', target: 'BS-ACC-SW02', localIface: 'Gi1/0/11', remoteIface: 'Gi1/0/47', protocol: 'cdp' },
  { source: 'BS-DIST-SW01', target: 'BS-ACC-SW03', localIface: 'Gi1/0/12', remoteIface: 'ge-0/0/48', protocol: 'lldp' },
  { source: 'BS-DIST-SW01', target: 'BS-ACC-SW04', localIface: 'Gi1/0/13', remoteIface: 'ge-0/0/48', protocol: 'lldp' },
  // Branch-South: core to ToR
  { source: 'BS-CORE-SW01', target: 'BS-TOU-SW01', localIface: 'Gi1/0/2', remoteIface: '1/1/48', protocol: 'cdp' },
  // Branch-South: core to HQ (uplink)
  { source: 'BS-CORE-SW01', target: 'HQ-CORE-SW02', localIface: 'Gi1/0/3', remoteIface: 'Te1/0/6', protocol: 'cdp' },
  // Branch-South APs
  { source: 'BS-ACC-SW01', target: 'BS-AP001', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BS-ACC-SW01', target: 'BS-AP002', localIface: 'Gi1/0/2', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BS-ACC-SW02', target: 'BS-AP003', localIface: 'Gi1/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BS-ACC-SW03', target: 'BS-AP004', localIface: 'ge-0/0/1', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'BS-ACC-SW04', target: 'BS-AP005', localIface: 'ge-0/0/2', remoteIface: 'eth0', protocol: 'lldp' },

  // Data-Center: core pair
  { source: 'DC-CORE-SW01', target: 'DC-CORE-SW02', localIface: 'Te1/1/1', remoteIface: 'Te1/1/1', protocol: 'cdp' },
  // Data-Center: core to ToR
  { source: 'DC-CORE-SW01', target: 'DC-TOU-SW01', localIface: 'Te1/1/2', remoteIface: 'Eth1/1', protocol: 'cdp' },
  { source: 'DC-CORE-SW02', target: 'DC-TOU-SW02', localIface: 'Te1/1/2', remoteIface: 'Eth1/1', protocol: 'cdp' },
  { source: 'DC-CORE-SW01', target: 'DC-TOU-SW02', localIface: 'Te1/1/3', remoteIface: 'Eth1/2', protocol: 'lldp' },
  { source: 'DC-CORE-SW02', target: 'DC-TOU-SW01', localIface: 'Te1/1/3', remoteIface: 'Eth1/2', protocol: 'lldp' },
  // Data-Center: core to distribution
  { source: 'DC-CORE-SW01', target: 'DC-DIST-SW01', localIface: 'Te1/1/4', remoteIface: 'Te1/1/1', protocol: 'cdp' },
  { source: 'DC-CORE-SW02', target: 'DC-DIST-SW01', localIface: 'Te1/1/4', remoteIface: 'Te1/1/2', protocol: 'lldp' },
  // Data-Center: core to HQ (uplink)
  { source: 'DC-CORE-SW01', target: 'HQ-CORE-SW01', localIface: 'Te1/1/5', remoteIface: 'Te1/0/7', protocol: 'cdp' },
  { source: 'DC-CORE-SW02', target: 'HQ-CORE-SW02', localIface: 'Te1/1/5', remoteIface: 'Te1/0/8', protocol: 'cdp' },
  // Data-Center APs
  { source: 'DC-TOU-SW01', target: 'DC-AP001', localIface: 'Eth1/3', remoteIface: 'eth0', protocol: 'lldp' },
  { source: 'DC-TOU-SW02', target: 'DC-AP002', localIface: 'Eth1/3', remoteIface: 'eth0', protocol: 'lldp' },
];

// Simulated reachability - 80% online, deterministic
function isReachable(index, total) {
  const offlineCount = Math.floor(total * 0.2);
  return index >= offlineCount;
}

async function main() {
  const clearFirst = process.argv.includes('--clear');
  const dryRun = process.argv.includes('--dry-run');
  await connectDb(5);

  const allNames = [...SWITCHES.map((d) => d.name), ...ACCESS_POINTS.map((d) => d.name)];

  // Ensure admin user exists for authentication
  const User = (await import('../src/models/User.js')).default;
  let admin = await User.findOne({ role: 'admin', active: true });
  if (!admin) {
    admin = await User.create({
      name: 'Administrator',
      email: 'admin@example.com',
      passwordHash: await User.hashPassword('AdminPass123!'),
      role: 'admin',
      active: true,
    });
    logger.info(`Created admin user: ${admin.email}`);
  }

  // Ensure credential exists
  let credential = await Credential.findOne({ name: 'Demo-Credential' });
  if (!credential) {
    credential = new Credential({
      name: 'Demo-Credential',
      description: 'Demo credential set for all dummy devices',
      username: 'netops',
      passwordEnc: encrypt('DemoPass123!'),
      enablePasswordEnc: encrypt('Enable123!'),
    });
    await credential.save();
    logger.info(`Created credential: ${credential.name}`);
  }

  if (clearFirst) {
    await Device.deleteMany({ name: { $in: allNames } });
    await Topology.deleteMany({ name: 'Demo Topology' });
    logger.info('Existing demo data cleared');
  }

  // Create devices
  logger.info(`Creating ${SWITCHES.length} switches and ${ACCESS_POINTS.length} access points...`);
  const deviceDocs = [];
  let idx = 0;

  for (const sw of SWITCHES) {
    const reachable = isReachable(idx, SWITCHES.length);
    deviceDocs.push({
      name: sw.name,
      host: sw.host,
      port: 22,
      vendor: sw.vendor,
      deviceType: 'switch',
      model: sw.model,
      platform: sw.platform,
      protocol: 'ssh',
      driver: 'auto',
      credential: credential._id,
      site: sw.site,
      location: sw.location,
      tags: [...sw.tags, DEMO_TAG],
      notes: `Demo device: ${sw.model}`,
      status: {
        reachable,
        lastCheckedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)),
        lastCheckMessage: reachable ? `OK - ${sw.platform}` : 'Connection timed out',
        latencyMs: reachable ? Math.floor(5 + Math.random() * 45) : undefined,
        lastBackupAt: reachable && idx % 3 === 0 ? new Date(Date.now() - Math.floor(Math.random() * 7200000)) : undefined,
        lastBackupStatus: reachable && idx % 3 === 0 ? (idx % 6 === 0 ? 'success' : 'unchanged') : 'never',
        lastBackupMessage: '',
      },
    });
    idx += 1;
  }

  for (const ap of ACCESS_POINTS) {
    const reachable = isReachable(idx, ACCESS_POINTS.length);
    deviceDocs.push({
      name: ap.name,
      host: ap.host,
      port: 22,
      vendor: ap.vendor,
      deviceType: 'access_point',
      model: ap.model,
      platform: ap.platform,
      protocol: 'ssh',
      driver: 'auto',
      credential: credential._id,
      site: ap.site,
      location: ap.location,
      tags: [...ap.tags, DEMO_TAG],
      notes: `Demo device: ${ap.model}`,
      status: {
        reachable,
        lastCheckedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)),
        lastCheckMessage: reachable ? `OK - ${ap.platform}` : 'Connection timed out',
        latencyMs: reachable ? Math.floor(5 + Math.random() * 60) : undefined,
        lastBackupAt: reachable && idx % 4 === 0 ? new Date(Date.now() - Math.floor(Math.random() * 7200000)) : undefined,
        lastBackupStatus: reachable && idx % 4 === 0 ? (idx % 8 === 0 ? 'success' : 'unchanged') : 'never',
        lastBackupMessage: '',
      },
    });
    idx += 1;
  }

  if (dryRun) {
    console.log(`\nDRY RUN: Would create ${deviceDocs.length} devices and ${TOPOLOGY_LINKS.length} topology links`);
    await disconnectDb();
    return;
  }

  await Device.insertMany(deviceDocs, { ordered: false });
  logger.info(`Created ${deviceDocs.length} devices`);

  // Build and save topology graph
  logger.info('Building topology graph...');
  const savedDevices = await Device.find({ name: { $in: allNames } });
  const nodeMap = new Map();
  const nodes = savedDevices.map((device) => {
    const node = {
      id: device.name,
      label: device.name,
      hostname: device.name,
      host: device.host,
      ipAddress: device.host,
      vendor: device.vendor,
      deviceType: device.deviceType,
      reachable: Boolean(device.status?.reachable),
      ports: [],
    };
    nodeMap.set(device.name, node);
    return node;
  });

  const links = TOPOLOGY_LINKS.map((link, i) => {
    const sourceNode = nodeMap.get(link.source);
    const targetNode = nodeMap.get(link.target);
    if (sourceNode) sourceNode.ports.push(link.localIface);
    if (targetNode) targetNode.ports.push(link.remoteIface);
    return {
      id: `demo-link-${i + 1}`,
      sourceDevice: link.source,
      targetDevice: link.target,
      localInterface: link.localIface,
      remoteInterface: link.remoteIface,
      protocols: [link.protocol],
      protocol: link.protocol,
    };
  });

  const protocols = Array.from(new Set(TOPOLOGY_LINKS.map((l) => l.protocol))).sort();
  for (const node of nodes) {
    node.ports = Array.from(new Set(node.ports)).filter(Boolean);
  }

  await Topology.findOneAndUpdate(
    { name: 'Demo Topology' },
    { name: 'Demo Topology', source: 'demo-seed', generatedAt: new Date().toISOString(), nodes, links, protocols },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  logger.info(`Topology saved: ${nodes.length} nodes, ${links.length} links, protocols: ${protocols.join(', ')}`);

  // Build summary
  const summaryDevices = await Device.find({ name: { $in: allNames } });
  const online = summaryDevices.filter((d) => d.status?.reachable).length;
  const offline = summaryDevices.length - online;
  const bySite = {};
  const byVendor = {};
  for (const d of summaryDevices) {
    bySite[d.site] = (bySite[d.site] || 0) + 1;
    byVendor[d.vendor] = (byVendor[d.vendor] || 0) + 1;
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  DEMO DATA SEED COMPLETE                              ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Total devices:      ${String(summaryDevices.length).padEnd(33)}║`);
  console.log(`║  Switches:           ${String(SWITCHES.length).padEnd(33)}║`);
  console.log(`║  Access Points:      ${String(ACCESS_POINTS.length).padEnd(33)}║`);
  console.log(`║  Online:             ${String(online).padEnd(33)}║`);
  console.log(`║  Offline:            ${String(offline).padEnd(33)}║`);
  console.log('╠──────────────────────────────────────────────────────╣');
  console.log('║  By Site:                                                  ║');
  for (const [site, count] of Object.entries(bySite).sort()) {
    console.log(`║    ${site.padEnd(14)} ${String(count).padEnd(27)}║`);
  }
  console.log('╠──────────────────────────────────────────────────────╣');
  console.log('║  By Vendor:                                               ║');
  for (const [vendor, count] of Object.entries(byVendor).sort()) {
    console.log(`║    ${vendor.padEnd(14)} ${String(count).padEnd(27)}║`);
  }
  console.log('╠──────────────────────────────────────────────────────╣');
  console.log('║  Topology:                                                  ║');
  console.log(`║    Links:            ${String(TOPOLOGY_LINKS.length).padEnd(25)}║`);
  console.log(`║    Protocols:        ${protocols.join(', ').padEnd(25)}║`);
  console.log('╠──────────────────────────────────────────────────────╣');
  console.log('║  View at: http://localhost:5173/topology             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  await disconnectDb();
}

main().catch(async (error) => {
  logger.error(`Seed failed: ${error.stack || error.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});


