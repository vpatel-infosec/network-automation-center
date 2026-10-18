import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import config from '../src/config/env.js';
import { backupObjectKey, startupObjectKey, mirrorBackupVersion, getBackupStorageStatus } from '../src/services/backupStorageService.js';

test('backup object keys are versioned and keep device names inside one path segment', () => {
  const device = { _id: 'device-id', name: 'Core Switch', host: '192.0.2.10' };
  const version = { version: 7 };
  const runningKey = backupObjectKey(device, version);
  const startupKey = startupObjectKey(device, version);
  assert.equal(runningKey, 'devices/192.0.2.10_Core_Switch-device-id/running-config-v7.cfg');
  assert.equal(startupKey, 'devices/192.0.2.10_Core_Switch-device-id/startup-config-v7.cfg');
  assert.equal(runningKey.split('/').length, 3);
});

test('mirrors a configuration snapshot to the configured file-server directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nac-backups-'));
  const previousPath = config.backupStorage.filePath;
  const previousBucket = config.backupStorage.s3.bucket;
  config.backupStorage.filePath = root;
  config.backupStorage.s3.bucket = '';
  try {
    const version = {
      _id: 'version-id',
      version: 3,
      content: 'hostname access-01\n',
      startupContent: 'hostname access-01\nstartup\n',
      startupStatus: 'stored',
      hash: 'abc123',
      startupHash: 'def456',
      async save() {},
    };
    const device = { _id: 'device-id', name: 'access-01', host: '192.0.2.2' };
    const [result] = await mirrorBackupVersion(version, device);
    assert.equal(result.provider, 'file_server');
    assert.equal(result.status, 'stored');
    assert.equal(await fs.readFile(path.join(root, ...result.key.split('/')), 'utf8'), version.content);
    assert.equal(result.startupKey, 'devices/192.0.2.2_access-01-device-id/startup-config-v3.cfg');
    assert.equal(await fs.readFile(path.join(root, ...result.startupKey.split('/')), 'utf8'), version.startupContent);
    assert.equal(getBackupStorageStatus().fileServer.enabled, true);
  } finally {
    config.backupStorage.filePath = previousPath;
    config.backupStorage.s3.bucket = previousBucket;
    await fs.rm(root, { recursive: true, force: true });
  }
});