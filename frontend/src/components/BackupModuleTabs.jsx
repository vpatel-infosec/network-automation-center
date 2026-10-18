import { NavLink } from 'react-router-dom';

export default function BackupModuleTabs({ active }) {
  return (
    <nav className="row gap wrap" aria-label="Backups module">
      <NavLink to="/backups" end className={({ isActive }) => `btn sm ${active === 'backups' && isActive ? 'primary' : 'ghost'}`}>
        Backup history
      </NavLink>
      <NavLink to="/backups/schedules" className={({ isActive }) => `btn sm ${active === 'schedules' && isActive ? 'primary' : 'ghost'}`}>
        Schedules
      </NavLink>
    </nav>
  );
}