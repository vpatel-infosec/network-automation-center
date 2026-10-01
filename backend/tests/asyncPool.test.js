import test from 'node:test';
import assert from 'node:assert/strict';
import { runPool } from '../src/utils/asyncPool.js';

test('runPool returns fulfilled results in input order', async () => {
  const results = await runPool([1, 2, 3, 4], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, (5 - value) * 5));
    return value * 2;
  });

  assert.deepEqual(
    results.map((item) => item.status),
    ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']
  );
  assert.deepEqual(results.map((item) => item.value), [2, 4, 6, 8]);
});

test('runPool never rejects: one failure does not abort the rest', async () => {
  const results = await runPool([1, 2, 3], 2, async (value) => {
    if (value === 2) throw new Error('device unreachable');
    return value;
  });

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /unreachable/);
  assert.equal(results[2].status, 'fulfilled');
});

test('runPool respects the concurrency limit', async () => {
  let active = 0;
  let peak = 0;

  await runPool(Array.from({ length: 10 }, (_, index) => index), 3, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return true;
  });

  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.ok(peak > 1, 'expected the pool to run more than one task at a time');
});

test('runPool handles an empty list', async () => {
  assert.deepEqual(await runPool([], 4, async () => 1), []);
});
