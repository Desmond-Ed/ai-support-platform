import { useState } from 'react';
import { AnalyticsPanel } from './AnalyticsPanel';
import { AuditLogPanel } from './AuditLogPanel';
import { KnowledgeModerationPanel } from './KnowledgeModerationPanel';

type Tab = 'analytics' | 'knowledge' | 'audit';

export function OperationsDashboard({ token, role }: { token: string; role: string }) {
  const [tab, setTab] = useState<Tab>('analytics');
  const isAdmin = role === 'ADMIN';
  const tabs: Array<{ id: Tab; label: string; adminOnly?: boolean }> = [
    { id: 'analytics', label: 'Analytics' },
    { id: 'knowledge', label: 'Knowledge moderation', adminOnly: true },
    { id: 'audit', label: 'Audit log', adminOnly: true },
  ];

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {tabs.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === item.id ? 'bg-cyan-300 text-slate-950' : 'border border-slate-700 text-slate-300 hover:border-cyan-400'}`}
            data-testid={`operations-tab-${item.id}`}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' && <AnalyticsPanel token={token} />}
      {tab === 'knowledge' && isAdmin && <KnowledgeModerationPanel token={token} />}
      {tab === 'audit' && isAdmin && <AuditLogPanel token={token} />}
    </section>
  );
}
