import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './ui.jsx';
import { exportModuleReport } from '../utils/reportExporter.js';

export default function ReportActions() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);

  if (pathname.startsWith('/users') && user?.role !== 'admin') return null;
  if (['/audit', '/credentials', '/schedules', '/sites'].includes(pathname) && user?.role === 'viewer') return null;

  const runReport = async () => {
    setBusy(true);
    try {
      await exportModuleReport(pathname, format);
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row gap">
      <select className="input" aria-label="Report format" value={format} onChange={(event) => setFormat(event.target.value)} disabled={busy}>
        <option value="pdf">PDF report</option>
        <option value="xlsx">Excel workbook</option>
        <option value="csv">CSV data</option>
      </select>
      <button type="button" className="btn ghost sm" onClick={runReport} disabled={busy}>
        {busy ? 'Generating...' : 'Export report'}
      </button>
    </div>
  );
}