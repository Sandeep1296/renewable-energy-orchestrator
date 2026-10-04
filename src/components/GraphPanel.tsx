import React, { useEffect, useState } from 'react';
import { Network, Database, RefreshCw } from 'lucide-react';
import { PortfolioState } from '../types/orchestrator';
import { authHeaders, useIsAdmin } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface Props {
  portfolio: PortfolioState;
}

/** Neo4j Aura mirror: run directly, seed the live topology, verify counts. */
export const GraphPanel: React.FC<Props> = ({ portfolio }) => {
  const admin = useIsAdmin();
  const toast = useToast();
  const [status, setStatus] = useState<any | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadStatus = async () => {
    try {
      const r = await fetch('/api/graph/status');
      setStatus(await r.json());
    } catch {
      setStatus({ reachable: false, error: 'backend unreachable' });
    }
  };
  useEffect(() => { loadStatus(); }, []);

  const portfolioHash = (() => {
    const s = JSON.stringify({
      sol: (portfolio.solarFarms || []).map((a) => [a.id, a.capacityMw, a.status]),
      wnd: (portfolio.windFarms || []).map((a) => [a.id, a.capacityMw, a.status]),
      bat: (portfolio.batteries || []).map((b) => [b.id, b.capacityMwh, b.powerRatingMw, b.status]),
      con: (portfolio.consumers || []).map((c) => [c.id, c.status]),
      ln: (portfolio.interties || []).map((i) => [i.id, i.limitMw]),
    });
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  })();
  const stale = Boolean(status?.lastSeededHash) && status.lastSeededHash !== portfolioHash;

  const seed = async () => {
    setSeeding(true);
    try {
      const h = await authHeaders();
      const r = await fetch('/api/graph/seed', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ portfolio }) });
      const j = await r.json();
      if (r.ok && j.ok) {
        toast(`Topology seeded: ${j.counts.nodes} nodes, ${j.counts.rels} relationships.`, 'success');
        await loadStatus();
      } else {
        toast(`Seed failed: ${j.error || r.status}.`, 'error');
      }
    } catch {
      toast('Seed failed — backend unreachable.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const prune = async () => {
    if (!confirm('Delete mirror nodes missing from the live portfolio (e.g. deleted/renamed assets)? Live data is untouched — mirror only. This is audit-logged.')) return;
    try {
      const h = await authHeaders();
      const r = await fetch('/api/graph/prune', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ portfolio }) });
      const j = await r.json();
      if (r.ok) {
        toast(j.removed?.length ? `Pruned orphans: ${j.removed.join(', ')}.` : 'Mirror already matches the portfolio — nothing pruned.', 'success');
        await loadStatus();
      } else {
        toast(`Prune failed: ${j.error || r.status}.`, 'error');
      }
    } catch {
      toast('Prune failed — backend unreachable.', 'error');
    }
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-pu" />
          <div>
            <h3 className="text-sm font-semibold text-paper tracking-tight">Graph Database (Neo4j Aura mirror)</h3>
            <p className="text-xs text-muted mt-0.5">
              Collector-bus topology: assets FEED_INTO bus, bus CONNECTS_VIA interties, loads DRAW_FROM bus. Blast-radius analysis runs in-memory; Aura persists the mirror.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadStatus} title="Re-check Aura reachability" className="p-1.5 rounded bg-raise border border-linestrong text-muted hover:text-paper">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {admin && (
            <button onClick={seed} disabled={seeding} className="px-3 py-1.5 text-xs font-semibold text-onaccent bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>{seeding ? 'Seeding…' : 'Seed live topology'}</span>
            </button>
          )}
          {admin && (
            <button onClick={prune} title="Delete mirror nodes missing from the live portfolio" className="px-3 py-1.5 text-xs font-medium text-muted hover:text-paper bg-raise border border-linestrong rounded-lg">
              Prune orphans
            </button>
          )}
        </div>
      </div>
      <div className="font-mono text-[11px] p-3 rounded-lg bg-page border border-line space-y-1">
        {!status && <span className="text-faint">Checking Aura…</span>}
        {status && !status.reachable && <span className="text-am">Aura unreachable: {status.error} — impact analysis still runs in-memory.</span>}
        {status?.reachable && (
          <span className="text-em">
            Aura reachable · {status.counts.nodes} nodes ({Object.entries(status.counts.byLabel || {}).map(([k, v]) => `${k}:${v}`).join(', ')}) · {status.counts.rels} relationships
          </span>
        )}
        {status && (
          <span className="block text-faint">
            Mirror: {status.mirror || 'auto'}{status.lastSync ? ` · last sync ${status.lastSync.at.slice(11, 19)} — ${status.lastSync.result}` : ' · no sync yet this session'}
          </span>
        )}
        {stale && (
          <span className="block text-am font-bold">
            ● Updates pending for seeding — topology changed since last seed. Press “Seed live topology”.
          </span>
        )}
      </div>
      {!admin && <p className="text-[11px] text-faint">Seeding requires the Admin org role.</p>}
    </div>
  );
};
