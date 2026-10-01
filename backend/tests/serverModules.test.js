import test from 'node:test';
import assert from 'node:assert/strict';

// These modules are only loaded by server.js (the API smoke test boots app.js
// instead), so importing them here guards against broken relative paths in the
// production entry-point chain.
test('server-side modules import cleanly', async () => {
  const socket = await import('../src/socket.js');
  assert.equal(typeof socket.initSocket, 'function');

  const bus = await import('../src/socketBus.js');
  assert.equal(typeof bus.emitJobUpdate, 'function');

  const scheduler = await import('../src/services/schedulerService.js');
  assert.equal(typeof scheduler.reloadAll, 'function');
  assert.equal(typeof scheduler.validateCron, 'function');
  assert.ok(scheduler.validateCron('0 2 * * *'));
  assert.equal(scheduler.validateCron('not a cron'), false);
});
