import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { strToU8, zipSync } from 'fflate';
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
import DevicePicker from '../components/DevicePicker.jsx';
import BackupModuleTabs from '../components/BackupModuleTabs.jsx';

const PAGE_SIZE = 25;

function safeFilenamePart(value) {
  return String(value || 'device').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'device';
}

function BackupGroupModal({ initial, devices, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [selected, setSelected] = useState(() => (initial?.devices || []).map((device) => String(device._id || device)));
  const [busy, setBusy] = useState(false);

  const toggleDevice = (id) => setSelected((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { name: name.trim(), description: description.trim(), deviceIds: selected };
      const response = initial?._id
        ? await api.patch(`/backup-groups/${initial._id}`, payload)
        : await api.post('/backup-groups', payload);
      toast.success(initial?._id ? 'Backup group updated' : 'Backup group created');
      onSaved(response.data.group);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'Create backup group'}
      subtitle="Choose registered devices to back up together."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="backup-group-form" className="btn primary" disabled={busy || name.trim().length < 2}>
            {busy ? 'Saving...' : 'Save group'}
          </button>
        </>
      }
    >
      <form id="backup-group-form" className="form-grid" onSubmit={save}>
        <Field label="Group name" required>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength="80" required />
        </Field>
        <Field label="Description">
          <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" />
        </Field>
        <div className="span-2">
          <span className="field-label">Devices ({selected.length} selected)</span>
          <DevicePicker devices={devices} selected={selected} onToggle={toggleDevice} height={300} />
        </div>
      </form>
    </Modal>
  );
}

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
  const [downloading, setDownloading] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [queueingBackup, setQueueingBackup] = useState(false);

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
    api.get('/backup-groups').then(({ data }) => setGroups(data.items || [])).catch(() => {});
    api.get('/configs/storage/status').then(({ data }) => setStorageStatus(data)).catch(() => {});
  }, []);

  const selectedGroup = groups.find((group) => group._id === selectedGroupId);

  const selectGroup = (groupId) => {
    setSelectedGroupId(groupId);
    const group = groups.find((item) => item._id === groupId);
    setSelectedDevices((group?.devices || []).map((device) => String(device._id || device)));
  };

  const toggleBackupDevice = (deviceId) => {
    setSelectedGroupId('');
    setSelectedDevices((current) => current.includes(deviceId)
      ? current.filter((id) => id !== deviceId)
      : [...current, deviceId]);
  };

  const saveGroup = (group) => {
    setGroups((current) => [...current.filter((item) => item._id !== group._id), group].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedGroupId(group._id);
    setSelectedDevices((group.devices || []).map((device) => String(device._id || device)));
    setEditingGroup(null);
  };

  const removeGroup = async () => {
    try {
      await api.delete(`/backup-groups/${deletingGroup._id}`);
      setGroups((current) => current.filter((group) => group._id !== deletingGroup._id));
      if (selectedGroupId === deletingGroup._id) {
        setSelectedGroupId('');
        setSelectedDevices([]);
      }
      toast.success(`${deletingGroup.name} deleted`);
      setDeletingGroup(null);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const runBackup = async () => {
    if (!selectedDevices.length) return;
    setQueueingBackup(true);
    try {
      const name = selectedGroup ? `Backup group: ${selectedGroup.name}` : `Backup ${selectedDevices.length} device(s)`;
      const { data } = await api.post('/jobs', { type: 'backup', name, deviceIds: selectedDevices });
      toast.success(`Backup job queued: ${data.job.name}`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setQueueingBackup(false);
    }
  };

  const toggleVersion = (versionId) => setSelectedVersions((current) => {
    if (current.includes(versionId)) return current.filter((id) => id !== versionId);
    if (current.length >= 50) {
      toast.error('Export is limited to 50 snapshots at a time.');
      return current;
    }
    return [...current, versionId];
  });

  const exportSelected = async () => {
    if (!selectedVersions.length) return;
    setExporting(true);
    try {
      const responses = await Promise.all(selectedVersions.map((versionId) => api.get(`/configs/${versionId}`)));
      const manifest = [];
      const files = {};
      for (const response of responses) {
        const version = response.data.version;
        const deviceName = safeFilenamePart(version.device?.name || version.device?.host);
        const deviceId = safeFilenamePart(version.device?._id || 'device');
        const deviceFolder = `${safeFilenamePart(version.device?.host || 'no-ip')}_${deviceName}-${deviceId}`;
        const filename = `${deviceFolder}/running-config-v${version.version}.cfg`;
        files[filename] = strToU8(version.content);
        const startupFilename = version.startupStatus === 'stored' && version.startupContent
          ? `${deviceFolder}/startup-config-v${version.version}.cfg`
          : '';
        if (startupFilename) files[startupFilename] = strToU8(version.startupContent);
        manifest.push({
          filename,
          startupFilename,
          startupStatus: version.startupStatus || 'unsupported',
          startupError: version.startupError || '',
          device: version.device?.name || version.device?.host || 'unknown',
          host: version.device?.host || '',
          version: version.version,
          trigger: version.trigger,
          hash: version.hash,
          createdAt: version.createdAt,
        });
      }
      files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
      const archive = zipSync(files, { level: 6 });
      const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `network-backups-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`Exported ${manifest.length} backup snapshot(s)`);
      setSelectedVersions([]);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setExporting(false);
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

  const downloadVersion = async (versionId, artifact = 'running') => {
    setDownloading(versionId);
    try {
      const { data } = await api.get(`/configs/${versionId}`);
      const version = data.version;
      const deviceName = safeFilenamePart(version.device?.name || version.device?.host);
      const capturedAt = new Date(version.createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const isStartup = artifact === 'startup';
      if (isStartup && (version.startupStatus !== 'stored' || !version.startupContent)) {
        throw new Error(version.startupError || 'Startup config was not captured for this version.');
      }
      const filename = `${safeFilenamePart(version.device?.host || 'no-ip')}-${deviceName}-${isStartup ? 'startup' : 'running'}-v${version.version}-${capturedAt}.cfg`;
      const content = isStartup ? version.startupContent : version.content;
      const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setDownloading('');
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
      setSelectedVersions((current) => current.filter((id) => id !== deleting._id));
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
          <h2>Backups</h2>
          <p className="muted small">{total} stored snapshot(s) · grouped runs, export, version history, diff and restore</p>
        </div>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={exportSelected} disabled={!selectedVersions.length || exporting}>
            {exporting ? 'Exporting...' : `Export selected${selectedVersions.length ? ` (${selectedVersions.length})` : ''}`}
          </button>
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

      <BackupModuleTabs active="backups" />

      {canOperate ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Run backup</h3>
              <span className="muted small">Queue a backup for a saved group or selected devices.</span>
            </div>
            <div className="row gap wrap">
              <span className="badge badge-ok">MongoDB primary</span>
              <span className={`badge ${storageStatus?.fileServer?.enabled ? 'badge-ok' : 'badge-muted'}`}>
                File server {storageStatus ? (storageStatus.fileServer.enabled ? 'enabled' : 'not configured') : 'checking'}
              </span>
              <span className={`badge ${storageStatus?.cloud?.enabled ? 'badge-ok' : 'badge-muted'}`}>
                Cloud {storageStatus ? (storageStatus.cloud.enabled ? `enabled · ${storageStatus.cloud.provider}` : 'not configured') : 'checking'}
              </span>
            </div>
          </div>
          <div className="filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label className="field">
              <span className="field-label">Backup group</span>
              <select className="input" value={selectedGroupId} onChange={(event) => selectGroup(event.target.value)}>
                <option value="">Choose devices manually</option>
                {groups.map((group) => <option key={group._id} value={group._id}>{group.name} ({group.devices.length})</option>)}
              </select>
            </label>
            <button type="button" className="btn ghost" onClick={() => setEditingGroup({})}>New group</button>
            <button type="button" className="btn ghost" onClick={() => setEditingGroup(selectedGroup)} disabled={!selectedGroup}>Edit group</button>
            <button type="button" className="btn danger" onClick={() => setDeletingGroup(selectedGroup)} disabled={!selectedGroup}>Delete group</button>
          </div>
          <div className="grid two" style={{ padding: 16 }}>
            <div>
              <span className="field-label">Devices to back up ({selectedDevices.length} selected)</span>
              <DevicePicker devices={devices} selected={selectedDevices} onToggle={toggleBackupDevice} height={240} />
            </div>
            <div className="stack">
              {selectedGroup?.description ? <p className="muted small">{selectedGroup.description}</p> : null}
              <p className="muted small">Snapshots remain in MongoDB. Enabled file-server and S3-compatible destinations receive a copy when each backup completes.</p>
              <button type="button" className="btn primary" onClick={runBackup} disabled={!selectedDevices.length || queueingBackup}>
                {queueingBackup ? 'Queueing backup...' : `Back up ${selectedDevices.length} device(s)`}
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all snapshots on this page"
                      checked={items.length > 0 && items.every((item) => selectedVersions.includes(item._id))}
                      onChange={() => {
                        const pageIds = items.map((item) => item._id);
                        const allSelected = pageIds.every((id) => selectedVersions.includes(id));
                        setSelectedVersions((current) => allSelected
                          ? current.filter((id) => !pageIds.includes(id))
                          : [...new Set([...current, ...pageIds])].slice(0, 50));
                      }}
                    />
                  </th>
                  <th>Device</th>
                  <th>Version</th>
                  <th>Trigger</th>
                  <th>Startup</th>
                  <th>Storage</th>
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
                        <input
                          type="checkbox"
                          aria-label={`Select ${version.device?.name || 'device'} version ${version.version}`}
                          checked={selectedVersions.includes(version._id)}
                          onChange={() => toggleVersion(version._id)}
                        />
                      </td>
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
                      <td>
                        <span
                          className={`badge ${version.startupStatus === 'stored' ? 'badge-ok' : version.startupStatus === 'failed' ? 'badge-bad' : 'badge-muted'}`}
                          title={version.startupError || version.startupCommand || ''}
                        >
                          {version.startupStatus || 'unsupported'}
                        </span>
                      </td>
                      <td>
                        <div className="row gap wrap">
                          <span className="badge badge-ok">MongoDB</span>
                          {(version.storage || []).map((target) => (
                            <span key={target.provider} className={`badge ${target.status === 'stored' ? 'badge-ok' : 'badge-bad'}`} title={target.error || target.key}>
                              {target.provider === 'file_server' ? 'File server' : 'Cloud'} {target.status}
                            </span>
                          ))}
                        </div>
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
                        <button type="button" className="btn ghost sm" onClick={() => downloadVersion(version._id, 'running')} disabled={downloading === version._id}>
                          {downloading === version._id ? 'Downloading...' : 'Running'}
                        </button>
                        {version.startupStatus === 'stored' ? (
                          <button type="button" className="btn ghost sm" onClick={() => downloadVersion(version._id, 'startup')} disabled={downloading === version._id}>
                            Startup
                          </button>
                        ) : null}
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

      {editingGroup ? (
        <BackupGroupModal
          initial={editingGroup._id ? editingGroup : null}
          devices={devices}
          onClose={() => setEditingGroup(null)}
          onSaved={saveGroup}
        />
      ) : null}

      {deletingGroup ? (
        <ConfirmDialog
          title={`Delete backup group ${deletingGroup.name}?`}
          message="The saved group will be removed. Device records and existing backup snapshots are not affected."
          confirmLabel="Delete group"
          danger
          onConfirm={removeGroup}
          onCancel={() => setDeletingGroup(null)}
        />
      ) : null}
    </div>
  );
}
