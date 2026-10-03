import mongoose from 'mongoose';

const topologySchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Saved topology', trim: true },
    source: { type: String, default: 'build', trim: true },
    generatedAt: { type: Date, default: Date.now },
    nodes: [
      {
        id: { type: String, required: true },
        label: { type: String, default: '' },
        hostname: { type: String, default: '' },
        host: { type: String, default: '' },
        ipAddress: { type: String, default: '' },
        vendor: { type: String, default: 'generic' },
        deviceType: { type: String, default: 'other' },
        reachable: { type: Boolean, default: false },
        ports: [{ type: String }],
        port: { type: String, default: '' },
      }
    ],
    links: [
      {
        id: { type: String, required: true },
        sourceDevice: { type: String, required: true },
        targetDevice: { type: String, required: true },
        localInterface: { type: String, default: '' },
        remoteInterface: { type: String, default: '' },
        protocols: [{ type: String }],
        protocol: { type: String, default: 'unknown' },
      }
    ],
    protocols: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model('Topology', topologySchema);
