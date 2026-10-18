import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Monitoring from './pages/Monitoring.jsx';
import Sites from './pages/Sites.jsx';
import Configurations from './pages/Configurations.jsx';
import Templates from './pages/Templates.jsx';
import MacVlan from './pages/MacVlan.jsx';
import SiteVlan from './pages/SiteVlan.jsx';
import Jobs from './pages/Jobs.jsx';
import Schedules from './pages/Schedules.jsx';
import Credentials from './pages/Credentials.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Topology from './pages/Topology.jsx';

function Protected({ children, adminOnly = false, operatorOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full label="Loading session..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  if (operatorOnly && user.role === 'viewer') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/topology" element={<Topology />} />
        <Route path="/backups" element={<Configurations />} />
        <Route path="/backups/schedules" element={<Schedules />} />
        <Route path="/configs" element={<Navigate to="/backups" replace />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/site-vlan" element={<Protected operatorOnly><SiteVlan /></Protected>} />
        <Route path="/templates/mac-vlan" element={<Protected operatorOnly><MacVlan /></Protected>} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/schedules" element={<Navigate to="/backups/schedules" replace />} />
        <Route path="/credentials" element={<Credentials />} />
        <Route
          path="/users"
          element={
            <Protected adminOnly>
              <Users />
            </Protected>
          }
        />
        <Route
          path="/audit"
          element={
            <Protected operatorOnly>
              <Audit />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
