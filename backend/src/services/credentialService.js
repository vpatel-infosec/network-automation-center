import Credential from '../models/Credential.js';
import Device from '../models/Device.js';
import AppError from '../utils/AppError.js';
import { encrypt } from '../utils/crypto.js';

/** Selecting the secrets lets toJSON() report hasPassword/hasEnablePassword/... */
export const SECRET_FIELDS = '+passwordEnc +enablePasswordEnc +sshPrivateKeyEnc +sshPassphraseEnc';

export async function listCredentials() {
  return Credential.find().select(SECRET_FIELDS).sort({ name: 1 });
}

export async function getCredential(id) {
  const doc = await Credential.findById(id).select(SECRET_FIELDS);
  if (!doc) throw new AppError('Credential not found', 404);
  return doc;
}

export async function createCredential(payload, user) {
  const doc = new Credential({
    name: payload.name,
    description: payload.description || '',
    username: payload.username,
    passwordEnc: encrypt(payload.password || ''),
    enablePasswordEnc: encrypt(payload.enablePassword || ''),
    sshPrivateKeyEnc: encrypt(payload.sshPrivateKey || ''),
    sshPassphraseEnc: encrypt(payload.sshPassphrase || ''),
    createdBy: user?._id,
  });
  await doc.save();
  return doc;
}

/**
 * Update a credential set. Secret fields are only replaced when a non-empty
 * value is supplied, so the UI can show "leave blank to keep current".
 */
export async function updateCredential(id, payload) {
  const doc = await getCredential(id);
  if (payload.name !== undefined) doc.name = payload.name;
  if (payload.description !== undefined) doc.description = payload.description;
  if (payload.username !== undefined) doc.username = payload.username;
  if (payload.password) doc.passwordEnc = encrypt(payload.password);
  if (payload.enablePassword) doc.enablePasswordEnc = encrypt(payload.enablePassword);
  if (payload.sshPrivateKey) doc.sshPrivateKeyEnc = encrypt(payload.sshPrivateKey);
  if (payload.sshPassphrase) doc.sshPassphraseEnc = encrypt(payload.sshPassphrase);
  await doc.save();
  return doc;
}

export async function deleteCredential(id) {
  const used = await Device.countDocuments({ credential: id });
  if (used > 0) {
    throw new AppError(`Credential is still assigned to ${used} device(s). Reassign or delete those devices first.`, 409);
  }
  const doc = await Credential.findByIdAndDelete(id);
  if (!doc) throw new AppError('Credential not found', 404);
  return doc;
}

export default {
  SECRET_FIELDS,
  listCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
};
