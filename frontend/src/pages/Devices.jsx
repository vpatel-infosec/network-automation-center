import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  Dot,
  EmptyState,
  Modal,
  Pagination,
  Spinner,
  StatusBadge,
  timeAgo,
  titleCase,
  useToast,
} from '../components/ui.jsx';
import DeviceForm from './DeviceForm.jsx';

const PAGE_SIZE = 25;
const TEMPLATE_COLUMNS = [
  'name', 'host', 'port', 'vendor', 'deviceType', 'protocol', 'driver', 'credential',
  'model', 'platform', 'osVersion', 'site', 'location', 'tags', 'notes',
];

async function downloadDeviceTemplate(meta, credentials) {
  const writeExcelFile = (await import('write-excel-file/browser')).default;
  const devices = [TEMPLATE_COLUMNS.map((value) => ({ value, fontWeight: 'bold' }))];

  const referenceRows = [
    [{ value: 'Field', fontWeight: 'bold' }, { value: 'Allowed values', fontWeight: 'bold' }],
    ['vendor', (meta?.vendors || []).join(', ')],
    ['deviceType', (meta?.deviceTypes || []).join(', ')],
    ['protocol', (meta?.protocols || []).join(', ')],
    ['driver', (meta?.drivers || []).join(', ')],
    ['credential', credentials.map((credential) => credential.name).join(', ')],
    ['site', (meta?.sites || []).join(', ')],
    ['tags', 'Separate multiple tags with commas'],
  ];
  const blob = await writeExcelFile([
    { data: devices, sheet: 'Devices' },
    { data: referenceRows, sheet: 'Reference' },
  ]).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'device-import-template.xlsx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function normalizeExcelRows(rows, credentials, meta) {
  const credentialByName = new Map(credentials.map((credential) => [credential.name.trim().toLowerCase(), credential._id]));
  const vendors = new Set(meta?.vendors || []);
  const deviceTypes = new Set(meta?.deviceTypes || []);
  const protocols = new Set(meta?.protocols || []);
  const drivers = new Set(meta?.drivers || []);

  return rows.map((source, index) => {
    const row = Object.fromEntries(
      Object.entries(source).map(([key, value]) => [String(key).trim().toLowerCase(), value])
    );
    const text = (key) => String(row[key] ?? '').trim();
    const vendor = text('vendor').toLowerCase();
    const deviceType = text('devicetype').toLowerCase().replace(/[ -]+/g, '_');
    const protocol = (text('protocol') || 'ssh').toLowerCase();
    const driver = (text('driver') || 'auto').toLowerCase();
    const credentialLabel = text('credential');
    const credential = credentialByName.get(credentialLabel.toLowerCase()) || credentialLabel;
    const tags = Array.isArray(row.tags)
      ? row.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : text('tags').split(',').map((tag) => tag.trim()).filter(Boolean);
    const payload = {
      name: text('name'),
      host: text('host'),
      vendor,
      deviceType,
      protocol,
      driver,
      credential,
      model: text('model'),
      platform: text('platform'),
      osVersion: text('osversion'),
      site: text('site'),
      location: text('location'),
      tags,
      notes: text('notes'),
    };
    const port = text('port');
    if (port) payload.port = Number(port);

    const errors = [];
    if (!payload.name) errors.push('Name is required');
    if (!payload.host) errors.push('Host is required');
    if (!vendors.has(vendor)) errors.push(`Vendor must be one of: ${[...vendors].join(', ')}`);
    if (!deviceTypes.has(deviceType)) errors.push(`Device type must be one of: ${[...deviceTypes].join(', ')}`);
    if (!protocols.has(protocol)) errors.push(`Protocol must be one of: ${[...protocols].join(', ')}`);
    if (!drivers.has(driver)) errors.push(`Driver must be one of: ${[...drivers].join(', ')}`);
    if (!credentialByName.has(credentialLabel.toLowerCase()) && !/^[0-9a-f]{24}$/i.test(credentialLabel)) {
      errors.push('Credential must match a credential name in the Reference sheet');
    }
    if (port && (!Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535)) {
      errors.push('Port must be a number from 1 to 65535');
    }
    return { row: Number(row.__row) || index + 2, payload, errors };
  });
}

function BulkDeviceImport({ meta, credentials, onClose, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  const readWorkbook = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSummary(null);
    try {
      const readExcelFile = (await import('read-excel-file/browser')).default;
      const sheets = await readExcelFile(file);
      const sheet = sheets.find((item) => item.sheet === 'Devices') || sheets[0];
      if (!sheet) throw new Error('The workbook has no device worksheet.');
      const [headerRow, ...dataRows] = sheet.data;
      const headers = (headerRow || []).map((value) => String(value ?? '').trim());
      const parsed = dataRows.flatMap((values, index) => {
        const source = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? '']));
        if (!Object.values(source).some((value) => String(value ?? '').trim())) return [];
        source.__row = index + 2;
        return [source];
      });
      if (!parsed.length) throw new Error('The Devices sheet has no device rows.');
      if (parsed.length > 200) throw new Error('Import is limited to 200 devices per batch.');
      setRows(normalizeExcelRows(parsed, credentials, meta));
    } catch (error) {
      setRows([]);
      toast.error(error.message || 'Could not read this Excel file.');
    }
  };

  const submit = async () => {
    const validRows = rows.filter((row) => row.errors.length === 0);
    if (!validRows.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/devices/bulk', {
        rows: validRows.map((row) => ({ ...row.payload, _row: row.row })),
      });
      setSummary(data);
      toast.success(`${data.created} device(s) imported${data.failed ? `, ${data.failed} failed` : ''}`);
      if (data.created) onImported();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resultByRow = new Map((summary?.results || []).map((result) => [result.row, result]));
  const invalidCount = rows.filter((row) => row.errors.length > 0).length;
  const failureCount = (summary?.failed || 0) + invalidCount;

  return (
    <Modal
      title="Import devices from Excel"
      subtitle="Use the template so each device row matches the required fields. Existing devices are not overwritten."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Close</button>
          <button type="button" className="btn primary" onClick={submit} disabled={busy || !rows.some((row) => !row.errors.length)}>
            {busy ? 'Importing...' : `Import ${rows.filter((row) => !row.errors.length).length} valid device(s)`}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field-label">Excel workbook (.xlsx)</span>
          <input className="input" type="file" accept=".xlsx" onChange={readWorkbook} />
        </label>
        {rows.length ? (
          <>
            <p className="muted small">
              {rows.length} row(s) loaded · {rows.length - invalidCount} ready · {failureCount} with issues
              {summary ? ` · ${summary.created} added` : ''}
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Excel row</th><th>Name</th><th>Host</th><th>Site</th><th>Result</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const result = resultByRow.get(row.row);
                    const messages = [...row.errors, ...(result?.error ? [result.error] : [])];
                    return (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.payload.name || '—'}</td>
                        <td>{row.payload.host || '—'}</td>
                        <td>{row.payload.site || '—'}</td>
                        <td className={messages.length ? 'text-danger' : 'muted small'}>
                          {result?.success ? 'Added' : messages.join('; ') || (summary ? 'Not submitted' : 'Ready')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

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
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [filters, setFilters] = useState({ q: '', vendor: '', deviceType: '', site: '', location: '', reachable: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filters.q) params.q = filters.q;
      if (filters.vendor) params.vendor = filters.vendor;
      if (filters.deviceType) params.deviceType = filters.deviceType;
      if (filters.site) params.site = filters.site;
      if (filters.location) params.location = filters.location;
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
            <button type="button" className="btn ghost" onClick={() => downloadDeviceTemplate(meta, credentials)} disabled={!meta}>
              Download Excel template
            </button>
            <button type="button" className="btn ghost" onClick={() => setImporting(true)} disabled={!meta}>
              Import Excel
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
            value={filters.site}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, site: event.target.value }));
            }}
          >
            <option value="">All sites</option>
            {(meta?.sites || []).map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.location}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, location: event.target.value }));
            }}
          >
            <option value="">All locations</option>
            {(meta?.locations || []).map((location) => (
              <option key={location} value={location}>
                {location}
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
                        {device.site ? ` · ${device.site}` : ''}
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

      {importing && meta ? (
        <BulkDeviceImport
          meta={meta}
          credentials={credentials}
          onClose={() => setImporting(false)}
          onImported={load}
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
