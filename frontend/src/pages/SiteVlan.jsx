import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { ConfirmDialog, EmptyState, Field, Spinner, StatusBadge, useToast } from '../components/ui.jsx';

export default function SiteVlan() {
  const toast = useToast();
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState('');
  const [vlanId, setVlanId] = useState('');
  const [vlanName, setVlanName] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.get('/meta')
      .then(({ data }) => setSites(data.sites))
      .catch((error) => toast.error(apiErrorMessage(error)));
  }, [toast]);

  const payload = () => ({ site, vlanId: Number(vlanId), vlanName: vlanName.trim() });

  const getPreview = async (event) => {
    event.preventDefault();
    setLoading(true);
    setPreview(null);
    try {
      const { data } = await api.post('/templates/site-vlan/preview', payload());
      setPreview(data);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const createVlan = async () => {
    setQueueing(true);
    try {
      const { data } = await api.post('/templates/site-vlan', payload());
      toast.success(`VLAN ${data.job.variables.vlanId} queued for ${data.job.total} switch(es)`);
      setConfirming(false);
      navigate('/jobs');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setQueueing(false);
    }
  };

  const update = (setter) => (event) => {
    setter(event.target.value);
    setPreview(null);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Add VLAN to site switches</h2>
          <p className="muted small">Preview platform-specific configuration for every switch in the selected site before queueing changes.</p>
        </div>
      </div>

      <nav className="row gap wrap" aria-label="Template tools">
        <NavLink to="/templates" end className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          Configuration templates
        </NavLink>
        <NavLink to="/templates/site-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          Add VLAN to site
        </NavLink>
        <NavLink to="/templates/mac-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          MAC VLAN assignment
        </NavLink>
      </nav>

      <form className="card filters" onSubmit={getPreview}>
        <Field label="Site / plant" required>
          <select className="input" value={site} onChange={update(setSite)} required>
            <option value="">Select a site...</option>
            {sites.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="VLAN ID" required hint="Integer from 1 to 4094">
          <input className="input" type="number" min="1" max="4094" step="1" value={vlanId} onChange={update(setVlanId)} required />
        </Field>
        <Field label="VLAN name" hint="Optional; defaults to VLAN_<id>">
          <input className="input" value={vlanName} onChange={update(setVlanName)} maxLength="32" placeholder="Office_Data" />
        </Field>
        <button type="submit" className="btn primary" disabled={loading || !site || !vlanId}>
          {loading ? 'Building preview...' : 'Preview switches'}
        </button>
      </form>

      {loading ? <Spinner label={`Preparing VLAN ${vlanId} for ${site}...`} /> : null}

      {preview ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>VLAN {preview.vlanId} · {preview.vlanName}</h3>
              <span className="muted small">{preview.site} · {preview.total} switch(es)</span>
            </div>
            <button type="button" className="btn primary" disabled={!preview.canCreate} onClick={() => setConfirming(true)}>
              Add VLAN to all switches
            </button>
          </div>

          {!preview.total ? (
            <EmptyState title="No switches in this site" message="Assign switches to this site before creating a VLAN." />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Switch</th><th>Platform</th><th>Readiness</th><th>Configuration preview</th></tr></thead>
                <tbody>
                  {preview.devices.map((device) => (
                    <tr key={device.deviceId}>
                      <td>{device.name}<span className="muted small block">{device.host}</span></td>
                      <td>{device.vendor}<span className="muted small block">{device.platform || 'platform not specified'}</span></td>
                      <td>
                        <StatusBadge status={device.supported ? 'ready' : 'unsupported'} label={device.supported ? 'ready' : 'unsupported'} />
                        {device.message ? <span className="muted small block">{device.message}</span> : null}
                      </td>
                      <td>{device.config ? <pre className="config-view sm">{device.config}</pre> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!preview.canCreate && preview.total > 0 ? (
            <p className="notice notice-error" style={{ margin: 16 }}>
              VLAN creation is blocked until every switch has a supported driver or a device-specific VLAN creation command.
            </p>
          ) : null}
        </section>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Add VLAN to all site switches?"
          message={`This will add VLAN ${preview.vlanId} (${preview.vlanName}) to all ${preview.total} switches assigned to ${preview.site}, then save each switch configuration. The job will report success or failure per switch.`}
          confirmLabel={`Queue VLAN ${preview.vlanId}`}
          danger
          busy={queueing}
          onConfirm={createVlan}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}