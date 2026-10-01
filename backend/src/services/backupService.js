import Device from '../models/Device.js';
import ConfigVersion from '../models/ConfigVersion.js';
import { resolveDriver } from '../drivers/index.js';
import { withDeviceSession } from './deviceConnection.js';
import { SECRET_FIELDS } from './credentialService.js';
import { normalizeForHash, truncate } from '../drivers/base.js';
import { sha256 } from '../utils/crypto.js';
import runPool from '../utils/asyncPool.js';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';
import { audit } from './auditService.js';

/** Load a device together with its (decrypted-ready) credential document. */
export async function loadDeviceForSession(deviceId) {
  const device = await Device.findById(deviceId).populate({
    path: 'credential',
    select: `name username ${SECRET_FIELDS}`,
  });
  if (!device) throw new AppError('Device not found', 404);
  if (!device.credential) throw new AppError(`Device ${device.name} has no credential assigned`, 400);
  return device;
}

export async function captureConfig(device) {
  const driver = resolveDriver(device);
  if (driver.supportsBackup === false) {
    throw new AppError(`Driver "${driver.id}" does not support configuration backups`, 400);
  }
  return withDeviceSession(device, device.credential, (session, drv) => drv.backup(session, { device }));
}

async function saveVersion({ device, content, hash, driver, trigger, user, note }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latest = await ConfigVersion.findOne({ device: device._id }).sort({ version: -1 }).select('version');
    const nextVersion = (latest?.version || 0) + 1;
    try {
      return await ConfigVersion.create({
        device: device._id,
        version: nextVersion,
        content,
        hash,
        size: Buffer.byteLength(content, 'utf8'),
        command: driver.commands?.backup?.[0] || device.commandOverrides?.backup || '',
        driverId: driver.id,
        trigger,
        note,
        createdBy: user?._id,
      });
    } catch (error) {
      if (error?.code === 11000 && attempt === 0) continue; // concurrent backup: retry once
      throw error;
    }
  }
  throw new AppError('Could not allocate a configuration version (concurrent backups of the same device)', 409);
}

/**
 * Backup a single device. A new ConfigVersion is only written when the
 * normalized content hash differs from the latest stored version.
 */
export async function backupDevice({ deviceId, user, trigger = 'manual', note = '', jobId = null }) {
  const device = await loadDeviceForSession(deviceId);
  const driver = resolveDriver(device);

  try {
    const content = await captureConfig(device);
    if (!String(content || '').trim()) throw new AppError(`Device ${device.name} returned an empty configuration`, 502);

    const hash = sha256(normalizeForHash(content));
    const latest = await ConfigVersion.findOne({ device: device._id }).sort({ version: -1 }).select('version hash');

    if (latest && latest.hash === hash) {
      device.status.lastBackupAt = new Date();
      device.status.lastBackupStatus = 'unchanged';
      device.status.lastBackupMessage = `No configuration change since v${latest.version}`;
      await device.save();
      return {
        deviceId: String(device._id),
        deviceName: device.name,
        status: 'unchanged',
        changed: false,
        version: latest.version,
        message: `No change (v${latest.version})`,
      };
    }

    const version = await saveVersion({ device, content, hash, driver, trigger, user, note });
    device.status.lastBackupAt = new Date();
    device.status.lastBackupStatus = 'success';
    device.status.lastBackupMessage = `Stored v${version.version} (${version.size} bytes)`;
    await device.save();
    await audit({
      user,
      action: 'config.backup',
      entity: 'device',
      entityId: device._id,
      details: { version: version.version, size: version.size, trigger, jobId },
    });
    return {
      deviceId: String(device._id),
      deviceName: device.name,
      status: 'success',
      changed: true,
      version: version.version,
      configVersionId: version._id,
      message: `Stored v${version.version}`,
    };
  } catch (error) {
    device.status.lastBackupAt = new Date();
    device.status.lastBackupStatus = 'failed';
    device.status.lastBackupMessage = truncate(error.message, 300);
    await device.save().catch(() => {});
    await audit({
      user,
      action: 'config.backup',
      entity: 'device',
      entityId: device._id,
      details: { failed: true, error: error.message, trigger, jobId },
    });
    throw error;
  }
}

/** Backup many devices with bounded concurrency; never rejects (runPool semantics). */
export async function backupMany({ deviceIds, user, trigger = 'job', onResult }) {
  return runPool(deviceIds, config.jobConcurrency, async (deviceId) => {
    const result = await backupDevice({ deviceId, user, trigger });
    if (onResult) onResult(result);
    return result;
  });
}

export default { loadDeviceForSession, captureConfig, backupDevice, backupMany };
