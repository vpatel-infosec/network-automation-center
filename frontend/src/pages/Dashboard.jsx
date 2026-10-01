import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { Spinner, StatusBadge, timeAgo, useToast, titleCase, formatDate } from '../components/ui.jsx';

function StatCard({ label, value, hint, tone = '' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  );
}

function Bars({ items, emptyLabel }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) return <p className="muted small pad">{emptyLabel}</p>;
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
          </span>
          <span className="bar-value">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api
      .get('/dashboard/summary')
      .then(({ data }) => setSummary(data))
      .catch((error) => toast.error(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !summary) return <Spinner full label="Loading dashboard..." />;
  if (!summary) return null;

  const { devices, jobs, configs, audit } = summary;
  const jobStatus = Object.fromEntries((jobs.byStatus || []).map((item) => [item._id, item.count]));
  const backupsPerDay = (configs.backupsPerDay || []).map((item) => ({
    label: item._id?.slice(5),
    count: item.count,
  }));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Operations dashboard</h2>
          <p className="muted small">Live overview of your network estate, jobs and configuration history</p>
        </div>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={load}>
            Refresh
          </button>
          <Link className="btn primary" to="/jobs">
            New automation job
          </Link>
        </div>
      </div>

      <div className="grid stats">
        <StatCard label="Devices" value={devices.total} hint={`${devices.reachable} reachable`} />
        <StatCard
          label="Unreachable"
          value={devices.unreachable}
          tone={devices.unreachable ? 'warn' : ''}
          hint="failed last check"
        />
        <StatCard label="Config versions" value={configs.total} hint="stored snapshots" />
        <StatCard
          label="Backups pending"
          value={devices.staleBackups}
          tone={devices.staleBackups ? 'warn' : ''}
          hint="never or older than 24h"
        />
        <StatCard label="Jobs completed (7d)" value={jobStatus.completed || 0} tone="ok" />
        <StatCard
          label="Jobs failed (7d)"
          value={(jobStatus.failed || 0) + (jobStatus.partial || 0)}
          tone={jobStatus.failed ? 'bad' : ''}
        />
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h3>Devices by vendor</h3>
          </div>
          <Bars
            items={(devices.byVendor || []).map((item) => ({ label: titleCase(item._id), count: item.count }))}
            emptyLabel="No devices registered yet."
          />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Devices by type</h3>
          </div>
          <Bars
            items={(devices.byType || []).map((item) => ({ label: titleCase(item._id), count: item.count }))}
            emptyLabel="No devices registered yet."
          />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Configurations captured (last 7 days)</h3>
        </div>
        <Bars items={backupsPerDay} emptyLabel="No configuration backups in the last 7 days." />
      </section>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h3>Recent jobs</h3>
            <Link className="link small" to="/jobs">
              View all
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(jobs.recent || []).map((job) => (
                <tr key={job._id}>
                  <td>{job.name}</td>
                  <td className="muted small">{titleCase(job.type)}</td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="muted small">{timeAgo(job.createdAt)}</td>
                </tr>
              ))}
              {!(jobs.recent || []).length ? (
                <tr>
                  <td colSpan="4" className="muted">
                    No jobs yet — start with a backup job from the Devices page.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Latest configuration per device</h3>
            <Link className="link small" to="/configs">
              View all
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Version</th>
                <th>Captured</th>
              </tr>
            </thead>
            <tbody>
              {(configs.latestPerDevice || []).slice(0, 8).map((row) => (
                <tr key={row.deviceId}>
                  <td>
                    <Link className="link" to={`/devices/${row.deviceId}`}>
                      {row.name}
                    </Link>
                    <span className="muted small block">{row.host}</span>
                  </td>
                  <td>v{row.version}</td>
                  <td className="muted small">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {!(configs.latestPerDevice || []).length ? (
                <tr>
                  <td colSpan="3" className="muted">
                    No configuration snapshots stored yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Recent activity</h3>
          <Link className="link small" to="/audit">
            Audit log
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {(audit || []).map((entry) => (
              <tr key={entry._id}>
                <td className="muted small">{timeAgo(entry.createdAt)}</td>
                <td>{entry.userName}</td>
                <td>
                  <code className="inline">{entry.action}</code>
                </td>
                <td className="muted small">
                  {entry.entity}
                  {entry.entityId ? ` · ${String(entry.entityId).slice(-6)}` : ''}
                </td>
              </tr>
            ))}
            {!(audit || []).length ? (
              <tr>
                <td colSpan="4" className="muted">
                  No activity recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
