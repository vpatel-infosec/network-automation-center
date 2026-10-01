import mongoose from 'mongoose';

const templateVariableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    label: { type: String, default: '' },
    description: { type: String, default: '' },
    required: { type: Boolean, default: true },
    defaultValue: { type: String, default: '' },
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    /** Optional hints used by the UI to preselect target devices. */
    targetVendors: { type: [String], default: [] },
    targetDeviceTypes: { type: [String], default: [] },
    /** Handlebars source, e.g. "hostname {{hostname}}\nvlan {{vlanId}}". */
    content: { type: String, required: true },
    variables: { type: [templateVariableSchema], default: [] },
    tags: { type: [String], default: [] },
    lastUsedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Template', templateSchema);
