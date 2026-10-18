import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../api/socket.js';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Pagination,
  Spinner,
  StatusBadge,
  formatDate,
  timeAgo,
  titleCase,
  useToast,
} from '../components/ui.jsx';
import DevicePicker from '../components/DevicePicker.jsx';

const PAGE_SIZE = 20;

function Progress({ job }) {
  const total = job.total || job.devices?.length || 0;
  const done = job.completed || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress">
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="muted small">
        {done}/{total}
      </span>
    </div>
  );
}

function NewJobModal({ devices, onClose, onCreated }) {
  const toast = useToast();
  const [type, setType] = useState('backup');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);
  const [commands, setCommands] = useState('show version\nshow interfaces status');
  const [backupAfter, setBackupAfter] = useState(true);
  const [busy, setBusy] = useState(false);

  const toggle = (id) =>
    setSelected((list) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]));

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        type,
        name: name.trim() || undefined,
        deviceIds: selected,
        options: { backupAfter },
      };
      if (type === 'command') {
        payload.commands = commands
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }
      const { data } = await api.post('/jobs', payload);
      toast.success('Job queued — results update live below.');
      onCreated(data.job);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New automation job"
      subtitle="Back up configurations or run read-only / operational commands across many devices"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={submit} disabled={busy || !selected.length}>
            {busy ? 'Queueing...' : `Queue job for ${selected.length} device(s)`}
          </button>
        </>
      }
    >
      <div className="grid two">
        <div>
          <Field label="Job type" required>
            <select className="input" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="backup">Configuration backup</option>
              <option value="command">Command execution</option>
            </select>
          </Field>
          <Field label="Job name" hint="Optional — a default name is generated from the type">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {type === 'command' ? (
            <Field label="Commands" required hint="One command per line, executed in order on every device">
              <textarea
                className="input mono"
                rows="6"
                value={commands}
                onChange={(event) => setCommands(event.target.value)}
              />
            </Field>
          ) : (
            <Field label="Take a backup after the job">
              <input type="checkbox" checked={backupAfter} onChange={(event) => setBackupAfter(event.target.checked)} />
            </Field>
          )}
          <p className="muted small">
            Template pushes and configuration restores are queued from the Templates and device pages.
          </p>
        </div>
        <div>
          <span className="field-label">Target devices ({selected.length} selected)</span>
          <DevicePicker devices={devices} selected={selected} onToggle={toggle} />
        </div>
      </div>
    </Modal>
  );
}

export default function Jobs() {
  const { canOperate } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [viewingOutput, setViewingOutput] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      const { data } = await api.get('/jobs', { params });
      setItems(data.items);
      setPages(data.pages);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/devices/all')
      .then(({ data }) => setDevices(data.items))
      .catch(() => {});
  }, []);

  // Live refresh of the list whenever any job changes state.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onChanged = () => load();
    socket.on('jobs:changed', onChanged);
    return () => socket.off('jobs:changed', onChanged);
  }, [load]);

  // Live refresh of the job that is open in the detail modal.
  const detailId = detail?._id;
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !detailId) return undefined;
    socket.emit('job:subscribe', detailId);
    const onUpdate = () => {
      api
        .get(`/jobs/${detailId}`)
        .then(({ data }) => setDetail(data.job))
        .catch(() => {});
    };
    socket.on('job:update', onUpdate);
    return () => {
      socket.off('job:update', onUpdate);
      socket.emit('job:unsubscribe', detailId);
    };
  }, [detailId]);

  const openDetail = async (job) => {
    try {
      const { data } = await api.get(`/jobs/${job._id}`);
      setDetail(data.job);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const confirmCancel = async () => {
    try {
      await api.post(`/jobs/${cancelling._id}/cancel`);
      toast.info('Cancellation requested — devices that have not started yet will be skipped.');
      setCancelling(null);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Automation jobs</h2>
          <p className="muted small">Bulk backups, command execution, template pushes and configuration restores</p>
        </div>
        {canOperate ? (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New job
          </button>
        ) : null}
      </div>

      <div className="card">
        <div className="filters">
          <select
            className="input"
            value={filters.type}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, type: event.target.value }));
            }}
          >
            <option value="">All types</option>
            <option value="backup">Backup</option>
            <option value="command">Command</option>
            <option value="push_template">Template push</option>
            <option value="site_vlan">Site VLAN creation</option>
            <option value="restore">Restore</option>
          </select>
          <select
            className="input"
            value={filters.status}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, status: event.target.value }));
            }}
          >
            <option value="">All states</option>
            {['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'].map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost" onClick={load}>
            Refresh
          </button>
        </div>

        {loading ? (
          <Spinner label="Loading jobs..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            message="Run a backup across all devices, execute a command set or push a template to see jobs here."
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <tr key={job._id}>
                    <td>
                      {job.name}
                      <span className="muted small block">by {job.createdBy?.name || 'system'}</span>
                    </td>
                    <td className="muted small">{titleCase(job.type)}</td>
                    <td>
                      <StatusBadge status={job.status} />
                      {job.trigger === 'scheduled' ? <span className="badge badge-muted">scheduled</span> : null}
                    </td>
                    <td>
                      <Progress job={job} />
                    </td>
                    <td className="muted small">
                      {timeAgo(job.createdAt)}
                      <span className="block">{formatDate(job.createdAt)}</span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn ghost sm" onClick={() => openDetail(job)}>
                        Details
                      </button>
                      {canOperate && (job.status === 'queued' || job.status === 'running') ? (
                        <button type="button" className="btn danger sm" onClick={() => setCancelling(job)}>
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>

      {creating ? (
        <NewJobModal
          devices={devices}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {detail ? (
        <Modal
          title={detail.name}
          subtitle={`${titleCase(detail.type)} · ${detail.trigger} · created ${formatDate(detail.createdAt)}`}
          onClose={() => setDetail(null)}
          wide
          footer={
            <button type="button" className="btn primary" onClick={() => setDetail(null)}>
              Close
            </button>
          }
        >
          <div className="row gap wrap">
            <StatusBadge status={detail.status} />
            <Progress job={detail} />
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Message</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(detail.results || []).map((result, index) => (
                <tr key={`${result.device || 'row'}-${index}`}>
                  <td>{result.deviceName || '(device)'}</td>
                  <td>
                    <StatusBadge status={result.status} />
                  </td>
                  <td className="muted small wrap-any">{result.message || '—'}</td>
                  <td className="muted small">
                    {result.startedAt && result.finishedAt
                      ? `${Math.max(1, Math.round((new Date(result.finishedAt) - new Date(result.startedAt)) / 1000))}s`
                      : '—'}
                  </td>
                  <td className="actions">
                    {result.output ? (
                      <button type="button" className="btn ghost sm" onClick={() => setViewingOutput(result)}>
                        Output
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!(detail.results || []).length ? (
                <tr>
                  <td colSpan="5" className="muted">
                    Waiting for the first device to finish...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {detail.commands?.length ? (
            <>
              <span className="field-label">Commands</span>
              <pre className="config-view sm">{detail.commands.join('\n')}</pre>
            </>
          ) : null}
        </Modal>
      ) : null}

      {viewingOutput ? (
        <Modal
          title={`${viewingOutput.deviceName || 'Device'} · output`}
          subtitle={viewingOutput.status === 'failed' ? viewingOutput.message : 'Command / configuration output'}
          onClose={() => setViewingOutput(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(viewingOutput.output);
                  toast.success('Output copied to clipboard');
                }}
              >
                Copy
              </button>
              <button type="button" className="btn primary" onClick={() => setViewingOutput(null)}>
                Close
              </button>
            </>
          }
        >
          <pre className="config-view">{viewingOutput.output}</pre>
        </Modal>
      ) : null}

      {cancelling ? (
        <ConfirmDialog
          title={`Cancel "${cancelling.name}"?`}
          message="Devices that have not started yet will be skipped. Devices currently being processed will finish normally."
          confirmLabel="Request cancellation"
          danger
          onConfirm={confirmCancel}
          onCancel={() => setCancelling(null)}
        />
      ) : null}
    </div>
  );
}
