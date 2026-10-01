import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  Dot,
  EmptyState,
  Pagination,
  Spinner,
  StatusBadge,
  timeAgo,
  titleCase,
  useToast,
} from '../components/ui.jsx';
import DeviceForm from './DeviceForm.jsx';

const PAGE_SIZE = 25;

export default function Devices() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();

  const [meta, setMeta] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [devices, setDevices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [filters, setFilters] = useState({ q: '', vendor: '', deviceType: '', reachable: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filters.q) params.q = filters.q;
      if (filters.vendor) params.vendor = filters.vendor;
      if (filters.deviceType) params.deviceType = filters.deviceType;
      if (filters.reachable) params.reachable = filters.reachable;
      const response = await api.get('/devices', { params });
      setDevices(response.data.items);
      setTotal(response.data.total);
      setPages(response.data.pages);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  useEffect(() => {
    api.get('/meta').then(({ data }) => setMeta(data)).catch(() => {});
    api.get('/credentials').then(({ data }) => setCredentials(data.items)).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const testDevice = async (device) => {
    setBusyId(device._id);
    try {
      const { data } = await api.post(`/devices/${device._id}/test`);
      if (data.reachable) toast.success(`${device.name} reachable in ${data.latencyMs} ms (driver ${data.driver})`);
      else toast.error(`${device.name}: ${data.error}`);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusyId('');
    }
  };

  const backupDevice = async (device) => {
    setBusyId(device._id);
    try {
      const { data } = await api.post(`/devices/${device._id}/backup`);
      toast.success(
        data.changed
          ? `${device.name}: stored configuration v${data.version}`
          : `${device.name}: no change (v${data.version})`
      );
      load();
    } catch (error) {
      toast.error(`${device.name}: ${apiErrorMessage(error)}`);
    } finally {
      setBusyId('');
    }
  };

  const backupAll = async () => {
    try {
      const { data } = await api.get('/devices/all');
      if (!data.items.length) {
        toast.info('No devices to back up.');
        return;
      }
      await api.post('/jobs', {
        type: 'backup',
        name: `Backup of ${data.items.length} device(s)`,
        deviceIds: data.items.map((device) => device._id),
      });
      toast.success('Backup job queued — follow it on the Jobs page.');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/devices/${deleting._id}`);
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const openEdit = async (device) => {
    try {
      const { data } = await api.get(`/devices/${device._id}`);
      setEditing(data.device);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Devices</h2>
          <p className="muted small">
            {total} device(s) · switches, access points, WLCs, routers and firewalls across vendors
          </p>
        </div>
        {canOperate ? (
          <div className="row gap">
            <button type="button" className="btn ghost" onClick={backupAll}>
              Backup all
            </button>
            <button type="button" className="btn primary" onClick={() => setCreating(true)} disabled={!meta}>
              + Add device
            </button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="filters">
          <input
            className="input"
            placeholder="Search name, IP, location, tag..."
            value={filters.q}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, q: event.target.value }));
            }}
          />
          <select
            className="input"
            value={filters.vendor}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, vendor: event.target.value }));
            }}
          >
            <option value="">All vendors</option>
            {(meta?.vendors || []).map((vendor) => (
              <option key={vendor} value={vendor}>
                {titleCase(vendor)}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.deviceType}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, deviceType: event.target.value }));
            }}
          >
            <option value="">All types</option>
            {(meta?.deviceTypes || []).map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.reachable}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, reachable: event.target.value }));
            }}
          >
            <option value="">Any state</option>
            <option value="true">Reachable</option>
            <option value="false">Unreachable</option>
          </select>
        </div>

        {loading ? (
          <Spinner label="Loading devices..." />
        ) : devices.length === 0 ? (
          <EmptyState
            title="No devices found"
            message={
              canOperate
                ? 'Add your first switch, AP or WLC to get started.'
                : 'No devices match the current filters.'
            }
          />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Device</th>
                  <th>Vendor / type</th>
                  <th>Protocol</th>
                  <th>Credential</th>
                  <th>Last backup</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device._id}>
                    <td>
                      <Dot ok={device.status?.reachable} title={device.status?.lastCheckMessage} />
                    </td>
                    <td>
                      <Link className="link" to={`/devices/${device._id}`}>
                        {device.name}
                      </Link>
                      <span className="muted small block">
                        {device.host}
                        {device.location ? ` · ${device.location}` : ''}
                      </span>
                    </td>
                    <td>
                      {titleCase(device.vendor)}
                      <span className="muted small block">{titleCase(device.deviceType)}</span>
                    </td>
                    <td className="muted small">{String(device.protocol).toUpperCase()}</td>
                    <td className="muted small">{device.credential?.name || '—'}</td>
                    <td>
                      {device.status?.lastBackupAt ? (
                        <>
                          <StatusBadge status={device.status.lastBackupStatus} />
                          <span className="muted small block">{timeAgo(device.status.lastBackupAt)}</span>
                        </>
                      ) : (
                        <StatusBadge status="never" label="never" />
                      )}
                    </td>
                    <td className="actions">
                      {canOperate ? (
                        <>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busyId === device._id}
                            onClick={() => testDevice(device)}
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busyId === device._id}
                            onClick={() => backupDevice(device)}
                          >
                            Backup
                          </button>
                          <button type="button" className="btn ghost sm" onClick={() => openEdit(device)}>
                            Edit
                          </button>
                        </>
                      ) : null}
                      {isAdmin ? (
                        <button type="button" className="btn danger sm" onClick={() => setDeleting(device)}>
                          Delete
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

      {creating && meta ? (
        <DeviceForm
          meta={meta}
          credentials={credentials}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing && meta ? (
        <DeviceForm
          meta={meta}
          credentials={credentials}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="The device and all of its stored configuration versions will be removed. This cannot be undone."
          confirmLabel="Delete device"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
