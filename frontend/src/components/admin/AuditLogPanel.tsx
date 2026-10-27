import { useEffect, useState, type FormEvent } from 'react';
import { api, type AuditLog, type Pagination } from '../../services/api';

const AUDIT_ACTIONS = [
  'USER_UPDATED',
  'TICKET_ASSIGNED',
  'TICKET_STATUS_CHANGED',
  'KNOWLEDGE_SUBMITTED',
  'KNOWLEDGE_INGESTION_ENQUEUE_FAILED',
  'KNOWLEDGE_APPROVED',
  'KNOWLEDGE_REJECTED',
  'KNOWLEDGE_ARCHIVED',
  'KNOWLEDGE_RESTORED',
  'KNOWLEDGE_INGESTION_RETRY_REQUESTED',
  'KNOWLEDGE_INGESTION_RETRY_ENQUEUE_FAILED',
] as const;

export function AuditLogPanel({ token }: { token: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityTypeInput, setEntityTypeInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.auditLogs(token, {
          action: action || undefined,
          entityType: entityType || undefined,
          from: dateRange.from,
          to: dateRange.to,
          page,
          pageSize: 20,
        });
        if (!active) return;
        setLogs(response.logs);
        setPagination(response.pagination);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load audit events');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token, action, entityType, dateRange, page, refreshKey]);

  function applyEntityFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setEntityType(entityTypeInput.trim());
  }

  function clearDates() {
    setPage(1);
    setFromInput('');
    setToInput('');
    setDateRange({});
  }

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromInput || !toInput) return;
    setPage(1);
    setDateRange({ from: fromInput, to: toInput });
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5" data-testid="audit-log-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Audit log</h2>
          <p className="mt-1 text-sm text-slate-400">
            Read-only operational history. Metadata is restricted to safe fields and never includes document content.
          </p>
        </div>
        <button className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300" onClick={() => setRefreshKey((value) => value + 1)} type="button">
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          Action
          <select
            aria-label="Audit action filter"
            className="mt-1 block rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
            value={action}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <form className="flex items-end gap-2" onSubmit={applyEntityFilter}>
          <label className="text-xs text-slate-500">
            Entity type
            <input
              aria-label="Audit entity type filter"
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              onChange={(event) => setEntityTypeInput(event.target.value)}
              placeholder="Ticket"
              value={entityTypeInput}
            />
          </label>
          <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" type="submit">Filter</button>
        </form>
        <form className="flex items-end gap-2" onSubmit={applyDates}>
          <label className="text-xs text-slate-500">
            From
            <input
              aria-label="Audit from"
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200"
              onChange={(event) => setFromInput(event.target.value)}
              required
              type="date"
              value={fromInput}
            />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input
              aria-label="Audit to"
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-200"
              onChange={(event) => setToInput(event.target.value)}
              required
              type="date"
              value={toInput}
            />
          </label>
          <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" type="submit">
            Apply dates
          </button>
        </form>
        <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={clearDates} type="button">
          Clear dates
        </button>
      </div>

      {error && <p className="mt-4 rounded border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading audit events...</p>}
      {!loading && logs.length === 0 && <p className="mt-4 text-sm text-slate-500">No audit events match these filters.</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2">Time</th>
              <th className="pb-2">Action</th>
              <th className="pb-2">Actor</th>
              <th className="pb-2">Entity</th>
              <th className="pb-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr className="border-t border-slate-800 align-top" data-testid="audit-log-row" data-action={log.action} key={log.id}>
                <td className="py-2 font-mono text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="py-2 text-xs font-medium text-cyan-200">{log.action}</td>
                <td className="py-2 text-xs text-slate-300">
                  {log.actor ? <>{log.actor.name}<br /><span className="text-slate-500">{log.actor.email}</span></> : 'System'}
                </td>
                <td className="py-2 text-xs text-slate-400">
                  {log.entityType}<br /><span className="font-mono text-slate-500">{log.entityId}</span>
                </td>
                <td className="py-2">
                  <pre className="max-w-xs overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{log.metadata ? JSON.stringify(log.metadata, null, 2) : '—'}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
          <button
            className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Previous
          </button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} events</span>
          <button
            className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
