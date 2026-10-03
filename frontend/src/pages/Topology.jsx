import { useEffect, useMemo, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { Spinner, useToast } from '../components/ui.jsx';

const EMPTY_FORM = {
  ipAddress: '',
  ipRange: '',
  credentialId: '',
};

const PROTOCOL_STYLES = {
  cdp: '#38bdf8',
  lldp: '#34d399',
  mixed: '#fbbf24',
  unknown: '#a5b4fc',
};

const parseNeighborText = (output, deviceName = '', deviceIp = '') => {
  const neighbors = [];
  const push = (current, protocol) => {
    if (!current || !current.device || !current.remoteDevice || !current.localInterface || !current.remoteInterface) return;
    neighbors.push({
      device: String(current.device).trim(),
      deviceIp: current.deviceIp ? String(current.deviceIp).trim() : '',
      remoteDevice: String(current.remoteDevice).trim(),
      remoteIp: current.remoteIp ? String(current.remoteIp).trim() : '',
      localInterface: current.localInterface.trim(),
      remoteInterface: current.remoteInterface.trim(),
      protocol,
    });
  };

  let current = null;
  const lines = String(output ?? '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const cdpMatch = line.match(/^Device ID:\s*(.+)$/i);
    if (cdpMatch) {
      if (current && current.protocol) push(current, current.protocol);
      current = {
        device: deviceName,
        deviceIp,
        remoteDevice: cdpMatch[1].trim(),
        remoteIp: '',
        localInterface: '',
        remoteInterface: '',
        protocol: 'cdp',
      };
      continue;
    }

    const localMatch = line.match(/^Local\s+Intf(?:ace)?\s*:\s*(.+)$/i);
    if (localMatch) {
      if (current && current.protocol) push(current, current.protocol);
      current = {
        device: deviceName,
        deviceIp,
        remoteDevice: '',
        remoteIp: '',
        localInterface: localMatch[1].trim(),
        remoteInterface: '',
        protocol: 'lldp',
      };
      continue;
    }

    if (!current) continue;

    const ipMatch = line.match(/^IP address:\s*(\d+\.\d+\.\d+\.\d+)$/i)
      || line.match(/^Mgmt address:\s*(\d+\.\d+\.\d+\.\d+)$/i)
      || line.match(/^Management Address\s*:\s*(\d+\.\d+\.\d+\.\d+)$/i)
      || line.match(/^Management address\s*:\s*(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipMatch && !current.remoteIp) {
      current.remoteIp = ipMatch[1].trim();
      continue;
    }

    const cdpInterfaceMatch = line.match(/^Interface:\s*(.+?),\s*Port ID \(outgoing port\):\s*(.+)$/i)
      || line.match(/^Local Intrfce\s*:\s*(.+?),\s*Port ID \(outgoing port\):\s*(.+)$/i);
    if (cdpInterfaceMatch) {
      current.localInterface = cdpInterfaceMatch[1].trim();
      current.remoteInterface = cdpInterfaceMatch[2].trim();
      continue;
    }

    const cdpPortMatch = line.match(/^Port ID \(outgoing port\):\s*(.+)$/i);
    if (cdpPortMatch && current.localInterface && !current.remoteInterface) {
      current.remoteInterface = cdpPortMatch[1].trim();
      continue;
    }

    const deviceMatch = line.match(/^System Name\s*:\s*(.+)$/i)
      || line.match(/^Device ID\s*:\s*(.+)$/i)
      || line.match(/^Chassis id\s*:\s*(.+)$/i);
    if (deviceMatch) {
      current.remoteDevice = deviceMatch[1].trim();
      continue;
    }

    const portMatch = line.match(/^Port\s+ID\s*:\s*(.+)$/i) || line.match(/^Port id\s*:\s*(.+)$/i);
    if (portMatch) {
      current.remoteInterface = portMatch[1].trim();
    }
  }

  if (current && current.protocol) push(current, current.protocol);
  return neighbors.filter((neighbor) => neighbor.remoteDevice && neighbor.localInterface && neighbor.remoteInterface);
};

const createGraphFromNeighborText = (text, uploadedName = 'uploaded topology') => {
  const neighbors = parseNeighborText(text, uploadedName, '');
  if (!neighbors.length) return { nodes: [], links: [], protocols: [], generatedAt: new Date().toISOString() };

  const names = Array.from(new Set(neighbors.flatMap((neighbor) => [neighbor.device, neighbor.remoteDevice])));
  const devices = names.map((name, index) => ({
    _id: `${name}-${index}`,
    name,
    host: '',
    vendor: 'cisco',
    deviceType: 'switch',
    status: { reachable: true },
  }));

  const graph = {
    nodes: [],
    links: [],
    protocols: [],
    generatedAt: new Date().toISOString(),
  };

  const nodeMap = new Map();
  const links = new Map();

  for (const device of devices) {
    nodeMap.set(String(device.name).trim(), {
      id: String(device.name).trim(),
      label: String(device.name).trim(),
      hostname: String(device.name).trim(),
      host: '',
      ipAddress: '',
      vendor: device.vendor || 'cisco',
      deviceType: device.deviceType || 'switch',
      reachable: true,
      ports: [],
    });
  }

  for (const neighbor of neighbors) {
    const sourceName = String(neighbor.device).trim();
    const targetName = String(neighbor.remoteDevice).trim();
    const source = nodeMap.get(sourceName) || { id: sourceName, label: sourceName, hostname: sourceName, vendor: 'cisco', deviceType: 'switch', reachable: true, ports: [] };
    const target = nodeMap.get(targetName) || { id: targetName, label: targetName, hostname: targetName, vendor: 'cisco', deviceType: 'switch', reachable: true, ports: [] };
    source.ports = Array.from(new Set([...(source.ports || []), neighbor.localInterface].filter(Boolean)));
    target.ports = Array.from(new Set([...(target.ports || []), neighbor.remoteInterface].filter(Boolean)));
    nodeMap.set(sourceName, source);
    nodeMap.set(targetName, target);

    const pair = [sourceName, targetName].sort((left, right) => left.localeCompare(right));
    const key = `${pair[0]}|${pair[1]}|${neighbor.localInterface}|${neighbor.remoteInterface}`;
    const existing = links.get(key) || {
      id: key,
      sourceDevice: sourceName,
      targetDevice: targetName,
      protocols: new Set(),
      localInterface: neighbor.localInterface,
      remoteInterface: neighbor.remoteInterface,
    };
    existing.protocols.add(String(neighbor.protocol || 'unknown').toLowerCase());
    links.set(key, existing);
  }

  graph.nodes = Array.from(nodeMap.values()).map((node) => ({
    ...node,
    id: node.id,
    ipAddress: node.ipAddress || '',
    port: (node.ports || [])[0] || '',
    ports: Array.from(new Set((node.ports || []).filter(Boolean))),
    color: node.vendor === 'cisco' ? '#38bdf8' : '#a5b4fc',
  }));
  graph.links = Array.from(links.values()).map((link) => ({
    id: link.id,
    sourceDevice: link.sourceDevice,
    targetDevice: link.targetDevice,
    localInterface: link.localInterface,
    remoteInterface: link.remoteInterface,
    protocols: Array.from(link.protocols).sort(),
    protocol: Array.from(link.protocols).length > 1 ? 'mixed' : Array.from(link.protocols)[0] || 'unknown',
  }));
  graph.protocols = Array.from(new Set(graph.links.flatMap((link) => link.protocols))).sort();
  return graph;
};

export default function Topology() {
  const toast = useToast();
  const [graph, setGraph] = useState({ nodes: [], links: [], protocols: [] });
  const [credentials, setCredentials] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [verifyResult, setVerifyResult] = useState(null);
  const [building, setBuilding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savedTopologies, setSavedTopologies] = useState([]);
  const [saveName, setSaveName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: topologyData }, { data: savedData }] = await Promise.all([
        api.get('/topology'),
        api.get('/topology/saved'),
      ]);
      setGraph(topologyData);
      setSavedTopologies(savedData || []);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api
      .get('/credentials')
      .then(({ data }) => setCredentials(data.items || []))
      .catch(() => setCredentials([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreachableMessage = 'Device is not reachable, please check connection';

  const checkAndVerify = async () => {
    if (!form.credentialId || (!form.ipAddress && !form.ipRange)) {
      toast.error('Provide an IP address or range and choose a credential before verification.');
      return;
    }

    setChecking(true);
    try {
      const { data } = await api.post('/topology/verify', form);
      setVerifyResult(data);
      if (data.verified) toast.success(`${data.reachable.length} target(s) reachable for topology discovery.`);
      else toast.error(data.message || unreachableMessage);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  const buildTopology = async () => {
    if (!form.credentialId || (!form.ipAddress && !form.ipRange)) {
      toast.error('Provide an IP address or range and choose a credential to build topology.');
      return;
    }

    setBuilding(true);
    try {
      const { data } = await api.post('/topology/build', form);
      setGraph(data);
      setVerifyResult((current) => current || { verified: true, reachable: data.reachable || [], totalTargets: data.totalTargets || 0 });
      if (data.reachable?.length) {
        toast.success(`Topology built for ${data.reachable.length} reachable host(s).`);
      } else {
        toast.error(data.message || unreachableMessage);
      }
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBuilding(false);
    }
  };

  const handleNeighborUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const uploadedGraph = createGraphFromNeighborText(text, file.name.replace(/\.[^.]+$/, ''));
      if (!uploadedGraph.nodes.length) {
        toast.error('No CDP or LLDP neighbor data was found in the uploaded file.');
        return;
      }

      setGraph(uploadedGraph);
      toast.success(`Topology from ${file.name} built with ${uploadedGraph.nodes.length} devices and ${uploadedGraph.links.length} links.`);
    } catch (error) {
      toast.error(apiErrorMessage(error) || 'The uploaded file could not be processed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const saveTopologySnapshot = async () => {
    const name = saveName.trim();
    if (!name) {
      toast.error('Enter a name before saving the topology snapshot.');
      return;
    }

    try {
      const { data } = await api.post('/topology/save', { name, graph });
      setSavedTopologies((current) => {
        const next = current.filter((entry) => entry.name !== name);
        return [data, ...next];
      });
      setSaveName('');
      toast.success(`Topology saved as ${name}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error) || 'Unable to save the topology snapshot.');
    }
  };

  const clearSavedTopology = async (name = '') => {
    try {
      await api.delete('/topology/clear', { data: name ? { name } : {} });
      if (name) {
        setSavedTopologies((current) => current.filter((entry) => entry.name !== name));
      } else {
        setSavedTopologies([]);
        setGraph({ nodes: [], links: [], protocols: [] });
        setVerifyResult(null);
      }
      toast.success(name ? `Saved topology ${name} removed.` : 'Saved topology cleared.');
    } catch (error) {
      toast.error(apiErrorMessage(error) || 'Unable to clear the saved topology.');
    }
  };

  const loadSavedTopology = async (entry) => {
    setGraph({
      nodes: entry.nodes || [],
      links: entry.links || [],
      protocols: entry.protocols || [],
      generatedAt: entry.generatedAt || new Date().toISOString(),
    });
    toast.success(`Loaded saved topology: ${entry.name}.`);
  };

  const nodeMap = useMemo(() => Object.fromEntries((graph.nodes || []).map((node) => [node.id, node])), [graph.nodes]);

  const positionedNodes = useMemo(() => {
    const baseX = 100;
    const baseY = 110;
    const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, graph.nodes.length))));

    return (graph.nodes || []).map((node, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      return {
        ...node,
        x: baseX + col * 200 + (row % 2 === 1 ? 40 : 0),
        y: baseY + row * 150,
      };
    });
  }, [graph.nodes]);

  const renderLink = (link) => {
    const source = nodeMap[link.sourceDevice] || positionedNodes.find((node) => node.label === link.sourceDevice);
    const target = nodeMap[link.targetDevice] || positionedNodes.find((node) => node.label === link.targetDevice);
    if (!source || !target) return null;

    const color = link.protocols.includes('cdp') && link.protocols.includes('lldp')
      ? PROTOCOL_STYLES.mixed
      : PROTOCOL_STYLES[link.protocols[0]] || PROTOCOL_STYLES.unknown;

    return (
      <g key={link.id}>
        <line
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={link.protocols.includes('cdp') && link.protocols.includes('lldp') ? '6 5' : '0'}
          opacity={0.9}
        />
        <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8} fill="#cfe9ff" fontSize="11">
          {link.protocols.join(' + ') }
        </text>
      </g>
    );
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Topology</h2>
          <p className="muted small">CDP and LLDP discovery are combined into a single network view.</p>
        </div>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={load} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn ghost" onClick={() => clearSavedTopology()}>
            Clear saved topology
          </button>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Build topology</h3>
        </div>
        <div className="filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="field">
            <label className="field-label">IP address</label>
            <input
              className="input"
              value={form.ipAddress}
              onChange={(event) => setForm((current) => ({ ...current, ipAddress: event.target.value }))}
              placeholder="192.168.10.10"
            />
          </div>
          <div className="field">
            <label className="field-label">IP address range</label>
            <input
              className="input"
              value={form.ipRange}
              onChange={(event) => setForm((current) => ({ ...current, ipRange: event.target.value }))}
              placeholder="192.168.10.1-50 or 192.168.10.0/24"
            />
          </div>
          <div className="field">
            <label className="field-label">Credential</label>
            <select
              className="input"
              value={form.credentialId}
              onChange={(event) => setForm((current) => ({ ...current, credentialId: event.target.value }))}
            >
              <option value="">Select a credential</option>
              {credentials.map((credential) => (
                <option key={credential._id} value={credential._id}>
                  {credential.name} ({credential.username})
                </option>
              ))}
            </select>
          </div>
          <div className="row gap" style={{ alignSelf: 'end' }}>
            <button type="button" className="btn ghost" onClick={checkAndVerify} disabled={checking || !form.credentialId || (!form.ipAddress && !form.ipRange)}>
              {checking ? 'Checking...' : 'Check & verify'}
            </button>
            <button type="button" className="btn primary" onClick={buildTopology} disabled={building || !form.credentialId || (!form.ipAddress && !form.ipRange)}>
              {building ? 'Building...' : 'Build topology'}
            </button>
          </div>
        </div>

        <div className="filters" style={{ gridTemplateColumns: '1fr auto' }}>
          <div className="field">
            <label className="field-label">Upload CDP / LLDP neighbor output</label>
            <input type="file" accept=".txt,.log,.out,.txt" className="input" onChange={handleNeighborUpload} disabled={uploading} />
          </div>
          <div className="row gap" style={{ alignSelf: 'end' }}>
            <span className="muted small">{uploading ? 'Uploading...' : 'Supported: show cdp neighbors detail / show lldp neighbors detail'}</span>
          </div>
        </div>

        <div className="filters" style={{ gridTemplateColumns: 'minmax(200px, 1fr) auto auto' }}>
          <div className="field">
            <label className="field-label">Save topology as</label>
            <input
              className="input"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Campus core topology"
            />
          </div>
          <div className="row gap" style={{ alignSelf: 'end' }}>
            <button type="button" className="btn primary" onClick={saveTopologySnapshot} disabled={!graph.nodes.length || !saveName.trim()}>
              Save topology
            </button>
          </div>
        </div>

        {verifyResult ? (
          <div className="kv">
            <div>
              <dt>Checked targets</dt>
              <dd>{verifyResult.totalTargets || 0}</dd>
            </div>
            <div>
              <dt>Reachable</dt>
              <dd>{verifyResult.reachable?.length || 0}</dd>
            </div>
            <div>
              <dt>Unreachable</dt>
              <dd>{verifyResult.unreachable?.length || 0}</dd>
            </div>
            <div>
              <dt>Reachable IPs</dt>
              <dd>{verifyResult.reachable?.length ? verifyResult.reachable.join(', ') : 'none'}</dd>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Network map</h3>
          <div className="row gap">
            <span className="badge badge-info">CDP</span>
            <span className="badge badge-ok">LLDP</span>
            <span className="badge badge-warn">Mixed</span>
          </div>
        </div>

        {loading ? (
          <Spinner label="Discovering topology..." />
        ) : (
          <div className="topology-shell">
            {graph.nodes.length === 0 ? (
              <div className="empty">
                <h3>No topology discovered</h3>
                <p className="muted">
                  Add reachable devices with SSH access and run topology discovery. The app will merge CDP and LLDP links when both are available.
                </p>
              </div>
            ) : (
              <svg viewBox="0 0 980 620" className="topology-svg" role="img" aria-label="Device topology graph">
                {graph.links.map(renderLink)}
                {positionedNodes.map((node) => {
                  const portLabel = Array.isArray(node.ports) && node.ports.length ? node.ports.join(', ') : node.port || 'n/a';
                  const ipLabel = node.ipAddress || 'IP: n/a';
                  const boxWidth = 146;
                  const boxHeight = 70;

                  return (
                    <g key={node.id}>
                      <rect
                        x={node.x - boxWidth / 2}
                        y={node.y - boxHeight / 2}
                        width={boxWidth}
                        height={boxHeight}
                        rx={12}
                        fill="#0d1728"
                        stroke={node.vendor === 'cisco' ? '#38bdf8' : '#8ea8d9'}
                        strokeWidth="2"
                      />
                      <rect
                        x={node.x - boxWidth / 2 + 8}
                        y={node.y - boxHeight / 2 + 10}
                        width={boxWidth - 16}
                        height={10}
                        rx={5}
                        fill={node.vendor === 'cisco' ? '#1d4ed8' : '#4f46e5'}
                        opacity="0.85"
                      />
                      <line x1={node.x - 22} y1={node.y - 10} x2={node.x - 22} y2={node.y + 20} stroke="#9ec9ff" strokeWidth="1.5" opacity="0.8" />
                      <line x1={node.x + 22} y1={node.y - 10} x2={node.x + 22} y2={node.y + 20} stroke="#9ec9ff" strokeWidth="1.5" opacity="0.8" />
                      <text x={node.x} y={node.y - 8} textAnchor="middle" fill="#e8eef9" fontSize="11" fontWeight="700">
                        {node.label}
                      </text>
                      <text x={node.x} y={node.y + 12} textAnchor="middle" fill="#bfdbfe" fontSize="9">
                        {ipLabel}
                      </text>
                      <text x={node.x} y={node.y + 28} textAnchor="middle" fill="#9ad7ff" fontSize="9">
                        Port: {portLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        )}
      </section>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h3>Topology summary</h3>
          </div>
          <div className="kv">
            <div>
              <dt>Nodes</dt>
              <dd>{graph.nodes.length}</dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>{graph.links.length}</dd>
            </div>
            <div>
              <dt>Protocols</dt>
              <dd>{graph.protocols.length ? graph.protocols.join(', ') : 'none'}</dd>
            </div>
            <div>
              <dt>Last generated</dt>
              <dd>{graph.generatedAt ? new Date(graph.generatedAt).toLocaleString() : 'Not yet'}</dd>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Discovered links</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Protocols</th>
                <th>Interfaces</th>
              </tr>
            </thead>
            <tbody>
              {(graph.links || []).map((link) => (
                <tr key={link.id}>
                  <td>{link.sourceDevice}</td>
                  <td>{link.targetDevice}</td>
                  <td>{link.protocols.join(' + ') || 'unknown'}</td>
                  <td className="muted small">
                    {link.localInterface} → {link.remoteInterface}
                  </td>
                </tr>
              ))}
              {!graph.links.length ? (
                <tr>
                  <td colSpan="4" className="muted">
                    No adjacent links discovered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Saved topology snapshots</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Saved</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {savedTopologies.length ? (
              savedTopologies.map((entry) => (
                <tr key={entry._id || entry.name}>
                  <td>{entry.name}</td>
                  <td className="muted small">{new Date(entry.generatedAt).toLocaleString()}</td>
                  <td>
                    <div className="row gap">
                      <button type="button" className="btn ghost sm" onClick={() => loadSavedTopology(entry)}>
                        Load
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => clearSavedTopology(entry.name)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="muted">
                  No saved topology snapshots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
