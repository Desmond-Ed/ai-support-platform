import { useEffect, useState, type FormEvent } from 'react';
import { api, type AnalyticsTimeseries } from '../../services/api';

const RANGE_OPTIONS = [7, 30, 90] as const;

function utcDay(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function rangeFor(days: number): { from: string; to: string } {
  return { from: utcDay(-(days - 1)), to: utcDay(0) };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'No resolutions';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function AnalyticsPanel({ token }: { token: string }) {
  const [days, setDays] = useState<number | null>(30);
  const [fromInput, setFromInput] = useState(() => rangeFor(30).from);
  const [toInput, setToInput] = useState(() => rangeFor(30).to);
  const [range, setRange] = useState(() => rangeFor(30));
  const [data, setData] = useState<AnalyticsTimeseries | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.analyticsTimeseries(token, range);
        if (active) setData(response);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load analytics');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token, range]);

  function chooseRange(nextDays: number) {
    const next = rangeFor(nextDays);
    setDays(nextDays);
    setFromInput(next.from);
    setToInput(next.to);
    setRange(next);
  }

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromInput || !toInput) return;
    setDays(null);
    setRange({ from: fromInput, to: toInput });
  }

  const maxDaily = Math.max(
    1,
    ...(data?.series.flatMap((day) => [day.conversationsCreated, day.ticketsCreated, day.ticketsResolved]) ?? []),
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5" data-testid="analytics-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Operational analytics</h2>
          <p className="mt-1 text-sm text-slate-400">
            Daily activity in UTC calendar days. Ranges are inclusive and limited to 90 days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              className={`rounded border px-3 py-1 text-sm ${days === option ? 'border-cyan-300 text-cyan-200' : 'border-slate-700 text-slate-300'}`}
              onClick={() => chooseRange(option)}
              type="button"
            >
              {option}d
            </button>
          ))}
          <form className="flex flex-wrap items-center gap-2" onSubmit={applyRange}>
            <input
              aria-label="Analytics from"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
              onChange={(event) => setFromInput(event.target.value)}
              required
              type="date"
              value={fromInput}
            />
            <span className="text-slate-500">to</span>
            <input
              aria-label="Analytics to"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
              onChange={(event) => setToInput(event.target.value)}
              required
              type="date"
              value={toInput}
            />
            <button className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-200" type="submit">
              Apply
            </button>
          </form>
        </div>
      </div>

      {error && <p className="mt-4 rounded border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading analytics...</p>}

      {data && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Conversations" value={data.summary.conversationsCreated} />
            <Metric label="Tickets created" value={data.summary.ticketsCreated} />
            <Metric label="Tickets resolved" value={data.summary.ticketsResolved} />
            <Metric label="Avg resolution" value={formatDuration(data.summary.averageResolutionSeconds)} />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Day</th>
                  <th className="pb-2">Conversations</th>
                  <th className="pb-2">Tickets created</th>
                  <th className="pb-2">Tickets resolved</th>
                  <th className="pb-2">Avg resolution</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((day) => (
                  <tr className="border-t border-slate-800" data-testid="analytics-day" data-date={day.date} key={day.date}>
                    <td className="py-2 font-mono text-xs text-slate-400">{day.date}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-right">{day.conversationsCreated}</span>
                        <div className="h-1.5 w-24 rounded bg-slate-800">
                          <div className="h-1.5 rounded bg-cyan-300" style={{ width: `${(day.conversationsCreated / maxDaily) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-right">{day.ticketsCreated}</span>
                        <div className="h-1.5 w-24 rounded bg-slate-800">
                          <div className="h-1.5 rounded bg-amber-300" style={{ width: `${(day.ticketsCreated / maxDaily) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 text-right">{day.ticketsResolved}</span>
                        <div className="h-1.5 w-24 rounded bg-slate-800">
                          <div className="h-1.5 rounded bg-emerald-300" style={{ width: `${(day.ticketsResolved / maxDaily) * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-slate-400">{formatDuration(day.averageResolutionSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-cyan-200">{value}</p>
    </div>
  );
}
