import mongoose from 'mongoose';

/**
 * A reusable credential set. Secrets are stored AES-256-GCM encrypted
 * (see utils/crypto.js) and are `select: false`, so a plain query never
 * returns them. Services that need the plaintext must explicitly
 * `.select('+passwordEnc +enablePasswordEnc +sshPrivateKeyEnc +sshPassphraseEnc')`.
 */
const credentialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '', trim: true },
    username: { type: String, required: true, trim: true },
    passwordEnc: { type: String, default: '', select: false },
    enablePasswordEnc: { type: String, default: '', select: false },
    sshPrivateKeyEnc: { type: String, default: '', select: false },
    sshPassphraseEnc: { type: String, default: '', select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

credentialSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  const flags = {
    hasPassword: Boolean(obj.passwordEnc),
    hasEnablePassword: Boolean(obj.enablePasswordEnc),
    hasSshKey: Boolean(obj.sshPrivateKeyEnc),
  };
  delete obj.passwordEnc;
  delete obj.enablePasswordEnc;
  delete obj.sshPrivateKeyEnc;
  delete obj.sshPassphraseEnc;
  return { ...obj, ...flags };
};

export default mongoose.model('Credential', credentialSchema);
