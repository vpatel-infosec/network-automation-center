import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Spinner,
  StatusBadge,
  formatDate,
  titleCase,
  useToast,
} from '../components/ui.jsx';

const EMPTY = { name: '', email: '', password: '', role: 'viewer', active: true };

function UserForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}), password: '' }));
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: form.active,
      };
      if (form.password) payload.password = form.password;

      const response = initial?._id
        ? await api.patch(`/users/${initial._id}`, payload)
        : await api.post('/users', { ...payload, password: form.password });
      toast.success(initial?._id ? 'User updated' : 'User created');
      onSaved(response.data.user);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'New user'}
      subtitle="admin: everything · operator: devices, jobs, templates · viewer: read only"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save user'}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit}>
        <Field label="Full name" required>
          <input className="input" value={form.name} onChange={update('name')} required />
        </Field>
        <Field label="Email" required>
          <input className="input" type="email" value={form.email} onChange={update('email')} required />
        </Field>
        <Field
          label="Password"
          required={!initial?._id}
          hint={initial?._id ? 'Leave blank to keep the current password' : 'At least 8 characters'}
        >
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role" required>
          <select className="input" value={form.role} onChange={update('role')}>
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
        </Field>
        <Field label="Active">
          <input type="checkbox" checked={form.active} onChange={update('active')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
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
  }, [load]);

  const confirmDelete = async () => {
    try {
      await api.delete(`/users/${deleting._id}`);
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
          <h2>Users &amp; roles</h2>
          <p className="muted small">{items.length} account(s) · every action is attributed in the audit log</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          + New user
        </button>
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading users..." />
        ) : items.length === 0 ? (
          <EmptyState title="No users" message="Create an account to give a colleague access." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>State</th>
                <th>Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((account) => (
                <tr key={account._id}>
                  <td>
                    {account.name}
                    {String(account._id) === String(user?._id) ? (
                      <span className="badge badge-info">you</span>
                    ) : null}
                  </td>
                  <td className="muted small">{account.email}</td>
                  <td>
                    <StatusBadge status={account.role === 'admin' ? 'info' : 'muted'} label={titleCase(account.role)} />
                  </td>
                  <td>
                    <StatusBadge
                      status={account.active ? 'active' : 'disabled'}
                      label={account.active ? 'active' : 'disabled'}
                    />
                  </td>
                  <td className="muted small">{account.lastLoginAt ? formatDate(account.lastLoginAt) : 'never'}</td>
                  <td className="actions">
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(account)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn danger sm"
                      disabled={String(account._id) === String(user?._id)}
                      onClick={() => setDeleting(account)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating ? (
        <UserForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <UserForm
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
          message="The account loses access immediately. Audit history stays intact."
          confirmLabel="Delete user"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
