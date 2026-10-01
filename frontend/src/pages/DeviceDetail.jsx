import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  Dot,
  EmptyState,
  Field,
  Modal,
  Spinner,
  StatusBadge,
  formatBytes,
  formatDate,
  timeAgo,
  titleCase,
  useToast,
} from '../components/ui.jsx';
import DiffViewer from '../components/DiffViewer.jsx';
import DeviceForm from './DeviceForm.jsx';

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();

  const [device, setDevice] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState(null);
  const [credentials, setCredentials] = useState([]);

  const [viewing, setViewing] = useState(null); // full config text
  const [diff, setDiff] = useState(null); // { rows, summary }
  const [selected, setSelected] = useState([]); // up to two version ids
  const [restoring, setRestoring] = useState(null); // version to restore
  const [deleting, setDeleting] = useState(null); // version to delete
  const [deletingDevice, setDeletingDevice] = useState(false);
  const [backupAfter, setBackupAfter] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceResponse, versionsResponse] = await Promise.all([
        api.get(`/devices/${id}`),
        api.get('/configs', { params: { device: id, limit: 100 } }),
      ]);
      setDevice(deviceResponse.data.device);
      setVersions(versionsResponse.data.items);
    } catch (error) {
      toast.error(apiErrorMessage(error));
      navigate('/devices');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
    api.get('/meta').then(({ data }) => setMeta(data)).catch(() => {});
    api.get('/credentials').then(({ data }) => setCredentials(data.items)).catch(() => {});
  }, [load]);

  const testConnection = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/devices/${id}/test`);
      if (data.reachable) toast.success(`Reachable in ${data.latencyMs} ms (driver ${data.driver})`);
      else toast.error(data.error);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/devices/${id}/backup`);
      toast.success(data.changed ? `Stored configuration v${data.version}` : `No change (still v${data.version})`);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const openVersion = async (versionId) => {
    try {
      const { data } = await api.get(`/configs/${versionId}`);
      setViewing(data.version);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const openDiff = async (fromId, toId) => {
    try {
      const { data } = await api.get('/configs/diff', { params: { from: fromId, to: toId } });
      setDiff({ ...data, fromId, toId });
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const toggleSelected = (versionId) => {
    setSelected((current) => {
      if (current.includes(versionId)) return current.filter((value) => value !== versionId);
      const next = [...current, versionId];
      return next.slice(-2);
    });
  };

  const confirmRestore = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/configs/${restoring._id}/restore`, { backupAfter });
      toast.success(`Restore job queued (${data.job.name}) — track it on the Jobs page.`);
      setRestoring(null);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteVersion = async () => {
    try {
      await api.delete(`/configs/${deleting._id}`);
      toast.success(`Version v${deleting.version} deleted`);
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const deleteDevice = async () => {
    try {
      await api.delete(`/devices/${id}`);
      toast.success('Device deleted');
      navigate('/devices');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  if (loading && !device) return <Spinner full label="Loading device..." />;
  if (!device) return null;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link className="link small" to="/devices">
            ← All devices
          </Link>
          <h2 className="row gap center">
            {device.name}
            <Dot ok={device.status?.reachable} title={device.status?.lastCheckMessage} />
          </h2>
          <p className="muted small">
            {device.host}
            {device.port ? `:${device.port}` : ''} · {titleCase(device.vendor)} {titleCase(device.deviceType)}
            {device.model ? ` · ${device.model}` : ''}
            {device.location ? ` · ${device.location}` : ''}
          </p>
        </div>
        <div className="row gap wrap">
          {canOperate ? (
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={testConnection}>
                Test connection
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={backupNow}>
                Backup now
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          ) : null}
          {isAdmin ? (
            <button type="button" className="btn danger" onClick={() => setDeletingDevice(true)}>
              Delete device
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-head">
            <h3>Overview</h3>
          </div>
          <dl className="kv">
            <div>
              <dt>Status</dt>
              <dd>
                {device.status?.reachable
                  ? `Reachable (${device.status.latencyMs ?? '—'} ms)`
                  : 'Unreachable'}
              </dd>
            </div>
            <div>
              <dt>Last check</dt>
              <dd>
                {formatDate(device.status?.lastCheckedAt)}{' '}
                <span className="muted small">· {timeAgo(device.status?.lastCheckedAt)}</span>
              </dd>
            </div>
            <div>
              <dt>Check output</dt>
              <dd className="wrap-any">{device.status?.lastCheckMessage || '—'}</dd>
            </div>
            <div>
              <dt>Protocol / driver</dt>
              <dd>
                {String(device.protocol).toUpperCase()} · <code className="inline">{device.driver}</code>
              </dd>
            </div>
            <div>
              <dt>Credential</dt>
              <dd>
                {device.credential?.name || '—'}{' '}
                <span className="muted small">({device.credential?.username || 'n/a'})</span>
              </dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{device.platform || '—'}</dd>
            </div>
            <div>
              <dt>Last backup</dt>
              <dd>
                {device.status?.lastBackupAt ? (
                  <>
                    <StatusBadge status={device.status.lastBackupStatus} />{' '}
                    <span className="muted small">{timeAgo(device.status.lastBackupAt)}</span>
                  </>
                ) : (
                  <StatusBadge status="never" label="never" />
                )}
              </dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>
                {(device.tags || []).map((tag) => (
                  <span key={tag} className="badge badge-muted">
                    {tag}
                  </span>
                ))}
                {!(device.tags || []).length ? '—' : null}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Configuration history</h3>
            <span className="muted small">{versions.length} version(s)</span>
          </div>

          {!versions.length ? (
            <EmptyState
              title="No configuration stored yet"
              message="Run “Backup now” to capture the running configuration of this device."
            />
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Captured</th>
                    <th>Trigger</th>
                    <th>Size</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version, index) => {
                    const previous = versions[index + 1];
                    return (
                      <tr key={version._id}>
                        <td>
                          <label className="row gap center">
                            <input
                              type="checkbox"
                              checked={selected.includes(version._id)}
                              onChange={() => toggleSelected(version._id)}
                            />
                            v{version.version}
                          </label>
                        </td>
                        <td className="muted small">
                          {formatDate(version.createdAt)}
                          <span className="block">{timeAgo(version.createdAt)}</span>
                        </td>
                        <td>
                          <StatusBadge status="info" label={titleCase(version.trigger)} />
                        </td>
                        <td className="muted small">{formatBytes(version.size)}</td>
                        <td className="actions">
                          <button type="button" className="btn ghost sm" onClick={() => openVersion(version._id)}>
                            View
                          </button>
                          {previous ? (
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => openDiff(previous._id, version._id)}
                            >
                              Diff
                            </button>
                          ) : null}
                          {canOperate ? (
                            <button type="button" className="btn ghost sm" onClick={() => setRestoring(version)}>
                              Restore
                            </button>
                          ) : null}
                          {isAdmin ? (
                            <button type="button" className="btn danger sm" onClick={() => setDeleting(version)}>
                              Delete
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {selected.length ? (
                <div className="row gap wrap pad">
                  <span className="muted small">
                    {selected.length} selected{selected.length !== 2 ? ' (select one more to compare)' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={selected.length !== 2}
                    onClick={() => openDiff(selected[0], selected[1])}
                  >
                    Compare selected
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setSelected([])}>
                    Clear
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {editing && meta ? (
        <DeviceForm
          meta={meta}
          credentials={credentials}
          initial={device}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : null}

      {viewing ? (
        <Modal
          title={`${device.name} · v${viewing.version}`}
          subtitle={`Captured ${formatDate(viewing.createdAt)} · ${formatBytes(viewing.size)}`}
          onClose={() => setViewing(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(viewing.content);
                  toast.success('Configuration copied to clipboard');
                }}
              >
                Copy configuration
              </button>
              <button type="button" className="btn primary" onClick={() => setViewing(null)}>
                Close
              </button>
            </>
          }
        >
          <pre className="config-view">{viewing.content}</pre>
        </Modal>
      ) : null}

      {diff ? (
        <Modal
          title={`Diff v${diff.from.version} → v${diff.to.version}`}
          subtitle={`Captured ${formatDate(diff.from.createdAt)} → ${formatDate(diff.to.createdAt)}`}
          onClose={() => setDiff(null)}
          wide
          footer={
            <button type="button" className="btn primary" onClick={() => setDiff(null)}>
              Close
            </button>
          }
        >
          <DiffViewer rows={diff.rows} summary={diff.summary} />
        </Modal>
      ) : null}

      {restoring ? (
        <ConfirmDialog
          title={`Restore ${device.name} to v${restoring.version}?`}
          message="The stored configuration is replayed line by line over SSH and saved with the device's save command. Verify connectivity paths before restoring a core device."
          confirmLabel="Queue restore job"
          busy={busy}
          onConfirm={confirmRestore}
          onCancel={() => setRestoring(null)}
        >
          <Field label="Take a fresh backup directly after the restore">
            <input type="checkbox" checked={backupAfter} onChange={(event) => setBackupAfter(event.target.checked)} />
          </Field>
        </ConfirmDialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete configuration v${deleting.version}?`}
          message="This stored snapshot will be permanently removed. Other versions are not affected."
          confirmLabel="Delete version"
          danger
          onConfirm={confirmDeleteVersion}
          onCancel={() => setDeleting(null)}
        />
      ) : null}

      {deletingDevice ? (
        <ConfirmDialog
          title={`Delete ${device.name}?`}
          message="The device and every stored configuration version will be permanently removed."
          confirmLabel="Delete device"
          danger
          onConfirm={deleteDevice}
          onCancel={() => setDeletingDevice(false)}
        />
      ) : null}
    </div>
  );
}
