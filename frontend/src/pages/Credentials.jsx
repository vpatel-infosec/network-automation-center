import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Spinner,
  formatDate,
  useToast,
} from '../components/ui.jsx';

const EMPTY = {
  name: '',
  description: '',
  username: '',
  password: '',
  enablePassword: '',
  sshPrivateKey: '',
  sshPassphrase: '',
};

function CredentialForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        username: form.username.trim(),
        password: form.password,
        enablePassword: form.enablePassword,
        sshPrivateKey: form.sshPrivateKey,
        sshPassphrase: form.sshPassphrase,
      };
      const response = initial?._id
        ? await api.patch(`/credentials/${initial._id}`, payload)
        : await api.post('/credentials', payload);
      toast.success(initial?._id ? 'Credential updated' : 'Credential created');
      onSaved(response.data.credential);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'New credential set'}
      subtitle="Secrets are encrypted with AES-256-GCM; leave a secret blank to keep the current value"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="credential-form" className="btn primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save credential'}
          </button>
        </>
      }
    >
      <form id="credential-form" className="form-grid" onSubmit={submit}>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={update('name')} placeholder="Core switches - TACACS" required />
        </Field>
        <Field label="Username" required>
          <input className="input" value={form.username} onChange={update('username')} placeholder="netops" required />
        </Field>
        <Field label="Password" hint={initial?._id ? 'Leave blank to keep the stored password' : undefined}>
          <input className="input" type="password" value={form.password} onChange={update('password')} autoComplete="new-password" />
        </Field>
        <Field label="Enable password" hint="Required for CLIs that ask for privileged mode">
          <input
            className="input"
            type="password"
            value={form.enablePassword}
            onChange={update('enablePassword')}
            autoComplete="new-password"
          />
        </Field>
        <Field label="SSH private key (PEM)" className="span-2" hint="Optional — used instead of a password when present">
          <textarea className="input mono" rows="4" value={form.sshPrivateKey} onChange={update('sshPrivateKey')} />
        </Field>
        <Field label="Key passphrase">
          <input
            className="input"
            type="password"
            value={form.sshPassphrase}
            onChange={update('sshPassphrase')}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Description">
          <input className="input" value={form.description} onChange={update('description')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Credentials() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/credentials');
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
      await api.delete(`/credentials/${deleting._id}`);
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
          <h2>Credentials</h2>
          <p className="muted small">
            {items.length} credential set(s) · secrets are encrypted at rest and never returned by the API
          </p>
        </div>
        {canOperate ? (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New credential set
          </button>
        ) : null}
      </div>

      <div className="card">
        {loading ? (
          <Spinner label="Loading credentials..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No credential sets"
            message="Create a credential set (username, password, optional enable password or SSH key) before adding devices."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Secrets</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((credential) => (
                <tr key={credential._id}>
                  <td>
                    {credential.name}
                    {credential.description ? (
                      <span className="muted small block">{credential.description}</span>
                    ) : null}
                  </td>
                  <td className="muted small">{credential.username}</td>
                  <td>
                    {credential.hasPassword ? <span className="badge badge-ok">password</span> : null}
                    {credential.hasEnablePassword ? <span className="badge badge-ok">enable</span> : null}
                    {credential.hasSshKey ? <span className="badge badge-info">ssh key</span> : null}
                    {!credential.hasPassword && !credential.hasEnablePassword && !credential.hasSshKey ? (
                      <span className="badge badge-muted">none</span>
                    ) : null}
                  </td>
                  <td className="muted small">{formatDate(credential.createdAt)}</td>
                  <td className="actions">
                    {canOperate ? (
                      <button type="button" className="btn ghost sm" onClick={() => setEditing(credential)}>
                        Edit
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button type="button" className="btn danger sm" onClick={() => setDeleting(credential)}>
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
        <CredentialForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <CredentialForm
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
          message="Credentials that are still assigned to devices cannot be deleted."
          confirmLabel="Delete credential"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
