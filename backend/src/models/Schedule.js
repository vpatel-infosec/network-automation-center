import mongoose from 'mongoose';

export const SCHEDULE_TYPES = ['backup', 'push_template'];

const scheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: SCHEDULE_TYPES, default: 'backup' },
    /** Standard 5/6-field cron expression, e.g. "0 2 * * *". */
    cron: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true, index: true },
    timezone: { type: String, default: '' },
    devices: { type: [mongoose.Schema.Types.ObjectId], ref: 'Device', default: [] },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    variables: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    options: { backupAfter: { type: Boolean, default: false } },
    lastRunAt: { type: Date },
    lastJob: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    lastStatus: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Schedule', scheduleSchema);
