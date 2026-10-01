import test from 'node:test';
import assert from 'node:assert/strict';
import { drivers, resolveDriver, resolveDriverId, driverCatalog } from '../src/drivers/index.js';

test('driver registry exposes every driver referenced by the Device model', () => {
  const ids = Object.keys(drivers);
  assert.deepEqual(ids.sort(), [
    'aruba_os',
    'cisco_ios',
    'cisco_nxos',
    'cisco_restconf',
    'cisco_wlc',
    'generic_ssh',
    'juniper',
    'ubiquiti',
  ]);
});

test('resolveDriverId auto-selects per vendor and device type', () => {
  assert.equal(resolveDriverId({ vendor: 'cisco', deviceType: 'switch', driver: 'auto', protocol: 'ssh' }), 'cisco_ios');
  assert.equal(resolveDriverId({ vendor: 'cisco', deviceType: 'wlc', driver: 'auto', protocol: 'ssh' }), 'cisco_wlc');
  assert.equal(resolveDriverId({ vendor: 'aruba', deviceType: 'switch', driver: 'auto', protocol: 'ssh' }), 'aruba_os');
  assert.equal(resolveDriverId({ vendor: 'juniper', deviceType: 'switch', driver: 'auto', protocol: 'ssh' }), 'juniper');
  assert.equal(resolveDriverId({ vendor: 'ubiquiti', deviceType: 'access_point', driver: 'auto', protocol: 'ssh' }), 'ubiquiti');
  assert.equal(resolveDriverId({ vendor: 'acme', deviceType: 'switch', driver: 'auto', protocol: 'ssh' }), 'generic_ssh');
  assert.equal(resolveDriverId({ vendor: 'cisco', deviceType: 'switch', driver: 'auto', protocol: 'restconf' }), 'cisco_restconf');
});

test('an explicit driver always wins over auto-detection', () => {
  assert.equal(resolveDriverId({ vendor: 'cisco', deviceType: 'wlc', driver: 'cisco_ios', protocol: 'ssh' }), 'cisco_ios');
});

test('resolveDriver returns the driver object and rejects unknown ids', () => {
  const driver = resolveDriver({ vendor: 'cisco', deviceType: 'switch', driver: 'auto', protocol: 'ssh' });
  assert.equal(driver.id, 'cisco_ios');
  assert.equal(typeof driver.backup, 'function');
  assert.equal(typeof driver.pushConfig, 'function');
  assert.throws(
    () => resolveDriver({ name: 'SW1', vendor: 'cisco', deviceType: 'switch', driver: 'nope', protocol: 'ssh' }),
    /Unknown driver/
  );
});

test('every SSH driver implements the full interface used by the job runner', () => {
  for (const [id, driver] of Object.entries(drivers)) {
    assert.equal(typeof driver.identify, 'function', `${id} identify`);
    assert.equal(typeof driver.backup, 'function', `${id} backup`);
    if (driver.supportsPush !== false) {
      assert.equal(typeof driver.runCommands, 'function', `${id} runCommands`);
      assert.equal(typeof driver.pushConfig, 'function', `${id} pushConfig`);
    }
    if (driver.protocol === 'ssh') {
      assert.ok(driver.prompt instanceof RegExp, `${id} prompt regex`);
      assert.equal(typeof driver.prepare, 'function', `${id} prepare`);
    }
  }
});

test('driverCatalog is UI friendly', () => {
  const catalog = driverCatalog();
  assert.equal(catalog.length, 8);
  const ciscoWlc = catalog.find((entry) => entry.id === 'cisco_wlc');
  assert.equal(ciscoWlc.protocol, 'ssh');
  assert.equal(ciscoWlc.supportsPush, true);
  const restconf = catalog.find((entry) => entry.id === 'cisco_restconf');
  assert.equal(restconf.supportsPush, false);
});
