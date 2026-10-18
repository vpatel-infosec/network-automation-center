import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import config from '../config/env.js';

let s3Client;

function safeSegment(value) {
  return String(value || 'device').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'device';
}

export function backupObjectKey(device, version) {
  return `${backupFolderKey(device)}/running-config-v${version.version}.cfg`;
}

export function startupObjectKey(device, version) {
  return `${backupFolderKey(device)}/startup-config-v${version.version}.cfg`;
}

export function backupFolderKey(device) {
  return `devices/${safeSegment(device.host)}_${safeSegment(device.name)}-${String(device._id)}`;
}

function getS3Client() {
  if (s3Client) return s3Client;
  const { accessKeyId, secretAccessKey, endpoint, region, forcePathStyle } = config.backupStorage.s3;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('Set both BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY, or use the server credential chain.');
  }
  s3Client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: forcePathStyle || Boolean(endpoint),
    credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
  });
  return s3Client;
}

async function storeOnFileServer(version, device) {
  const root = path.resolve(config.backupStorage.filePath);
  const relativeDirectory = backupFolderKey(device);
  const directory = path.resolve(root, relativeDirectory);
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Resolved backup path escaped the configured storage directory.');
  await fs.mkdir(directory, { recursive: true });
  const writeAtomic = async (filename, content) => {
    const destination = path.join(directory, filename);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return path.relative(root, destination).split(path.sep).join('/');
  };
  const key = await writeAtomic(`running-config-v${version.version}.cfg`, version.content);
  const startupKey = version.startupStatus === 'stored' && version.startupContent
    ? await writeAtomic(`startup-config-v${version.version}.cfg`, version.startupContent)
    : '';
  return { key, startupKey };
}

async function storeInS3(version, device) {
  const { bucket } = config.backupStorage.s3;
  const key = backupObjectKey(device, version);
  const client = getS3Client();
  const put = (objectKey, content, kind) => client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: content,
      ContentType: 'text/plain; charset=utf-8',
      Metadata: {
        device: safeSegment(device.name),
        version: String(version.version),
        artifact: kind,
        sha256: String(kind === 'running' ? version.hash || '' : version.startupHash || ''),
      },
    }));
  await put(key, version.content, 'running');
  const startupKey = version.startupStatus === 'stored' && version.startupContent
    ? startupObjectKey(device, version)
    : '';
  if (startupKey) await put(startupKey, version.startupContent, 'startup');
  return { key, startupKey };
}

export function getBackupStorageStatus() {
  const { filePath, s3 } = config.backupStorage;
  return {
    primary: 'MongoDB',
    fileServer: { enabled: Boolean(filePath) },
    cloud: {
      enabled: Boolean(s3.bucket),
      provider: 'S3-compatible',
      bucket: s3.bucket || '',
      region: s3.region,
      endpoint: s3.endpoint || '',
    },
  };
}

export async function mirrorBackupVersion(version, device) {
  const targets = [];
  if (config.backupStorage.filePath) {
    targets.push({ provider: 'file_server', store: () => storeOnFileServer(version, device) });
  }
  if (config.backupStorage.s3.bucket) {
    targets.push({ provider: 's3', store: () => storeInS3(version, device) });
  }

  const storage = await Promise.all(targets.map(async ({ provider, store }) => {
    try {
      const files = await store();
      return { provider, ...files, status: 'stored', storedAt: new Date(), error: '' };
    } catch (error) {
      return { provider, key: '', status: 'failed', error: error.message };
    }
  }));
  version.storage = storage;
  if (targets.length) await version.save();
  return storage;
}

export default { backupObjectKey, getBackupStorageStatus, mirrorBackupVersion };