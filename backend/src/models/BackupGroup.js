import mongoose from 'mongoose';

const backupGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '', trim: true },
    devices: { type: [mongoose.Schema.Types.ObjectId], ref: 'Device', default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('BackupGroup', backupGroupSchema);