import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMac,
  parseMacPorts,
  getMacLookupCommand,
  buildVlanConfig,
} from '../src/services/macVlanService.js';

test('normalizes common MAC address formats and rejects invalid input', () => {
  assert.equal(normalizeMac('aabb.ccdd.eeff'), 'aabbccddeeff');
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF'), 'aabbccddeeff');
  assert.throws(() => normalizeMac('not-a-mac'), /valid 48-bit MAC/);
});

test('finds matching Cisco and Juniper switch interfaces from table output', () => {
  assert.deepEqual(
    parseMacPorts('*  20  aabb.ccdd.eeff  DYNAMIC  Gi1/0/12', 'aa:bb:cc:dd:ee:ff'),
    ['Gi1/0/12']
  );
  assert.deepEqual(
    parseMacPorts('aa:bb:cc:dd:ee:ff  default  20  ge-0/0/7.0', 'aabb.ccdd.eeff'),
    ['ge-0/0/7.0']
  );
  assert.deepEqual(parseMacPorts('no matching entries', 'aa:bb:cc:dd:ee:ff'), []);
});

test('builds a normalized lookup and a shut-change-no-shut config for Cisco IOS', () => {
  const device = { driver: 'cisco_ios', vendor: 'cisco' };
  assert.equal(
    getMacLookupCommand(device, 'aa:bb:cc:dd:ee:ff'),
    'show mac address-table address aabb.ccdd.eeff'
  );
  assert.equal(
    buildVlanConfig(device, 'Gi1/0/12', 120),
    'interface Gi1/0/12\n shutdown\n switchport access vlan 120\n no shutdown'
  );
});

test('uses Aruba CX access VLAN syntax and rejects unsafe ports and VLANs', () => {
  const device = { driver: 'aruba_os', vendor: 'aruba', platform: 'ArubaOS-CX' };
  assert.equal(
    buildVlanConfig(device, '1/1/12', 20),
    'interface 1/1/12\n shutdown\n vlan access 20\n no shutdown'
  );
  assert.throws(() => buildVlanConfig(device, '1/1/12; reload', 20), /interface name is not safe/);
  assert.throws(() => buildVlanConfig(device, '1/1/12', 4095), /1 to 4094/);
});