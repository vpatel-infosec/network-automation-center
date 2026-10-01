import { discoverTopology, verifyTopologyTargets, buildTopologyFromTargets } from '../services/topologyService.js';

export async function getTopology(req, res) {
  const deviceIds = Array.isArray(req.query.deviceIds)
    ? req.query.deviceIds
    : req.query.deviceIds
      ? [req.query.deviceIds]
      : [];

  res.json(await discoverTopology(deviceIds));
}

export async function verifyTopology(req, res) {
  const result = await verifyTopologyTargets({
    ipAddress: req.body?.ipAddress || '',
    ipRange: req.body?.ipRange || '',
    credentialId: req.body?.credentialId || '',
  });
  res.json(result);
}

export async function buildTopology(req, res) {
  const deviceIds = Array.isArray(req.body?.deviceIds) ? req.body.deviceIds : [];
  if (deviceIds.length) {
    res.json(await discoverTopology(deviceIds));
    return;
  }

  const result = await buildTopologyFromTargets({
    ipAddress: req.body?.ipAddress || '',
    ipRange: req.body?.ipRange || '',
    credentialId: req.body?.credentialId || '',
  });
  res.json(result);
}

export default { getTopology, verifyTopology, buildTopology };
