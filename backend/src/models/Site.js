import mongoose from 'mongoose';

const siteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, default: '', trim: true, unique: true, sparse: true },
    description: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    region: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

siteSchema.index({ name: 'text', code: 'text', region: 'text' });

export default mongoose.model('Site', siteSchema);
