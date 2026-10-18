import mongoose from 'mongoose';

/**
 * A stored configuration snapshot. A new document is only written when the
 * normalized hash differs from the previous version, which keeps history
 * meaningful (one entry per real change, not one per scheduled backup).
 */
const configVersionSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
    version: { type: Number, required: true },
    content: { type: String, required: true },
    startupContent: { type: String, default: '' },
    startupStatus: { type: String, enum: ['stored', 'unsupported', 'failed'], default: 'unsupported' },
    startupSize: { type: Number, default: 0 },
    startupCommand: { type: String, default: '' },
    startupError: { type: String, default: '' },
    startupHash: { type: String, default: '' },
    hash: { type: String, required: true, index: true },
    size: { type: Number, default: 0 },
    command: { type: String, default: '' },
    driverId: { type: String, default: '' },
    trigger: {
      type: String,
      enum: ['manual', 'scheduled', 'job', 'pre_push', 'post_push', 'post_restore'],
      default: 'manual',
    },
    note: { type: String, default: '' },
    storage: {
      type: [
        new mongoose.Schema(
          {
            provider: { type: String, enum: ['file_server', 's3'], required: true },
            key: { type: String, default: '' },
            startupKey: { type: String, default: '' },
            status: { type: String, enum: ['stored', 'failed'], required: true },
            storedAt: { type: Date },
            error: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

configVersionSchema.index({ device: 1, version: -1 }, { unique: true });

configVersionSchema.pre('validate', function preValidate(next) {
  if (this.content && !this.size) this.size = Buffer.byteLength(this.content, 'utf8');
  next();
});

export default mongoose.model('ConfigVersion', configVersionSchema);
