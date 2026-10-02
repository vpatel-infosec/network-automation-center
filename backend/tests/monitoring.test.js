import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitoringSnapshot, buildListQuery } from '../src/services/deviceService.js';

test('buildListQuery accepts site and location filters', () => {
  const query = buildListQuery({ site: 'HQ', location: 'Floor-1' });

  assert.deepEqual(query, {
    site: 'HQ',
    location: 'Floor-1',
  });
});

test('buildMonitoringSnapshot groups online and offline devices by status', () => {
  const summary = buildMonitoringSnapshot([
    { name: 'Core-1', vendor: 'cisco', status: { reachable: true, lastCheckMessage: 'ok' } },
    { name: 'Core-2', vendor: 'cisco', status: { reachable: false, lastCheckMessage: 'timeout' } },
    { name: 'Edge-1', vendor: 'juniper', status: { reachable: true, lastCheckMessage: 'ok' } },
    { name: 'Edge-2', vendor: 'juniper', status: { reachable: false, lastCheckMessage: 'refused' } },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.online, 2);
  assert.equal(summary.offline, 2);
  assert.equal(summary.onlineDevices.length, 2);
  assert.equal(summary.offlineDevices.length, 2);
  assert.deepEqual(
    summary.byVendor.map((item) => ({ vendor: item.vendor, count: item.count })).sort((a, b) => a.vendor.localeCompare(b.vendor)),
    [
      { vendor: 'cisco', count: 2 },
      { vendor: 'juniper', count: 2 },
    ]
  );
});
