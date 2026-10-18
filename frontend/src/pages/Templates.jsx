import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Spinner,
  timeAgo,
  useToast,
} from '../components/ui.jsx';
import DevicePicker from '../components/DevicePicker.jsx';

function PushTemplateModal({ template, devices, onClose, onPushed }) {
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [values, setValues] = useState(() =>
    Object.fromEntries((template.variables || []).map((variable) => [variable.name, variable.defaultValue || '']))
  );
  const [backupAfter, setBackupAfter] = useState(true);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (id) =>
    setSelected((list) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]));

  const variables = template.variables || [];

  const doPreview = async () => {
    try {
      const { data } = await api.post(`/templates/${template._id}/preview`, {
        variables: values,
        deviceId: selected[0],
      });
      setPreview(data.rendered);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const push = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/templates/${template._id}/push`, {
        deviceIds: selected,
        variables: values,
        options: { backupAfter, persist: true },
      });
      toast.success(`Push job queued for ${selected.length} device(s)`);
      onPushed(data.job);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Push "${template.name}"`}
      subtitle="Select target devices, fill in the variables and review the rendered configuration"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={doPreview} disabled={!selected.length}>
            Preview
          </button>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={push} disabled={busy || !selected.length}>
            {busy ? 'Queueing...' : `Queue push to ${selected.length} device(s)`}
          </button>
        </>
      }
    >
      <div className="grid two">
        <div>
          <span className="field-label">Target devices ({selected.length} selected)</span>
          <DevicePicker devices={devices} selected={selected} onToggle={toggle} />
          <Field label="Take a backup automatically after a successful push">
            <input
              type="checkbox"
              checked={backupAfter}
              onChange={(event) => setBackupAfter(event.target.checked)}
            />
          </Field>
        </div>
        <div>
          <span className="field-label">Variables</span>
          {variables.length ? (
            variables.map((variable) => (
              <Field key={variable.name} label={variable.label || variable.name} hint={variable.description}>
                <input
                  className="input"
                  value={values[variable.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [variable.name]: event.target.value }))
                  }
                />
              </Field>
            ))
          ) : (
            <p className="muted small">This template has no variables — it only uses device facts.</p>
          )}
          {preview ? (
            <>
              <span className="field-label">Rendered preview</span>
              <pre className="config-view sm">{preview}</pre>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
const VARIABLE_RE = /{{{?\s*([A-Za-z_][A-Za-z0-9_.]*)\s*}?}}/g;
const RESERVED = new Set(['else', 'this', 'true', 'false', 'null', 'undefined', 'device']);

/** Mirrors the server-side extraction so the editor can show live feedback. */
function extractVariables(content) {
  const found = new Set();
  let match = VARIABLE_RE.exec(String(content ?? ''));
  while (match !== null) {
    const name = match[1];
    if (!RESERVED.has(name) && !name.startsWith('device.')) found.add(name);
    match = VARIABLE_RE.exec(String(content ?? ''));
    VARIABLE_RE.lastIndex = match ? VARIABLE_RE.lastIndex : 0;
  }
  return [...found];
}

const SAMPLE = `hostname {{hostname}}
!
vlan {{vlan_id}}
 name {{vlan_name}}
!
interface {{uplink}} 
 description Uplink to core`;

function TemplateForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    description: initial?.description || '',
    content: initial?.content || SAMPLE,
    tags: (initial?.tags || []).join(', '),
  }));
  const [busy, setBusy] = useState(false);

  const variables = useMemo(() => extractVariables(form.content), [form.content]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        content: form.content,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        variables: (initial?.variables || [])
          .filter((variable) => variables.includes(variable.name))
          .map((variable) => ({
            name: variable.name,
            label: variable.label || variable.name,
            description: variable.description || '',
            required: variable.required !== false,
            defaultValue: variable.defaultValue || '',
          })),
      };
      const response = initial?._id
        ? await api.patch(`/templates/${initial._id}`, payload)
        : await api.post('/templates', payload);
      toast.success(initial?._id ? 'Template updated' : 'Template created');
      onSaved(response.data.template);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'New configuration template'}
      subtitle="Handlebars syntax · {{variable}} placeholders are filled per device at push time"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="template-form" className="btn primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save template'}
          </button>
        </>
      }
    >
      <form id="template-form" className="form-grid" onSubmit={submit}>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Access port with voice VLAN" required />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <input className="input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
        </Field>
        <Field label="Description" className="span-2">
          <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Template body" className="span-2" required hint="Use {{variable}} for per-device values and {{device.name}}, {{device.host}}, ... for device facts">
          <textarea className="input mono" rows="12" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} required />
        </Field>
        <div className="span-2">
          <span className="field-label">Detected variables</span>
          <div className="row gap wrap">
            {variables.length ? (
              variables.map((name) => (
                <span key={name} className="badge badge-info">
                  {name}
                </span>
              ))
            ) : (
              <span className="muted small">None — the template only uses device facts.</span>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Templates() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pushing, setPushing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/templates');
      setItems(data.items);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    api
      .get('/devices/all')
      .then(({ data }) => setDevices(data.items))
      .catch(() => {});
  }, [load]);

  const confirmDelete = async () => {
    try {
      await api.delete(`/templates/${deleting._id}`);
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
          <h2>Configuration templates</h2>
          <p className="muted small">
            {items.length} template(s) · rendered per device and pushed through the same audited job pipeline
          </p>
        </div>
        {canOperate ? (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New template
          </button>
        ) : null}
      </div>

      <nav className="row gap" aria-label="Template tools">
        <NavLink to="/templates" end className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          Configuration templates
        </NavLink>
        {canOperate ? (
          <>
            <NavLink to="/templates/site-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
              Add VLAN to site
            </NavLink>
          <NavLink to="/templates/mac-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
            MAC VLAN assignment
          </NavLink>
          </>
        ) : null}
      </nav>

      <div className="card">
        {loading ? (
          <Spinner label="Loading templates..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No templates yet"
            message="Templates let you push parametrised configuration (VLANs, interfaces, WLANs, QoS...) to many devices safely."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Variables</th>
                <th>Tags</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((template) => (
                <tr key={template._id}>
                  <td>
                    {template.name}
                    {template.description ? <span className="muted small block">{template.description}</span> : null}
                  </td>
                  <td>
                    {(template.variables || []).length ? (
                      (template.variables || []).map((variable) => (
                        <span key={variable.name} className="badge badge-info">
                          {variable.name}
                        </span>
                      ))
                    ) : (
                      <span className="muted small">device facts only</span>
                    )}
                  </td>
                  <td className="muted small">{(template.tags || []).join(', ') || '—'}</td>
                  <td className="muted small">{template.lastUsedAt ? timeAgo(template.lastUsedAt) : 'never'}</td>
                  <td className="actions">
                    {canOperate ? (
                      <>
                        <button type="button" className="btn ghost sm" onClick={() => setPushing(template)}>
                          Push
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setEditing(template)}>
                          Edit
                        </button>
                      </>
                    ) : null}
                    {isAdmin ? (
                      <button type="button" className="btn danger sm" onClick={() => setDeleting(template)}>
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
        <TemplateForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <TemplateForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {pushing ? (
        <PushTemplateModal
          template={pushing}
          devices={devices}
          onClose={() => setPushing(null)}
          onPushed={() => {
            setPushing(null);
            load();
            navigate('/jobs');
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="The template will be removed. Configurations that were already pushed to devices are not affected."
          confirmLabel="Delete template"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
