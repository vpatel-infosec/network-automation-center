import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ReportActions from './ReportActions.jsx';

const TopologyNavIcon = () => (
  <svg viewBox="0 0 18 18" className="topology-nav-icon" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9V3M9 9l-4 3m4-3 4 3M9 9l-3 5m3-5 3 5M3 5h12M3 13h12" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </g>
  </svg>
);

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/devices', label: 'Devices', icon: '▤' },
  { to: '/sites', label: 'Sites', icon: '⌂' },
  { to: '/monitoring', label: 'Monitoring', icon: '◉' },
  { to: '/topology', label: 'Topology', icon: <TopologyNavIcon /> },
  { to: '/backups', label: 'Backups', icon: '≣' },
  { to: '/templates', label: 'Templates', icon: '⌘' },
  { to: '/jobs', label: 'Automation jobs', icon: '▶' },
  { to: '/credentials', label: 'Credentials', icon: '⚿' },
  { to: '/users', label: 'Users', icon: '☗', adminOnly: true },
  { to: '/audit', label: 'Audit log', icon: '▣', operatorOnly: true },
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.operatorOnly || user?.role !== 'viewer')
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">NAC</span>
          <div className="brand-text">
            <strong>Network Automation</strong>
            <span className="muted small">config · backup · push</span>
          </div>
        </div>

        <nav className="nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <strong>{user?.name}</strong>
            <span className="muted small">{user?.email}</span>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setOpen((value) => !value)}>
            ☰
          </button>
          <ReportActions />
          <span className={`badge ${user?.role === 'admin' ? 'badge-info' : 'badge-muted'}`}>{user?.role}</span>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
