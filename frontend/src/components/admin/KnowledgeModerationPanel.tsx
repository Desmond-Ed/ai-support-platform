import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  type KnowledgeDetail,
  type KnowledgeDocument,
  type KnowledgeIngestionStatus,
  type KnowledgeModerationStatus,
  type Pagination,
} from '../../services/api';

const MODERATION_LABELS: Record<KnowledgeModerationStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

const INGESTION_LABELS: Record<KnowledgeIngestionStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  READY: 'Ready',
  FAILED: 'Failed',
};

function statusClass(status: KnowledgeModerationStatus): string {
  if (status === 'APPROVED') return 'border-emerald-400/40 text-emerald-200';
  if (status === 'REJECTED') return 'border-rose-400/40 text-rose-200';
  if (status === 'ARCHIVED') return 'border-slate-500 text-slate-300';
  return 'border-amber-400/40 text-amber-200';
}

export function KnowledgeModerationPanel({ token }: { token: string }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [moderationStatus, setModerationStatus] = useState<KnowledgeModerationStatus | ''>('');
  const [ingestionStatus, setIngestionStatus] = useState<KnowledgeIngestionStatus | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<KnowledgeDetail | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.adminKnowledge(token, {
          moderationStatus: moderationStatus || undefined,
          status: ingestionStatus || undefined,
          search: search || undefined,
          page,
          pageSize: 20,
        });
        if (!active) return;
        setDocuments(response.documents);
        setPagination(response.pagination);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load documents');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token, moderationStatus, ingestionStatus, search, page, refreshKey]);

  async function selectDocument(documentId: string) {
    setError('');
    setNotice('');
    try {
      const response = await api.adminKnowledgeDetail(token, documentId);
      setSelected(response.document);
      setReason(response.document.moderationReason ?? '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load document');
    }
  }

  async function refreshSelected(documentId: string) {
    const [detailResponse] = await Promise.all([
      api.adminKnowledgeDetail(token, documentId),
      Promise.resolve(setRefreshKey((value) => value + 1)),
    ]);
    setSelected(detailResponse.document);
    setReason(detailResponse.document.moderationReason ?? '');
  }

  async function mutate(action: 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'RESTORE') {
    if (!selected) return;
    const trimmedReason = reason.trim();
    if (action === 'REJECT' && !trimmedReason) {
      setError('Enter a reason before rejecting this document.');
      return;
    }

    setError('');
    setNotice('');
    setBusyAction(action);
    try {
      await api.moderateKnowledge(token, selected.id, {
        action,
        expectedVersion: selected.moderationVersion,
        ...(action === 'REJECT' ? { reason: trimmedReason } : {}),
      });
      setNotice(`Document ${MODERATION_LABELS[action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : action === 'ARCHIVE' ? 'ARCHIVED' : 'PENDING_REVIEW'].toLowerCase()}.`);
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update moderation');
    } finally {
      setBusyAction('');
    }
  }

  async function retry() {
    if (!selected) return;
    setError('');
    setNotice('');
    setBusyAction('RETRY');
    try {
      const response = await api.retryKnowledgeIngestion(
        token,
        selected.id,
        selected.moderationVersion,
      );
      setNotice(`Retry queued as ${response.jobId}. Ingestion is pending.`);
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to retry ingestion');
    } finally {
      setBusyAction('');
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5" data-testid="knowledge-moderation">
      <div>
        <h2 className="text-lg font-semibold">Knowledge moderation</h2>
        <p className="mt-1 text-sm text-slate-400">
          Approval is separate from ingestion. Only READY and APPROVED documents are retrievable by the AI.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          aria-label="Moderation status filter"
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          onChange={(event) => {
            setPage(1);
            setModerationStatus(event.target.value as KnowledgeModerationStatus | '');
          }}
          value={moderationStatus}
        >
          <option value="">All moderation states</option>
          {Object.entries(MODERATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Ingestion status filter"
          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          onChange={(event) => {
            setPage(1);
            setIngestionStatus(event.target.value as KnowledgeIngestionStatus | '');
          }}
          value={ingestionStatus}
        >
          <option value="">All ingestion states</option>
          {Object.entries(INGESTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <form className="flex flex-1 gap-2" onSubmit={applySearch}>
          <input
            aria-label="Search knowledge"
            className="min-w-40 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title"
            value={searchInput}
          />
          <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" type="submit">
            Search
          </button>
        </form>
      </div>

      {error && <p className="mt-4 rounded border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p className="mt-4 rounded border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="overflow-x-auto">
          {loading && <p className="text-sm text-slate-500">Loading documents...</p>}
          {!loading && documents.length === 0 && <p className="text-sm text-slate-500">No documents match these filters.</p>}
          <div className="space-y-2">
            {documents.map((document) => (
              <button
                className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === document.id ? 'border-cyan-400/60 bg-cyan-400/5' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'}`}
                data-testid="knowledge-row"
                data-document-id={document.id}
                data-moderation-status={document.moderationStatus}
                data-ingestion-status={document.status}
                key={document.id}
                onClick={() => selectDocument(document.id)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{document.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {document.sourceType} · attempt {document.ingestionAttempt} · v{document.moderationVersion}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(document.moderationStatus)}`}>
                      {MODERATION_LABELS[document.moderationStatus]}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {INGESTION_LABELS[document.status]}
                    </span>
                  </div>
                </div>
                {document.errorMessage && <p className="mt-2 text-xs text-rose-300">{document.errorMessage}</p>}
              </button>
            ))}
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
              <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} documents</span>
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
        </div>

        <aside className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          {!selected && <p className="text-sm text-slate-500">Select a document to review its content and moderation controls.</p>}
          {selected && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{selected.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Uploaded by {selected.uploadedBy.name} · {selected.uploadedBy.email}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(selected.moderationStatus)}`}>
                  {MODERATION_LABELS[selected.moderationStatus]}
                </span>
              </div>

              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">{selected.content}</pre>

              {selected.moderationReason && (
                <p className="mt-3 rounded border border-rose-400/30 bg-rose-400/5 p-2 text-xs text-rose-200">
                  Moderation reason: {selected.moderationReason}
                </p>
              )}

              <label className="mt-3 block text-xs uppercase tracking-wide text-slate-500" htmlFor="moderation-reason">
                Moderation reason
              </label>
              <textarea
                className="mt-1 min-h-16 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                id="moderation-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required when rejecting"
                value={reason}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {selected.moderationStatus === 'PENDING_REVIEW' && (
                  <button
                    className="rounded bg-emerald-300 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
                    data-testid="knowledge-approve"
                    disabled={selected.status !== 'READY' || busyAction !== ''}
                    onClick={() => mutate('APPROVE')}
                    type="button"
                  >
                    Approve
                  </button>
                )}
                {(selected.moderationStatus === 'PENDING_REVIEW' || selected.moderationStatus === 'APPROVED') && (
                  <button
                    className="rounded bg-rose-300 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
                    data-testid="knowledge-reject"
                    disabled={busyAction !== ''}
                    onClick={() => mutate('REJECT')}
                    type="button"
                  >
                    Reject
                  </button>
                )}
                {selected.moderationStatus !== 'ARCHIVED' && (
                  <button
                    className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
                    data-testid="knowledge-archive"
                    disabled={busyAction !== ''}
                    onClick={() => mutate('ARCHIVE')}
                    type="button"
                  >
                    Archive
                  </button>
                )}
                {(selected.moderationStatus === 'REJECTED' || selected.moderationStatus === 'ARCHIVED') && (
                  <button
                    className="rounded border border-cyan-400/60 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-40"
                    data-testid="knowledge-restore"
                    disabled={busyAction !== ''}
                    onClick={() => mutate('RESTORE')}
                    type="button"
                  >
                    Restore to review
                  </button>
                )}
                {selected.status === 'FAILED' && (
                  <button
                    className="rounded bg-amber-300 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
                    data-testid="knowledge-retry"
                    disabled={busyAction !== ''}
                    onClick={retry}
                    type="button"
                  >
                    Retry ingestion
                  </button>
                )}
              </div>
              {selected.moderationStatus === 'PENDING_REVIEW' && selected.status !== 'READY' && (
                <p className="mt-2 text-xs text-slate-500">
                  Ingestion must finish successfully before this document can be approved.
                </p>
              )}
              {selected.moderatedBy && (
                <p className="mt-2 text-xs text-slate-500">
                  Last moderated by {selected.moderatedBy.name} at {new Date(selected.moderatedAt ?? '').toLocaleString()}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
