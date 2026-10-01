import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../api/client.js';
import { EmptyState, Pagination, Spinner, formatDate, useToast } from '../components/ui.jsx';

const PAGE_SIZE = 50;

export default function Audit() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', action: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (filters.q) params.q = filters.q;
      if (filters.action) params.action = filters.action;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const { data } = await api.get('/audit', { params });
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    api
      .get('/audit/actions')
      .then(({ data }) => setActions(data.items))
      .catch(() => {});
  }, []);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Audit log</h2>
          <p className="muted small">{total} entr(ies) · who changed what, when and where</p>
        </div>
        <button type="button" className="btn ghost" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <input
            className="input"
            placeholder="Search action, user, entity id..."
            value={filters.q}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, q: event.target.value }));
            }}
          />
          <select
            className="input"
            value={filters.action}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, action: event.target.value }));
            }}
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={filters.from}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, from: event.target.value }));
            }}
          />
          <input
            className="input"
            type="date"
            value={filters.to}
            onChange={(event) => {
              setPage(1);
              setFilters((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </div>

        {loading ? (
          <Spinner label="Loading audit entries..." />
        ) : items.length === 0 ? (
          <EmptyState title="No audit entries" message="Actions performed in the platform will appear here." />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry._id}>
                    <td className="muted small">{formatDate(entry.createdAt)}</td>
                    <td>
                      {entry.userName}
                      {entry.user?.email ? <span className="muted small block">{entry.user.email}</span> : null}
                    </td>
                    <td>
                      <code className="inline">{entry.action}</code>
                    </td>
                    <td className="muted small">
                      {entry.entity || '—'}
                      {entry.entityId ? <span className="block">{String(entry.entityId).slice(-8)}</span> : null}
                    </td>
                    <td className="muted small wrap-any">
                      {entry.details ? JSON.stringify(entry.details).slice(0, 160) : '—'}
                    </td>
                    <td className="muted small">{entry.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
