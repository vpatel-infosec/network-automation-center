import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Spinner } from '../components/ui.jsx';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    api
      .get('/auth/setup-status')
      .then(({ data }) => setNeedsSetup(Boolean(data.needsSetup)))
      .catch(() => setNeedsSetup(false))
      .finally(() => setChecking(false));
  }, []);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (needsSetup) {
        await api.post('/auth/register', {
          name: form.name,
          email: form.email,
          password: form.password,
        });
      }
      await login(form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <Spinner full label="Preparing sign in..." />;

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark lg">NAC</span>
          <div>
            <h1>Network Automation Center</h1>
            <p className="muted small">
              Configuration backup, templates and automation for switches, access points and WLCs
            </p>
          </div>
        </div>

        {needsSetup ? (
          <div className="notice notice-info">
            No accounts exist yet. The account you create now becomes the platform administrator.
          </div>
        ) : null}

        {needsSetup ? (
          <Field label="Full name" required>
            <input className="input" value={form.name} onChange={update('name')} placeholder="Jane Doe" required />
          </Field>
        ) : null}

        <Field label="Email" required>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={update('email')}
            placeholder="admin@example.com"
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password" required hint={needsSetup ? 'At least 8 characters.' : undefined}>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </Field>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'Please wait...' : needsSetup ? 'Create administrator & sign in' : 'Sign in'}
        </button>

        <p className="muted small center">
          Device credentials are encrypted with AES-256-GCM before they are stored.
        </p>
      </form>
    </div>
  );
}
