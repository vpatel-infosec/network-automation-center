import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { Dot, Spinner, StatusBadge, timeAgo, titleCase, useToast } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function parseCsv(content) {
  const text = String(content).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function readMonitoringFile(file) {
  let table;
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const readExcelFile = (await import('read-excel-file/browser')).default;
    const sheets = await readExcelFile(file);
    const sheet = sheets.find((item) => item.sheet === 'Monitoring') || sheets[0];
    table = sheet?.data || [];
  } else {
    table = parseCsv(await file.text());
  }

  const [headerRow, ...dataRows] = table;
  const headers = (headerRow || []).map((header) => String(header ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ''));
  const nameIndex = headers.indexOf('name');
  const hostIndex = headers.findIndex((header) => ['host', 'ip', 'ipaddress', 'managementip'].includes(header));
  if (nameIndex < 0 && hostIndex < 0) throw new Error('Include a name and/or host (IP) column in the file.');

  const rows = dataRows.flatMap((values, index) => {
    const name = nameIndex >= 0 ? String(values[nameIndex] ?? '').trim() : '';
    const host = hostIndex >= 0 ? String(values[hostIndex] ?? '').trim() : '';
    if (!name && !host) return [];
    return [{ rowNumber: index + 2, name, host }];
  });
  if (!rows.length) throw new Error('The file has no device rows.');
  if (rows.length > 500) throw new Error('Monitoring checks are limited to 500 file rows.');
  return rows;
}

function matchUploadedRows(rows, devices) {
  const byName = new Map();
  const byHost = new Map();
  const add = (map, key, device) => {
    if (!key) return;
    const normalized = key.trim().toLowerCase();
    map.set(normalized, [...(map.get(normalized) || []), device]);
  };
  devices.forEach((device) => {
    add(byName, String(device.name || ''), device);
    add(byHost, String(device.host || ''), device);
  });

  return rows.map((row) => {
    const nameMatches = row.name ? byName.get(row.name.toLowerCase()) || [] : null;
    const hostMatches = row.host ? byHost.get(row.host.toLowerCase()) || [] : null;
    if ((nameMatches && nameMatches.length !== 1) || (hostMatches && hostMatches.length !== 1)) {
      return { ...row, issue: 'No unique registered device matches this row.' };
    }
    const candidates = [nameMatches?.[0], hostMatches?.[0]].filter(Boolean);
    if (!candidates.length) return { ...row, issue: 'Device is not in the registered inventory.' };
    if (new Set(candidates.map((device) => String(device._id))).size !== 1) {
      return { ...row, issue: 'Name and host match different devices.' };
    }
    return { ...row, device: candidates[0] };
  });
}

function downloadMonitoringTemplate() {
  const blob = new Blob(['name,host\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'monitoring-check-template.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilenamePart(value) {
  return String(value || 'device').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'device';
}

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
  const [checkingLive, setCheckingLive] = useState(false);
  const [buildingTopology, setBuildingTopology] = useState(false);
  const [liveCheckedAt, setLiveCheckedAt] = useState(null);
  const [liveCheckedDeviceIds, setLiveCheckedDeviceIds] = useState([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedRows, setUploadedRows] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [checkingUpload, setCheckingUpload] = useState(false);
  const [backupDownloadId, setBackupDownloadId] = useState('');
  const [savedTopologies, setSavedTopologies] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState('');
  const [selectedLiveDeviceId, setSelectedLiveDeviceId] = useState('');
  const [liveDeviceSearch, setLiveDeviceSearch] = useState('');
  const [savingLiveDevice, setSavingLiveDevice] = useState(false);
  const toast = useToast();
  const { canOperate } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/devices/monitoring');
      setMonitoring(data);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    api.get('/topology/saved').then(({ data }) => setSavedTopologies(data || [])).catch(() => {});
  }, [load]);

  const checkDevicesLive = async () => {
    setCheckingLive(true);
    try {
      const { data } = await api.post('/devices/monitoring/check', {});
      setLiveCheckedAt(new Date());
      setLiveCheckedDeviceIds(data.results.map((result) => result.deviceId));
      toast.success(`Live check complete: ${data.online} online, ${data.offline} offline`);
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setCheckingLive(false);
    }
  };

  const handleMonitoringUpload = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!/\.(?:csv|xlsx)$/i.test(file.name)) {
      toast.error('Choose a CSV or Excel (.xlsx) file.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Monitoring files are limited to 5 MB.');
      input.value = '';
      return;
    }

    setUploading(true);
    setUploadedRows([]);
    try {
      const rows = await readMonitoringFile(file);
      const devices = [...monitoring.onlineDevices, ...monitoring.offlineDevices];
      setUploadedRows(matchUploadedRows(rows, devices));
      setUploadedFileName(file.name);
    } catch (error) {
      setUploadedFileName('');
      toast.error(error.message || 'Could not read this monitoring file.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  const checkUploadedDevices = async () => {
    const deviceIds = [...new Set(uploadedRows.filter((row) => row.device).map((row) => String(row.device._id)))];
    if (!deviceIds.length) return;
    setCheckingUpload(true);
    try {
      const { data } = await api.post('/devices/monitoring/check', { deviceIds });
      const resultsById = new Map(data.results.map((result) => [result.deviceId, result]));
      setUploadedRows((current) => current.map((row) => row.device
        ? { ...row, check: resultsById.get(String(row.device._id)) }
        : row));
      setLiveCheckedAt(new Date());
      setLiveCheckedDeviceIds(deviceIds);
      toast.success(`File check complete: ${data.online} online, ${data.offline} offline`);
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setCheckingUpload(false);
    }
  };

  const backupAndDownload = async (device) => {
    setBackupDownloadId(String(device._id));
    try {
      const { data: backup } = await api.post(`/devices/${device._id}/backup`);
      let versionId = backup.configVersionId;
      if (!versionId) {
        const { data: history } = await api.get('/configs', { params: { device: device._id, limit: 1 } });
        versionId = history.items[0]?._id;
      }
      if (!versionId) throw new Error('No stored configuration version is available to download.');

      const { data } = await api.get(`/configs/${versionId}`);
      const version = data.version;
      const capturedAt = new Date(version.createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const filename = `${safeFilenamePart(device.name)}-v${version.version}-${capturedAt}.cfg`;
      const url = URL.createObjectURL(new Blob([version.content], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`Backup v${version.version} downloaded for ${device.name}`);
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBackupDownloadId('');
    }
  };

  const buildAndSaveTopology = async () => {
    const name = snapshotName.trim();
    const deviceIds = monitoring.onlineDevices
      .map((device) => String(device._id))
      .filter((deviceId) => liveCheckedDeviceIds.includes(deviceId));
    if (!liveCheckedAt || !deviceIds.length || !name) return;

    setBuildingTopology(true);
    try {
      const { data } = await api.post('/topology/build', { deviceIds, name });
      setSnapshotName('');
      const { data: saved } = await api.get('/topology/saved');
      setSavedTopologies(saved || []);
      setSelectedSnapshot(name);
      toast.success(`Saved "${name}" with ${data.nodes?.length || 0} devices and ${data.links?.length || 0} links`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBuildingTopology(false);
    }
  };

  const checkedLiveDevices = monitoring.onlineDevices.filter((device) =>
    liveCheckedDeviceIds.includes(String(device._id))
  );
  const liveDeviceOptions = (liveCheckedAt ? checkedLiveDevices : monitoring.onlineDevices).filter((device) => {
    const query = liveDeviceSearch.trim().toLowerCase();
    return !query || `${device.name} ${device.host}`.toLowerCase().includes(query);
  });
  const targetSnapshot = savedTopologies.find((entry) => entry.name === selectedSnapshot);
  const selectedLiveDevice = monitoring.onlineDevices.find((device) => String(device._id) === selectedLiveDeviceId);
  const selectedDeviceWasChecked = liveCheckedAt && liveCheckedDeviceIds.includes(selectedLiveDeviceId);
  const normalizeNodeValue = (value) => String(value || '').trim().toLowerCase();
  const alreadyInSnapshot = Boolean(targetSnapshot && selectedLiveDevice && (targetSnapshot.nodes || []).some((node) => {
    const existing = [node.id, node.label, node.hostname, node.host, node.ipAddress].map(normalizeNodeValue);
    return [selectedLiveDevice.name, selectedLiveDevice.host].some((value) => existing.includes(normalizeNodeValue(value)));
  }));

  const addLiveDeviceToSnapshot = async () => {
    if (!targetSnapshot || !selectedLiveDevice || alreadyInSnapshot) return;
    setSavingLiveDevice(true);
    const host = selectedLiveDevice.host || '';
    const label = selectedLiveDevice.name || host;
    const nodeId = label || String(selectedLiveDevice._id);
    const graph = {
      nodes: [
        ...(targetSnapshot.nodes || []),
        {
          id: nodeId,
          label,
          hostname: selectedLiveDevice.name || label,
          host,
          ipAddress: host,
          vendor: selectedLiveDevice.vendor || 'generic',
          deviceType: selectedLiveDevice.deviceType || 'other',
          reachable: true,
          ports: [],
          port: '',
        },
      ],
      links: targetSnapshot.links || [],
      protocols: targetSnapshot.protocols || [],
      generatedAt: new Date().toISOString(),
    };
    try {
      const { data } = await api.post('/topology/save', { name: targetSnapshot.name, graph });
      setSavedTopologies((current) => [data, ...current.filter((entry) => entry.name !== data.name)]);
      setSelectedLiveDeviceId('');
      toast.success(`Added ${label} to ${targetSnapshot.name}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSavingLiveDevice(false);
    }
  };

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

      {canOperate ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Live devices and topology</h3>
              <span className="muted small">
                {liveCheckedAt ? `Last live check: ${liveCheckedAt.toLocaleString()} · ${monitoring.onlineDevices.filter((device) => liveCheckedDeviceIds.includes(String(device._id))).length} reachable checked device(s)` : 'Run a live check before building a topology snapshot.'}
              </span>
            </div>
            <button type="button" className="btn ghost" onClick={checkDevicesLive} disabled={checkingLive || buildingTopology}>
              {checkingLive ? 'Checking devices...' : 'Check devices live'}
            </button>
          </div>
          <div className="filters" style={{ gridTemplateColumns: 'minmax(220px, 1fr) auto' }}>
            <div className="field">
              <label className="field-label" htmlFor="monitoring-topology-name">Save topology as</label>
              <input
                id="monitoring-topology-name"
                className="input"
                value={snapshotName}
                onChange={(event) => setSnapshotName(event.target.value)}
                placeholder="Plant 1 live topology"
                maxLength="120"
              />
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={buildAndSaveTopology}
              disabled={buildingTopology || checkingLive || checkingUpload || !liveCheckedAt || !monitoring.onlineDevices.some((device) => liveCheckedDeviceIds.includes(String(device._id))) || !snapshotName.trim()}
            >
              {buildingTopology ? 'Building and saving...' : 'Build & save topology'}
            </button>
          </div>
        </section>
      ) : null}

      {canOperate ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Add live device to saved topology</h3>
              <span className="muted small">Only devices confirmed online in the latest live check are available. Existing links are preserved; this device is added as an unlinked node.</span>
            </div>
          </div>
          <div className="filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label className="field">
              <span className="field-label">Saved topology</span>
              <select className="input" value={selectedSnapshot} onChange={(event) => setSelectedSnapshot(event.target.value)}>
                <option value="">Select a saved topology...</option>
                {savedTopologies.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Find by IP or hostname</span>
              <input
                className="input"
                type="search"
                value={liveDeviceSearch}
                onChange={(event) => {
                  setLiveDeviceSearch(event.target.value);
                  setSelectedLiveDeviceId('');
                }}
                placeholder="Search IP or hostname"
              />
            </label>
            <label className="field">
              <span className="field-label">Live device</span>
              <select className="input" value={selectedLiveDeviceId} onChange={(event) => setSelectedLiveDeviceId(event.target.value)} disabled={checkingLive || checkingUpload}>
                <option value="">
                  {!liveDeviceOptions.length ? 'No online device matches...' : liveCheckedAt ? 'Select a checked online device...' : 'Select a known online device...'}
                </option>
                {liveDeviceOptions.map((device) => (
                  <option key={device._id} value={String(device._id)}>
                    {device.name} ({device.host}){liveCheckedDeviceIds.includes(String(device._id)) ? ' · live checked' : ' · check required'}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Action</span>
              <button type="button" className="btn primary" onClick={addLiveDeviceToSnapshot} disabled={savingLiveDevice || checkingLive || checkingUpload || !targetSnapshot || !selectedLiveDevice || !selectedDeviceWasChecked || alreadyInSnapshot}>
                {savingLiveDevice ? 'Saving device...' : 'Add live device'}
              </button>
            </div>
          </div>
          {!savedTopologies.length ? <p className="muted small pad">Save a topology snapshot above before adding devices to it.</p> : null}
          {alreadyInSnapshot ? <p className="muted small pad">This device is already in the selected topology.</p> : null}
        </section>
      ) : null}

      {canOperate ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Check devices from file</h3>
              <span className="muted small">Upload registered device names or management IPs. Unmatched or conflicting rows are not checked.</span>
            </div>
            <div className="row gap">
              <button type="button" className="btn ghost" onClick={downloadMonitoringTemplate}>
                Download CSV template
              </button>
              <button type="button" className="btn primary" onClick={checkUploadedDevices} disabled={checkingUpload || checkingLive || !uploadedRows.some((row) => row.device)}>
                {checkingUpload ? 'Checking uploaded devices...' : 'Check matched devices'}
              </button>
            </div>
          </div>
          <div className="filters" style={{ gridTemplateColumns: 'minmax(220px, 1fr)' }}>
            <label className="field">
              <span className="field-label">Device list (.csv or .xlsx)</span>
              <input className="input" type="file" accept=".csv,.xlsx" onChange={handleMonitoringUpload} disabled={uploading || checkingUpload} />
              {uploading ? <span className="field-hint">Reading file...</span> : null}
            </label>
          </div>
          {uploadedRows.length ? (
            <>
              <div className="card-head">
                <span className="muted small">{uploadedFileName} · {uploadedRows.length} row(s) · {uploadedRows.filter((row) => row.device).length} matched</span>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>File row</th><th>Name</th><th>Host</th><th>Registered device</th><th>Live result</th></tr></thead>
                  <tbody>
                    {uploadedRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.name || '—'}</td>
                        <td className="muted small">{row.host || '—'}</td>
                        <td>{row.device ? <Link className="link" to={`/devices/${row.device._id}`}>{row.device.name}</Link> : row.issue}</td>
                        <td>
                          {row.check ? <StatusBadge status={row.check.reachable ? 'success' : 'failed'} label={row.check.reachable ? `Online${row.check.latencyMs ? ` · ${row.check.latencyMs} ms` : ''}` : row.check.error || 'Offline'} /> : row.device ? <span className="muted small">Ready to check</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

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
                  {canOperate ? <th>Backup</th> : null}
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
                    {canOperate ? (
                      <td>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => backupAndDownload(device)}
                          disabled={Boolean(backupDownloadId)}
                        >
                          {backupDownloadId === String(device._id) ? 'Backing up...' : 'Backup & download'}
                        </button>
                      </td>
                    ) : null}
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
