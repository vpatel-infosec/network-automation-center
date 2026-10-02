import mongoose from 'mongoose';

export const DEVICE_TYPES = ['switch', 'router', 'access_point', 'wlc', 'firewall', 'other'];
export const VENDORS = ['cisco', 'aruba', 'juniper', 'ubiquiti', 'generic'];
export const PROTOCOLS = ['ssh', 'restconf'];
/** Must stay in sync with backend/src/drivers/index.js */
export const DRIVERS = [
  'auto',
  'cisco_ios',
  'cisco_nxos',
  'cisco_wlc',
  'cisco_restconf',
  'aruba_os',
  'juniper',
  'ubiquiti',
  'generic_ssh',
];

/**
 * Device fields are validated with zod at the API boundary (routes/deviceRoutes.js).
 * `commandOverrides` is stored as Mixed because Mongoose reserves `save` as a
 * document method name, and the override keys must include `save` (the command
 * that persists the configuration on the device).
 */
const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    host: { type: String, required: true, trim: true },
    port: { type: Number, default: 22, min: 1, max: 65535 },
    vendor: { type: String, enum: VENDORS, required: true, default: 'generic', index: true },
    deviceType: { type: String, enum: DEVICE_TYPES, required: true, default: 'switch', index: true },
    platform: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    osVersion: { type: String, default: '', trim: true },
    protocol: { type: String, enum: PROTOCOLS, default: 'ssh' },
    driver: { type: String, enum: DRIVERS, default: 'auto' },
    credential: { type: mongoose.Schema.Types.ObjectId, ref: 'Credential', required: true },
    site: { type: String, default: '', trim: true, index: true },
    location: { type: String, default: '', trim: true, index: true },
    tags: { type: [String], default: [] },
    notes: { type: String, default: '' },
    commandOverrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    status: {
      reachable: { type: Boolean, default: false },
      lastCheckedAt: { type: Date },
      lastCheckMessage: { type: String, default: '' },
      latencyMs: { type: Number },
      lastBackupAt: { type: Date },
      lastBackupStatus: {
        type: String,
        enum: ['never', 'success', 'unchanged', 'failed'],
        default: 'never',
      },
      lastBackupMessage: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

deviceSchema.index({ name: 'text', host: 'text', location: 'text' });

export default mongoose.model('Device', deviceSchema);
