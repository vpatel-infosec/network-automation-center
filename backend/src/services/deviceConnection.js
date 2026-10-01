import { SshConnection } from './ssh.js';
import { RestconfSession } from './restconf.js';
import { resolveDriver } from '../drivers/index.js';
import { resolvePrompt } from '../drivers/base.js';
import { decrypt } from '../utils/crypto.js';

/** Decrypt a credential document (must be loaded with the secret fields selected). */
export function plainCredential(credential) {
  return {
    username: credential.username,
    password: decrypt(credential.passwordEnc),
    enablePassword: decrypt(credential.enablePasswordEnc),
    privateKey: decrypt(credential.sshPrivateKeyEnc),
    passphrase: decrypt(credential.sshPassphraseEnc),
  };
}

export async function openSession(device, credential) {
  const driver = resolveDriver(device);
  const plain = plainCredential(credential);

  if (driver.protocol === 'restconf') {
    return {
      driver,
      credential: plain,
      session: new RestconfSession({
        host: device.host,
        port: device.port || 443,
        username: plain.username,
        password: plain.password,
        name: device.name,
      }),
    };
  }

  const conn = new SshConnection({
    host: device.host,
    port: device.port || 22,
    username: plain.username,
    password: plain.password,
    privateKey: plain.privateKey || undefined,
    passphrase: plain.passphrase || undefined,
    prompt: resolvePrompt(device, driver),
    name: device.name,
  });
  await conn.connect();
  return { driver, credential: plain, session: conn };
}

/**
 * Open a session, let the driver prepare it (enable mode, disable paging) and
 * run `handler(session, driver, meta)`. The session is always closed afterwards,
 * also when the handler throws.
 */
export async function withDeviceSession(device, credential, handler) {
  const { driver, session, credential: plain } = await openSession(device, credential);
  const startedAt = Date.now();
  try {
    if (driver.protocol === 'ssh' && typeof driver.prepare === 'function') {
      await driver.prepare(session, { device, credential: plain });
    }
    return await handler(session, driver, { latencyMs: Date.now() - startedAt });
  } finally {
    try { session.close(); } catch { /* noop */ }
  }
}

export default withDeviceSession;
