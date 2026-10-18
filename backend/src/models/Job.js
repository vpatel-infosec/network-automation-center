import mongoose from 'mongoose';

export const JOB_TYPES = ['backup', 'command', 'push_template', 'site_vlan', 'restore'];
export const JOB_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'];

const jobResultSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    deviceName: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'skipped'], default: 'pending' },
    message: { type: String, default: '' },
    output: { type: String, default: '' },
    changed: { type: Boolean },
    configVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ConfigVersion' },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: JOB_TYPES, required: true, index: true },
    status: { type: String, enum: JOB_STATUSES, default: 'queued', index: true },
    trigger: { type: String, enum: ['manual', 'scheduled'], default: 'manual' },
    devices: { type: [mongoose.Schema.Types.ObjectId], ref: 'Device', default: [] },
    /** type=command: raw CLI commands executed on every device. */
    commands: { type: [String], default: [] },
    /** type=push_template: template + variables rendered per device. */
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    /** type=site_vlan: site and VLAN values rendered per switch. */
    variables: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    /** type=restore: the stored version that is replayed onto its device. */
    configVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ConfigVersion' },
    options: {
      backupAfter: { type: Boolean, default: false },
      // "save" would collide with the reserved document pathname, hence "persist"
      persist: { type: Boolean, default: true },
    },
    results: { type: [jobResultSchema], default: [] },
    cancelRequested: { type: Boolean, default: false },
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    succeeded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

jobSchema.index({ createdAt: -1 });

export default mongoose.model('Job', jobSchema);
