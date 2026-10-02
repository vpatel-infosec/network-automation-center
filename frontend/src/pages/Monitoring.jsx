import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { Dot, Spinner, timeAgo, titleCase, useToast } from '../components/ui.jsx';

function StatCard({ label, value, tone = '', hint }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  );
}

export default function Monitoring() {
  const [monitoring, setMonitoring] = useState({ total: 0, online: 0, offline: 0, byVendor: [], onlineDevices: [], offlineDevices: [] });
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/devices/monitoring');
      setMonitoring(data);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner full label="Loading monitoring status..." />;

  const vendorCounts = monitoring.byVendor || [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Monitoring</h2>
          <p className="muted small">Track which devices are online, offline, and last checked in the topology view.</p>
        </div>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={load}>
            Refresh
          </button>
          <Link className="btn primary" to="/topology">
            Topology view
          </Link>
        </div>
      </div>

      <div className="grid stats">
        <StatCard label="Total devices" value={monitoring.total} hint="all managed devices" />
        <StatCard label="Online" value={monitoring.online} tone="ok" hint="reachable" />
        <StatCard label="Offline" value={monitoring.offline} tone="warn" hint="last check failed" />
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Device health by vendor</h3>
        </div>
        {vendorCounts.length ? (
          <div className="stack small-gap">
            {vendorCounts.map((item) => (
              <div key={item.vendor} className="bar-row">
                <span className="bar-label">{titleCase(item.vendor)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(item.count / Math.max(1, monitoring.total)) * 100}%` }} />
                </span>
                <span className="bar-value">{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small pad">No devices registered yet.</p>
        )}
      </section>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h3>Online devices</h3>
          </div>
          {monitoring.onlineDevices.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Device</th>
                  <th>Host</th>
                  <th>Last check</th>
                </tr>
              </thead>
              <tbody>
                {monitoring.onlineDevices.map((device) => (
                  <tr key={device._id || device.name}>
                    <td>
                      <Dot ok={Boolean(device.status?.reachable)} title={device.status?.lastCheckMessage || 'reachable'} />
                    </td>
                    <td>
                      <Link className="link" to={`/devices/${device._id}`}>
                        {device.name}
                      </Link>
                      <span className="muted small block">{titleCase(device.vendor)} · {titleCase(device.deviceType)}</span>
                    </td>
                    <td className="muted small">{device.host}</td>
                    <td className="muted small">{timeAgo(device.status?.lastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small pad">No devices are currently reachable.</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Offline devices</h3>
          </div>
          {monitoring.offlineDevices.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Device</th>
                  <th>Host</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {monitoring.offlineDevices.map((device) => (
                  <tr key={device._id || device.name}>
                    <td>
                      <Dot ok={Boolean(device.status?.reachable)} title={device.status?.lastCheckMessage || 'unreachable'} />
                    </td>
                    <td>
                      <Link className="link" to={`/devices/${device._id}`}>
                        {device.name}
                      </Link>
                      <span className="muted small block">{titleCase(device.vendor)} · {titleCase(device.deviceType)}</span>
                    </td>
                    <td className="muted small">{device.host}</td>
                    <td className="muted small">{device.status?.lastCheckMessage || 'No check yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small pad">No offline devices right now.</p>
          )}
        </section>
      </div>
    </div>
  );
}
