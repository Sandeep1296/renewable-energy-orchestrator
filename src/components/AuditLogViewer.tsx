import React, { useMemo, useState } from 'react';
import { FileText, Download, Trash2, ChevronRight, ChevronLeft, X, Bot } from 'lucide-react';
import { OrchestrationDecision } from '../types/orchestrator';
import { provenanceOf, PROVENANCE_STYLE, ProvenanceKind } from '../services/provenance';
import { useToast } from './Toaster';

interface AuditLogViewerProps {
  history: OrchestrationDecision[];
  onClear?: () => void;
}

const PAGE_SIZE = 10;
const FILTERS: Array<{ id: ProvenanceKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ai-autonomous', label: 'AI autonomous' },
  { id: 'ai-proposed-human-approved', label: 'AI + approved' },
  { id: 'degraded-fallback', label: 'Fallback' },
  { id: 'human-override', label: 'Human override' },
  { id: 'staged-pending', label: 'Staged' },
  { id: 'local-engine', label: 'Local engine' },
];

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ history, onClear }) => {
  const toast = useToast();
  const [inspectedDecision, setInspectedDecision] = useState<OrchestrationDecision | null>(null);
  const [filter, setFilter] = useState<ProvenanceKind | 'all'>('all');
  const [page, setPage] = useState(0);

  const withProv = useMemo(
    () => history.map((d) => ({ d, prov: provenanceOf(d) })),
    [history],
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: withProv.length };
    withProv.forEach(({ prov }) => { m[prov.kind] = (m[prov.kind] || 0) + 1; });
    return m;
  }, [withProv]);
  const filtered = filter === 'all' ? withProv : withProv.filter(({ prov }) => prov.kind === filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const setFilterAndReset = (f: ProvenanceKind | 'all') => { setFilter(f); setPage(0); };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `energy-orchestrator-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-em" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Immutable Decision Audit Log & Compliance Ledger
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Cryptographically stamped record capturing telemetry state, multi-objective ranking, and executed actuator commands.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onClear && history.length > 0 && (
            <button
              onClick={() => { if (confirm('Clear the in-memory audit trail? (Server ledger is append-only and untouched.)')) { onClear(); toast('Audit view cleared.', 'info'); } }}
              className="px-3 py-1.5 text-xs font-medium text-ro bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap hover:bg-rose-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear view</span>
            </button>
          )}
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 text-xs font-medium text-paper bg-raise hover:bg-strong border border-linestrong rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-em" />
            <span>Export Audit Log (JSON)</span>
          </button>
        </div>
      </div>

      {/* Provenance filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-mono text-faint flex items-center gap-1"><Bot className="w-3 h-3" />Made by:</span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterAndReset(f.id)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${filter === f.id ? 'bg-cy/15 text-cy border border-cyan-500/40' : 'bg-raise text-muted hover:text-paper border border-transparent'}`}
          >
            {f.label} ({counts[f.id] || 0})
          </button>
        ))}
      </div>
      <p className="text-[11px] text-faint leading-relaxed -mt-2">
        AI autonomous = agents decided and dispatched alone · AI + approved = agents proposed, human released it ·
        Fallback = LLMs unreachable, grounded heuristics decided (guardrails still enforced) ·
        Human override = operator discarded the AI plan · Staged = plan held for approval, nothing executed ·
        Local engine = deterministic fallback, no LLM involved. Hover a badge for the full reason.
      </p>

      {/* History Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-line text-muted font-mono text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Decision ID</th>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Made by</th>
              <th className="py-2.5 px-3">Strategy</th>
              <th className="py-2.5 px-3 text-right">Net Economic ($)</th>
              <th className="py-2.5 px-3 text-right">Confidence</th>
              <th className="py-2.5 px-3">HITL Mode</th>
              <th className="py-2.5 px-3">Cryptographic Stamp</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60 font-mono">
            {visible.map(({ d: item, prov }) => (
              <tr key={item.decisionId} className="hover:bg-raise/40 text-soft">
                <td className="py-2.5 px-3 font-semibold text-paper">{item.decisionId}</td>
                <td className="py-2.5 px-3 tabular-nums">{item.cycleTime}</td>
                <td className="py-2.5 px-3">
                  <span title={prov.detail} className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border whitespace-nowrap ${PROVENANCE_STYLE[prov.kind]}`}>
                    {prov.label}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-sans font-medium text-paper">
                  {item.selectedScenario.name}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  <span
                    className={
                      item.selectedScenario.netEconomicImpactUsd >= 0
                        ? 'text-em'
                        : 'text-ro'
                    }
                  >
                    {item.selectedScenario.netEconomicImpactUsd >= 0 ? '+' : ''}$
                    {item.selectedScenario.netEconomicImpactUsd.toFixed(0)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-cy">
                  {item.confidencePct}%
                </td>
                <td className="py-2.5 px-3">
                  <span
                    title={((item as any).hitlReasons as string[] | undefined)?.join(' · ') || item.hitlStatus}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      item.hitlStatus === 'AUTONOMOUS'
                        ? 'bg-emerald-500/10 text-em'
                        : 'bg-amber-500/10 text-am'
                    }`}
                  >
                    {item.hitlStatus}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-[11px] text-faint">{item.auditHash}</td>
                <td className="py-2.5 px-3 text-right font-sans">
                  <button
                    onClick={() => setInspectedDecision(item)}
                    className="text-cy hover:text-cy font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between text-[11px] font-mono text-muted">
        <span>Showing {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length} (cap: latest 50 in memory)</span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="p-1.5 rounded bg-raise border border-linestrong disabled:opacity-40 hover:bg-strong"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <span className="tabular-nums">p{safePage + 1}/{pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={safePage >= pages - 1} className="p-1.5 rounded bg-raise border border-linestrong disabled:opacity-40 hover:bg-strong"><ChevronRight className="w-3.5 h-3.5" /></button>
        </span>
      </div>

      {/* Decision Detail Drawer Modal */}
      {inspectedDecision && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-panel border border-linestrong rounded-xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <span className="font-mono text-xs text-cy">
                  Decision Audit Record: {inspectedDecision.decisionId}
                </span>
                <h4 className="text-base font-semibold text-paper">
                  {inspectedDecision.selectedScenario.name}
                </h4>
              </div>
              <button
                onClick={() => setInspectedDecision(null)}
                className="p-1 text-muted hover:text-paper rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
              <div className="p-3 rounded bg-page border border-line font-mono text-[11px] text-muted space-y-1">
                <div>Timestamp: {inspectedDecision.timestamp}</div>
                <div>Hash: {inspectedDecision.auditHash}</div>
                <div>Confidence: {inspectedDecision.confidencePct}% ({inspectedDecision.hitlStatus})</div>
                {inspectedDecision.approvedBy && <div>Approved by: {inspectedDecision.approvedBy}</div>}
                {((inspectedDecision as any).hitlReasons as string[] | undefined)?.length ? (
                  <div>Gate reasons: {((inspectedDecision as any).hitlReasons as string[]).join(' · ')}</div>
                ) : null}
                <div>Provenance: {provenanceOf(inspectedDecision).label} — {provenanceOf(inspectedDecision).detail}</div>
                {inspectedDecision.agenticTrace && (() => {
                  const [h, s] = String(inspectedDecision.agenticTrace.modelUsed || '').split(' + ');
                  return (
                    <>
                      <div>Handoff: {h || 'unknown'}</div>
                      <div>Supervisor: {s || 'unknown'}</div>
                    </>
                  );
                })()}
              </div>

              <div>
                <span className="font-semibold text-paper block mb-1">Rationale:</span>
                <p className="text-soft leading-relaxed bg-page p-3 rounded border border-line">
                  {inspectedDecision.rationale}
                </p>
              </div>

              <div>
                <span className="font-semibold text-paper block mb-1">Actions Dispatched:</span>
                <div className="space-y-1.5">
                  {inspectedDecision.actions.map((act, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-page border border-line/80 flex items-center justify-between font-mono text-[11px]"
                    >
                      <span className="text-paper font-sans">{act.assetName}</span>
                      <span className="text-cy">{act.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-line flex justify-end">
              <button
                onClick={() => setInspectedDecision(null)}
                className="px-3.5 py-1.5 bg-raise text-paper rounded hover:bg-strong text-xs"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
