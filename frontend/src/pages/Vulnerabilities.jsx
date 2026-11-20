import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ConfirmDialog, EmptyState, Modal, Spinner, timeAgo, useToast } from '../components/ui.jsx';
import { CreateChecklistModal, RunScanModal, ScanDetailModal } from '../components/VulnerabilityModals.jsx';

export default function Vulnerabilities() {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const canOperate = user?.role !== 'viewer';

  const [tab, setTab] = useState('checklists');
  const [checklists, setChecklists] = useState([]);
  const [scans, setScans] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creatingChecklist, setCreatingChecklist] = useState(false);
  const [scanningChecklist, setScanningChecklist] = useState(null);
  const [viewingScan, setViewingScan] = useState(null);
  const [scanDetail, setScanDetail] = useState(null);
  const [deletingChecklist, setDeletingChecklist] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [resC, resS, resD] = await Promise.all([
        api.get('/vulnerabilities/checklists'),
        api.get('/vulnerabilities/scans'),
        api.get('/devices/all'),
      ]);
      setChecklists(resC.data.items || []);
      setScans(resS.data.items || []);
      setDevices(resD.data.items || []);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadScanDetail = async (scanId) => {
    try {
      const { data } = await api.get('/vulnerabilities/scans/' + scanId);
      setScanDetail(data.scan);
    } catch (err) { toast.error(apiErrorMessage(err)); }
  };

  const handleCreateChecklist = async (payload) => {
    try {
      await api.post('/vulnerabilities/checklists', payload);
      toast.success('Checklist created successfully');
      setCreatingChecklist(false);
      loadData();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleRunScan = async (checklistId, name, deviceIds) => {
    try {
      await api.post('/vulnerabilities/checklists/' + checklistId + '/scan', { name, deviceIds });
      toast.success('Assessment scan started');
      setScanningChecklist(null);
      setTab('scans');
      loadData();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDeleteChecklist = async () => {
    if (!deletingChecklist) return;
    try {
      await api.delete('/vulnerabilities/checklists/' + deletingChecklist._id);
      toast.success('Checklist deleted');
      setDeletingChecklist(null);
      loadData();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  if (loading) return <Spinner full label="Loading assessment data..." />;

  return (
    <div className="space-y">
      <div className="page-head">
        <div>
          <h2>🛡️ Vulnerability Assessment</h2>
          <p className="muted">Upload assessment checklists, execute security scans against devices, and inspect findings.</p>
        </div>
        <div className="actions">
          {canOperate && (
            <button type="button" className="btn primary" onClick={() => setCreatingChecklist(true)}>
              + Upload Checklist
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={'tab ' + (tab === 'checklists' ? 'active' : '')} onClick={() => setTab('checklists')}>
          Checklists ({checklists.length})
        </button>
        <button type="button" className={'tab ' + (tab === 'scans' ? 'active' : '')} onClick={() => setTab('scans')}>
          Scan Reports ({scans.length})
        </button>
      </div>

      {tab === 'checklists' && (
        <div className="card">
          {!checklists.length ? (
            <EmptyState title="No checklists" message="Upload an assessment checklist document (Excel/CSV)." />
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>Description</th><th>Checks</th><th>Created</th><th /></tr></thead>
              <tbody>
                {checklists.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description || '—'}</td>
                    <td><span className="badge badge-info">{item.items?.length || 0} checks</span></td>
                    <td className="muted small">{timeAgo(item.createdAt)}</td>
                    <td className="actions">
                      {canOperate && <button type="button" className="btn primary sm" onClick={() => setScanningChecklist(item)}>Run Scan</button>}
                      {isAdmin && <button type="button" className="btn danger sm" onClick={() => setDeletingChecklist(item)}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'scans' && (
        <div className="card">
          {!scans.length ? (
            <EmptyState title="No scan reports" message="Run an assessment scan against target devices." />
          ) : (
            <table className="table">
              <thead><tr><th>Scan Name</th><th>Checklist</th><th>Status</th><th>Progress</th><th>Date</th><th /></tr></thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan._id}>
                    <td><strong>{scan.name}</strong></td>
                    <td className="muted">{scan.checklistName}</td>
                    <td><span className={'badge ' + (scan.status === 'completed' ? 'badge-ok' : scan.status === 'running' ? 'badge-info' : 'badge-muted')}>{scan.status}</span></td>
                    <td className="small">{scan.completedDevices} / {scan.totalDevices} devices</td>
                    <td className="muted small">{timeAgo(scan.createdAt)}</td>
                    <td className="actions">
                      <button type="button" className="btn ghost sm" onClick={() => { setViewingScan(scan); loadScanDetail(scan._id); }}>View Report</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {creatingChecklist && <CreateChecklistModal onClose={() => setCreatingChecklist(false)} onSave={handleCreateChecklist} />}
      {scanningChecklist && <RunScanModal checklist={scanningChecklist} devices={devices} onClose={() => setScanningChecklist(null)} onRun={handleRunScan} />}
      {viewingScan && scanDetail && <ScanDetailModal scan={scanDetail} onClose={() => { setViewingScan(null); setScanDetail(null); }} />}
      {deletingChecklist && (
        <ConfirmDialog title={'Delete "' + deletingChecklist.name + '"?'} message="This cannot be undone." confirmLabel="Delete" danger onConfirm={handleDeleteChecklist} onCancel={() => setDeletingChecklist(null)} />
      )}
    </div>
  );
}
