import { discoverTopology, verifyTopologyTargets, buildTopologyFromTargets, clearSavedTopology, listSavedTopology, saveTopologyGraph } from '../services/topologyService.js';

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
    res.json(await discoverTopology(deviceIds, req.body?.name || 'Saved topology'));
    return;
  }

  const result = await buildTopologyFromTargets({
    ipAddress: req.body?.ipAddress || '',
    ipRange: req.body?.ipRange || '',
    credentialId: req.body?.credentialId || '',
  });
  res.json(result);
}

export async function clearTopology(req, res) {
  const name = req.query?.name || req.body?.name || '';
  res.json(await clearSavedTopology(name));
}

export async function saveTopology(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    throw new Error('A topology name is required to save the graph.');
  }

  const graph = req.body?.graph || { nodes: [], links: [], protocols: [] };
  const saved = await saveTopologyGraph(graph, 'manual', name);
  res.json(saved);
}

export async function getSavedTopology(req, res) {
  res.json(await listSavedTopology());
}

export default { getTopology, verifyTopology, buildTopology, clearTopology, saveTopology, getSavedTopology };
