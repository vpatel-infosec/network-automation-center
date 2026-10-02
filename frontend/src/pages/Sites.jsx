import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ConfirmDialog, EmptyState, Field, Modal, Spinner, useToast } from '../components/ui.jsx';

const EMPTY = {
  name: '',
  code: '',
  description: '',
  address: '',
  region: '',
  active: true,
};

function SiteForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        region: form.region.trim(),
        active: form.active,
      };
      const response = initial?._id
        ? await api.patch(`/sites/${initial._id}`, payload)
        : await api.post('/sites', payload);
      toast.success(initial?._id ? 'Site updated' : 'Site created');
      onSaved(response.data.site);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'New site'}
      subtitle="Define a physical site or campus and reuse it across devices and filters"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="site-form" className="btn primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save site'}
          </button>
        </>
      }
    >
      <form id="site-form" className="form-grid" onSubmit={submit}>
        <Field label="Site name" required>
          <input className="input" value={form.name} onChange={update('name')} placeholder="HQ" required />
        </Field>
        <Field label="Site code">
          <input className="input" value={form.code} onChange={update('code')} placeholder="HQ-01" />
        </Field>
        <Field label="Region">
          <input className="input" value={form.region} onChange={update('region')} placeholder="North America" />
        </Field>
        <Field label="Address">
          <input className="input" value={form.address} onChange={update('address')} placeholder="1 Main St, Dallas" />
        </Field>
        <Field label="Description" className="span-2">
          <input className="input" value={form.description} onChange={update('description')} placeholder="Primary campus / core data center" />
        </Field>
        <Field label="Active">
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={update('active')} />
            <span>Site enabled</span>
          </label>
        </Field>
      </form>
    </Modal>
  );
}

export default function Sites() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sites');
      setItems(data.items);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    try {
      await api.delete(`/sites/${deleting._id}`);
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Sites</h2>
          <p className="muted small">Define campuses, offices, branches and geo locations for your managed network estate.</p>
        </div>
        {canOperate ? (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New site
          </button>
        ) : null}
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading sites..." />
        ) : items.length === 0 ? (
          <EmptyState title="No sites configured" message="Add a site to organize devices by campus, branch, data center or region." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Region</th>
                <th>Address</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((site) => (
                <tr key={site._id}>
                  <td>
                    {site.name}
                    {site.description ? <span className="muted small block">{site.description}</span> : null}
                  </td>
                  <td className="muted small">{site.code || '—'}</td>
                  <td className="muted small">{site.region || '—'}</td>
                  <td className="muted small">{site.address || '—'}</td>
                  <td>
                    <span className={`badge ${site.active ? 'badge-ok' : 'badge-muted'}`}>
                      {site.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    {canOperate ? (
                      <button type="button" className="btn ghost sm" onClick={() => setEditing(site)}>
                        Edit
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button type="button" className="btn danger sm" onClick={() => setDeleting(site)}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating ? (
        <SiteForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <SiteForm
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
          message="This site will be removed from the site catalog and will no longer appear as a selectable option."
          confirmLabel="Delete site"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
