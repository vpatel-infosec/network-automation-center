import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/devices', label: 'Devices', icon: '▤' },
  { to: '/topology', label: 'Topology', icon: '⌁' },
  { to: '/configs', label: 'Configurations', icon: '≣' },
  { to: '/templates', label: 'Templates', icon: '⌘' },
  { to: '/jobs', label: 'Automation jobs', icon: '▶' },
  { to: '/schedules', label: 'Schedules', icon: '⏱' },
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
          <span className={`badge ${user?.role === 'admin' ? 'badge-info' : 'badge-muted'}`}>{user?.role}</span>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
