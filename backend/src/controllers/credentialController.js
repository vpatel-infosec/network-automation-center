import Credential from '../models/Credential.js';
import AppError from '../utils/AppError.js';
import { decrypt } from '../utils/crypto.js';
import {
  SECRET_FIELDS,
  listCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
} from '../services/credentialService.js';
import { audit } from '../services/auditService.js';

export async function list(req, res) {
  res.json({ items: await listCredentials() });
}

export async function get(req, res) {
  res.json({ credential: await getCredential(req.params.id) });
}

export async function create(req, res) {
  const credential = await createCredential(req.body, req.user);
  await audit({ user: req.user, action: 'credential.create', entity: 'credential', entityId: credential._id, details: { name: credential.name }, ip: req.ip });
  res.status(201).json({ credential });
}

export async function update(req, res) {
  const credential = await updateCredential(req.params.id, req.body);
  await audit({ user: req.user, action: 'credential.update', entity: 'credential', entityId: credential._id, details: { name: credential.name }, ip: req.ip });
  res.json({ credential });
}

export async function remove(req, res) {
  const credential = await deleteCredential(req.params.id);
  await audit({ user: req.user, action: 'credential.delete', entity: 'credential', entityId: credential._id, details: { name: credential.name }, ip: req.ip });
  res.json({ success: true });
}

/**
 * Admin-only helper that tries to decrypt every stored secret to prove that
 * CREDENTIAL_KEY still matches the data. Values are never returned.
 */
export async function verify(req, res) {
  const credential = await Credential.findById(req.params.id).select(SECRET_FIELDS);
  if (!credential) throw new AppError('Credential not found', 404);

  const results = {};
  for (const field of ['passwordEnc', 'enablePasswordEnc', 'sshPrivateKeyEnc', 'sshPassphraseEnc']) {
    if (!credential[field]) {
      results[field] = 'not set';
      continue;
    }
    try {
      decrypt(credential[field]);
      results[field] = 'ok';
    } catch (error) {
      results[field] = `unreadable: ${error.message}`;
    }
  }
  res.json({ name: credential.name, fields: results });
}

export default { list, get, create, update, remove, verify };
