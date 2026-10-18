import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteVlanConfig } from '../src/services/siteVlanService.js';

test('generates Cisco and Aruba VLAN creation config', () => {
  assert.equal(
    buildSiteVlanConfig({ driver: 'cisco_ios', vendor: 'cisco' }, 120, 'Office_Data'),
    'vlan 120\n name Office_Data'
  );
  assert.equal(
    buildSiteVlanConfig({ driver: 'aruba_os', vendor: 'aruba' }, 30),
    'vlan 30\n name VLAN_30'
  );
});

test('generates Juniper set-style VLAN config', () => {
  assert.equal(
    buildSiteVlanConfig({ driver: 'juniper', vendor: 'juniper' }, 220, 'Guest_Network'),
    'set vlans Guest_Network vlan-id 220'
  );
});

test('uses per-device command overrides and rejects unsafe VLAN input', () => {
  assert.equal(
    buildSiteVlanConfig({
      driver: 'generic_ssh',
      vendor: 'generic',
      commandOverrides: { vlanCreate: 'create vlan {{vlan}} name {{name}}' },
    }, 40, 'Lab'),
    'create vlan 40 name Lab'
  );
  assert.throws(() => buildSiteVlanConfig({ driver: 'cisco_ios', vendor: 'cisco' }, 4095), /1 to 4094/);
  assert.throws(() => buildSiteVlanConfig({ driver: 'cisco_ios', vendor: 'cisco' }, 20, 'bad name; reload'), /VLAN name/);
});

test('requires an override for switch platforms without a known creation syntax', () => {
  assert.throws(
    () => buildSiteVlanConfig({ driver: 'ubiquiti', vendor: 'ubiquiti' }, 55),
    /vlanCreate command override/
  );
});