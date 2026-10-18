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
  timeAgo,
  titleCase,
  useToast,
} from '../components/ui.jsx';
import DevicePicker from '../components/DevicePicker.jsx';
import BackupModuleTabs from '../components/BackupModuleTabs.jsx';

const CRON_PRESETS = [
  { label: 'Every night at 02:00', value: '0 2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every Sunday at 03:00', value: '0 3 * * 0' },
  { label: 'Weekdays at 22:00', value: '0 22 * * 1-5' },
];

function ScheduleForm({ devices, templates, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    description: initial?.description || '',
    type: initial?.type || 'backup',
    cron: initial?.cron || '0 2 * * *',
    enabled: initial?.enabled !== false,
    template: initial?.template?._id || initial?.template || '',
    variablesText: JSON.stringify(initial?.variables || {}, null, 2),
    backupAfter: initial?.options?.backupAfter !== false,
  }));
  const [selected, setSelected] = useState(() =>
    (initial?.devices || []).map((device) => (typeof device === 'string' ? device : device._id))
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id) =>
    setSelected((list) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      let variables = {};
      if (form.variablesText.trim()) {
        try {
          variables = JSON.parse(form.variablesText);
        } catch {
          throw new Error('Variables must be valid JSON, e.g. { "vlan_id": "20" }');
        }
      }
      const payload = {
        name: form.name.trim(),
        description: form.description,
        type: form.type,
        cron: form.cron.trim(),
        enabled: form.enabled,
        devices: selected,
        variables,
        options: { backupAfter: form.backupAfter },
      };
      if (form.type === 'push_template') payload.template = form.template;

      const response = initial?._id
        ? await api.patch(`/schedules/${initial._id}`, payload)
        : await api.post('/schedules', payload);
      toast.success(initial?._id ? 'Schedule updated' : 'Schedule created');
      onSaved(response.data.schedule);
    } catch (error) {
      toast.error(error.message?.startsWith('Variables') ? error.message : apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'New schedule'}
      subtitle="Cron based automation — nightly backups or recurring template pushes"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="schedule-form" className="btn primary" disabled={busy || !selected.length}>
            {busy ? 'Saving...' : 'Save schedule'}
          </button>
        </>
      }
    >
      <form id="schedule-form" className="form-grid" onSubmit={submit}>
        <Field label="Name" required>
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nightly core backup"
            required
          />
        </Field>
        <Field label="Type" required>
          <select
            className="input"
            value={form.type}
            onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="backup">Configuration backup</option>
            <option value="push_template">Template push</option>
          </select>
        </Field>
        <Field label="Cron expression" required hint="Standard 5-field cron: minute hour day month weekday">
          <input
            className="input mono"
            value={form.cron}
            onChange={(event) => setForm((current) => ({ ...current, cron: event.target.value }))}
            required
          />
        </Field>
        <Field label="Presets">
          <select
            className="input"
            value=""
            onChange={(event) => {
              if (event.target.value) setForm((current) => ({ ...current, cron: event.target.value }));
            }}
          >
            <option value="">Choose a preset...</option>
            {CRON_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
          </select>
        </Field>
        {form.type === 'push_template' ? (
          <>
            <Field label="Template" required>
              <select
                className="input"
                value={form.template}
                onChange={(event) => setForm((current) => ({ ...current, template: event.target.value }))}
                required
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Variables (JSON)" hint='e.g. { "vlan_id": "20" }'>
              <textarea
                className="input mono"
                rows="4"
                value={form.variablesText}
                onChange={(event) => setForm((current) => ({ ...current, variablesText: event.target.value }))}
              />
            </Field>
          </>
        ) : null}
        <Field label="Enabled">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
        </Field>
        <Field label="Backup after a successful push">
          <input
            type="checkbox"
            checked={form.backupAfter}
            onChange={(event) => setForm((current) => ({ ...current, backupAfter: event.target.checked }))}
          />
        </Field>
        <div className="span-2">
          <span className="field-label">Devices ({selected.length} selected)</span>
          <DevicePicker devices={devices} selected={selected} onToggle={toggle} height={220} />
        </div>
      </form>
    </Modal>
  );
}

export default function Schedules() {
  const { canOperate, isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/schedules');
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
    api.get('/devices/all').then(({ data }) => setDevices(data.items)).catch(() => {});
    api.get('/templates').then(({ data }) => setTemplates(data.items)).catch(() => {});
  }, [load]);

  const toggleEnabled = async (schedule) => {
    try {
      await api.patch(`/schedules/${schedule._id}`, { enabled: !schedule.enabled });
      toast.success(`${schedule.name} ${schedule.enabled ? 'paused' : 'enabled'}`);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/schedules/${deleting._id}`);
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
          <h2>Backup schedules</h2>
          <p className="muted small">{items.length} schedule(s) · cron driven backups and template pushes</p>
        </div>
        {canOperate ? (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New schedule
          </button>
        ) : null}
      </div>

      <BackupModuleTabs active="schedules" />

      <div className="card">
        {loading ? (
          <Spinner label="Loading schedules..." />
        ) : items.length === 0 ? (
          <EmptyState
            title="No schedules"
            message="Schedule a nightly configuration backup so there is always an up-to-date restore point."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Schedule</th>
                <th>Type</th>
                <th>Cron</th>
                <th>Devices</th>
                <th>State</th>
                <th>Last run</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((schedule) => (
                <tr key={schedule._id}>
                  <td>
                    {schedule.name}
                    {schedule.description ? <span className="muted small block">{schedule.description}</span> : null}
                  </td>
                  <td className="muted small">
                    {titleCase(schedule.type)}
                    {schedule.template?.name ? <span className="block">{schedule.template.name}</span> : null}
                  </td>
                  <td>
                    <code className="inline">{schedule.cron}</code>
                  </td>
                  <td className="muted small">{(schedule.devices || []).length}</td>
                  <td>
                    <StatusBadge
                      status={schedule.enabled ? 'active' : 'disabled'}
                      label={schedule.enabled ? 'active' : 'paused'}
                    />
                    {String(schedule.lastStatus || '').startsWith('error') ? (
                      <span className="badge badge-bad">last run error</span>
                    ) : null}
                  </td>
                  <td className="muted small">{schedule.lastRunAt ? timeAgo(schedule.lastRunAt) : 'never'}</td>
                  <td className="actions">
                    {canOperate ? (
                      <>
                        <button type="button" className="btn ghost sm" onClick={() => toggleEnabled(schedule)}>
                          {schedule.enabled ? 'Pause' : 'Enable'}
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setEditing(schedule)}>
                          Edit
                        </button>
                      </>
                    ) : null}
                    {isAdmin ? (
                      <button type="button" className="btn danger sm" onClick={() => setDeleting(schedule)}>
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
        <ScheduleForm
          devices={devices}
          templates={templates}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {editing ? (
        <ScheduleForm
          devices={devices}
          templates={templates}
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
          message="The schedule will stop running. Jobs that already ran stay in the history."
          confirmLabel="Delete schedule"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
