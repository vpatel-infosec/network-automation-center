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

export default function Topology() {
  const toast = useToast();
  const [graph, setGraph] = useState({ nodes: [], links: [], protocols: [] });
  const [credentials, setCredentials] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [verifyResult, setVerifyResult] = useState(null);
  const [building, setBuilding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/topology');
      setGraph(data);
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
                {positionedNodes.map((node) => (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r={34} fill="#101a2d" stroke="#38bdf8" strokeWidth="2" />
                    <text x={node.x} y={node.y - 8} textAnchor="middle" fill="#e8eef9" fontSize="12" fontWeight="700">
                      {node.label}
                    </text>
                    <text x={node.x} y={node.y + 14} textAnchor="middle" fill="#93a6c4" fontSize="10">
                      {node.deviceType || 'device'}
                    </text>
                  </g>
                ))}
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
    </div>
  );
}
