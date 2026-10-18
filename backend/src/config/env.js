import 'dotenv/config';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

function resolveSecret(name, value, minLength = 16) {
  if (value && value.length >= minLength) return value;
  if (isProd) {
    throw new Error(
      `Environment variable ${name} must be set (min ${minLength} characters) when NODE_ENV=production`
    );
  }
  return '';
}

function resolveCredentialKey() {
  const raw = (process.env.CREDENTIAL_KEY || '').trim();
  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(
        'CREDENTIAL_KEY must be exactly 64 hex characters (32 bytes). Generate one with: npm run gen:key'
      );
    }
    return Buffer.from(raw, 'hex');
  }
  if (isProd) {
    throw new Error(
      'CREDENTIAL_KEY must be set when NODE_ENV=production. Generate one with: npm run gen:key'
    );
  }
  // Development-only deterministic fallback so credentials survive restarts.
  return crypto.scryptSync('nac-development-key', 'nac-development-salt', 32);
}

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  isProd,
  port: int(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/network_automation',
  jwtSecret:
    resolveSecret('JWT_SECRET', process.env.JWT_SECRET) || 'nac-development-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  credentialKey: resolveCredentialKey(),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  logLevel: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  jobConcurrency: Math.max(1, int(process.env.JOB_CONCURRENCY, 5)),
  backupStorage: {
    filePath: (process.env.BACKUP_FILE_STORAGE_PATH || '').trim(),
    s3: {
      bucket: (process.env.BACKUP_S3_BUCKET || '').trim(),
      region: (process.env.BACKUP_S3_REGION || 'us-east-1').trim(),
      endpoint: (process.env.BACKUP_S3_ENDPOINT || '').trim(),
      accessKeyId: (process.env.BACKUP_S3_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: String(process.env.BACKUP_S3_FORCE_PATH_STYLE || 'false') === 'true',
    },
  },
  restconf: {
    verifyTls: String(process.env.RESTCONF_VERIFY_TLS || 'false') === 'true',
  },
  ssh: {
    readyTimeoutMs: int(process.env.SSH_READY_TIMEOUT_MS, 20000),
    commandTimeoutMs: int(process.env.SSH_COMMAND_TIMEOUT_MS, 60000),
    longCommandTimeoutMs: int(process.env.SSH_LONG_COMMAND_TIMEOUT_MS, 180000),
  },
  admin: {
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
};

if (!isProd && (!process.env.JWT_SECRET || !process.env.CREDENTIAL_KEY)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[config] Development fallback secrets are in use. Set JWT_SECRET and CREDENTIAL_KEY before running in production.'
  );
}

export default config;
