import { useMemo, useState } from 'react';

export default function DevicePicker({ devices, selected, onToggle, height = 260 }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((device) =>
      `${device.name} ${device.host} ${device.vendor} ${device.deviceType}`.toLowerCase().includes(q)
    );
  }, [devices, query]);

  return (
    <div className="device-picker">
      <input
        className="input"
        placeholder="Filter devices by name, IP, vendor..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="picker-list" style={{ maxHeight: height }}>
        {filtered.map((device) => (
          <label key={device._id} className={`picker-item ${selected.includes(device._id) ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={selected.includes(device._id)}
              onChange={() => onToggle(device._id)}
            />
            <span className="picker-name">{device.name}</span>
            <span className="muted small">
              {device.host} · {device.vendor} {device.deviceType}
            </span>
          </label>
        ))}
        {!filtered.length ? <p className="muted small pad">No devices match.</p> : null}
      </div>
    </div>
  );
}
