import { useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { Field, Modal, titleCase, useToast } from '../components/ui.jsx';

const EMPTY_FORM = {
  name: '',
  host: '',
  port: '',
  vendor: 'cisco',
  deviceType: 'switch',
  protocol: 'ssh',
  driver: 'auto',
  credential: '',
  model: '',
  platform: '',
  location: '',
  tags: '',
};

export default function DeviceForm({ meta, credentials, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(initial || {}),
    credential: initial?.credential?._id || initial?.credential || '',
    tags: (initial?.tags || []).join(', '),
  }));
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        host: form.host.trim(),
        vendor: form.vendor,
        deviceType: form.deviceType,
        protocol: form.protocol,
        driver: form.driver,
        credential: form.credential,
        model: form.model,
        platform: form.platform,
        location: form.location,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (form.port) payload.port = Number(form.port);

      const response = initial?._id
        ? await api.patch(`/devices/${initial._id}`, payload)
        : await api.post('/devices', payload);
      toast.success(initial?._id ? 'Device updated' : 'Device added');
      onSaved(response.data.device);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial?._id ? `Edit ${initial.name}` : 'Add device'}
      subtitle="Switches, access points, WLCs, routers and firewalls"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="device-form" className="btn primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save device'}
          </button>
        </>
      }
    >
      <form id="device-form" className="form-grid" onSubmit={submit}>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={update('name')} placeholder="HQ-CORE-SW01" required />
        </Field>
        <Field label="Management IP / hostname" required>
          <input className="input" value={form.host} onChange={update('host')} placeholder="10.10.0.1" required />
        </Field>
        <Field label="Vendor" required>
          <select className="input" value={form.vendor} onChange={update('vendor')}>
            {meta.vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {titleCase(vendor)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Device type" required>
          <select className="input" value={form.deviceType} onChange={update('deviceType')}>
            {meta.deviceTypes.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Access protocol" hint="SSH for CLI automation · RESTCONF read-only">
          <select className="input" value={form.protocol} onChange={update('protocol')}>
            {meta.protocols.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocol.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Driver" hint="auto = best match for vendor and type">
          <select className="input" value={form.driver} onChange={update('driver')}>
            {meta.drivers.map((driver) => (
              <option key={driver} value={driver}>
                {driver}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Credential set" required>
          <select className="input" value={form.credential} onChange={update('credential')} required>
            <option value="">Select a credential...</option>
            {credentials.map((credential) => (
              <option key={credential._id} value={credential._id}>
                {credential.name} ({credential.username})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Port" hint="Default 22 (SSH) / 443 (RESTCONF)">
          <input className="input" type="number" min="1" max="65535" value={form.port} onChange={update('port')} placeholder="22" />
        </Field>
        <Field label="Model">
          <input className="input" value={form.model} onChange={update('model')} placeholder="Catalyst 9300-48P" />
        </Field>
        <Field label="Platform / OS">
          <input className="input" value={form.platform} onChange={update('platform')} placeholder="IOS-XE" />
        </Field>
        <Field label="Location">
          <input className="input" value={form.location} onChange={update('location')} placeholder="HQ / Floor 1 / Rack A2" />
        </Field>
        <Field label="Tags" hint="Comma separated: core, production, building-a">
          <input className="input" value={form.tags} onChange={update('tags')} />
        </Field>
      </form>
    </Modal>
  );
}
