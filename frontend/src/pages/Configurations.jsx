import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Spinner,
  timeAgo,
  titleCase,
  useToast,
  formatBytes,
  formatDate,
} from '../components/ui.jsx';
import DiffViewer from '../components/DiffViewer.jsx';

const PAGE_SIZE = 25;

export default function Configurations() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();

  const [devices, setDevices] = useState([]);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deviceFilter, setDeviceFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [viewing, setViewing] = useState(null);
  const [diff, setDiff] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [backupAfter, setBackupAfter] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (deviceFilter) params.device = deviceFilter;
      const { data } = await api.get('/configs', { params });
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, deviceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/devices/all')
      .then(({ data }) => setDevices(data.items))
      .catch(() => {});
  }, []);

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
      setDiff(data);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const confirmRestore = async () => {
    try {
      const { data } = await api.post(`/configs/${restoring._id}/restore`, { backupAfter });
      toast.success(`Restore job queued: ${data.job.name}`);
      setRestoring(null);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/configs/${deleting._id}`);
      toast.success(`Version v${deleting.version} deleted`);
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const previousOf = (index) => (index < items.length - 1 ? items[index + 1] : null);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Configurations</h2>
          <p className="muted small">{total} stored snapshot(s) · version history, diff and restore</p>
        </div>
        <div className="row gap">
          <select
            className="input"
            value={deviceFilter}
            onChange={(event) => {
              setPage(1);
              setDeviceFilter(event.target.value);
            }}
          >
            <option value="">All devices</option>
            {devices.map((device) => (
              <option key={device._id} value={device._id}>
                {device.name} ({device.host})
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading configurations..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No configurations stored"
            message="Run a backup from the Devices page or wait for a scheduled backup to create the first snapshot."
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Version</th>
                  <th>Trigger</th>
                  <th>Size</th>
                  <th>Captured</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((version, index) => {
                  const previous = previousOf(index);
                  return (
                    <tr key={version._id}>
                      <td>
                        <Link className="link" to={`/devices/${version.device?._id}`}>
                          {version.device?.name || 'unknown'}
                        </Link>
                        <span className="muted small block">{version.device?.host || ''}</span>
                      </td>
                      <td>v{version.version}</td>
                      <td>
                        <span className="badge badge-info">{titleCase(version.trigger)}</span>
                      </td>
                      <td className="muted small">{formatBytes(version.size)}</td>
                      <td className="muted small">
                        {formatDate(version.createdAt)}
                        <span className="block">{timeAgo(version.createdAt)}</span>
                      </td>
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
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      {viewing ? (
        <Modal
          title={`${viewing.device?.name || 'Device'} · v${viewing.version}`}
          subtitle={`Captured ${formatDate(viewing.createdAt)} · ${formatBytes(viewing.size)} · ${titleCase(viewing.trigger)}`}
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
          title={`Diff v${diff.from?.version} → v${diff.to?.version}`}
          subtitle={`Captured ${formatDate(diff.from?.createdAt)} → ${formatDate(diff.to?.createdAt)}`}
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
          title={`Restore ${restoring.device?.name || 'device'} to v${restoring.version}?`}
          message="The stored configuration is replayed line by line over SSH and saved with the device's save command. Validate that the management path stays reachable."
          confirmLabel="Queue restore job"
          onConfirm={confirmRestore}
          onCancel={() => setRestoring(null)}
        >
          <Field label="Take a fresh backup directly after the restore">
            <input
              type="checkbox"
              checked={backupAfter}
              onChange={(event) => setBackupAfter(event.target.checked)}
            />
          </Field>
        </ConfirmDialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete configuration v${deleting.version}?`}
          message="This snapshot will be permanently removed. Other versions of the device are not affected."
          confirmLabel="Delete version"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
