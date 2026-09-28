import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, Clock, ArrowRight, CornerDownRight, X, Pencil, Save, Radio } from 'lucide-react';
import { DAGNode } from '../types/orchestrator';
import { authHeaders, useIsAdmin } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface DAGVisualizerProps {
  nodes: DAGNode[];
  live?: boolean;
}

export const DAGVisualizer: React.FC<DAGVisualizerProps> = ({ nodes, live = false }) => {
  const [selectedNode, setSelectedNode] = useState<DAGNode | null>(null);
  const [liveStates, setLiveStates] = useState<Record<string, { status: string; atMs: number }>>({});
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch('/api/dag/progress');
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setLiveStates(j.states || {});
        setLiveRunId(j.runId || null);
      } catch { /* keep last */ }
    };
    poll();
    const t = setInterval(poll, 800);
    return () => { alive = false; clearInterval(t); };
  }, [live]);

  const statusOf = (n: DAGNode): string => {
    if (live && liveStates[n.id]) return liveStates[n.id].status;
    if (live && !liveStates[n.id]) return 'pending';
    return n.status;
  };
  const [editMode, setEditMode] = useState(false);
  const [def, setDef] = useState<any[] | null>(null);
  const [saveMsg, setSaveMsg] = useState('');
  const admin = useIsAdmin();
  const toast = useToast();

  const loadDef = async () => {
    const r = await fetch('/api/dag/definition');
    if (r.ok) { setDef(await r.json()); setEditMode(true); setSaveMsg(''); }
  };
  const saveDef = async () => {
    if (!def) return;
    const h = await authHeaders();
    const r = await fetch('/api/dag/definition', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(def) });
    if (r.ok) { setDef(await r.json()); setSaveMsg('Saved — next dispatch uses updated DAG.'); toast('DAG definition saved — live on next dispatch.', 'success'); }
    else { const msg = `Save failed: ${(await r.json()).error || r.status}`; setSaveMsg(msg); toast(msg, 'error'); }
  };

  const totalDuration = nodes.reduce((sum, n) => sum + n.durationMs, 0);

  // Group nodes by phase
  const phases = [
    { key: 'INGESTION', label: '01. Ingestion & Preprocessing' },
    { key: 'ANALYSIS', label: '02. Parallel Domain Analysis' },
    { key: 'SCENARIO_MODELING', label: '03. Scenario Projection' },
    { key: 'OPTIMIZATION', label: '04. Multi-Objective Optimization' },
    { key: 'GROUNDING', label: '05. Grounding & Physical Verification' },
    { key: 'EXPLAINABILITY', label: '06. Explainability & Counterfactuals' },
    { key: 'EXECUTION', label: '07. Planning, Execution & Audit' },
  ];

  // Topological flow order for the transfer strip (Kahn; falls back to listed order)
  const flowOrder: string[] = (() => {
    const ids = nodes.map((n) => n.id);
    const indeg = new Map(ids.map((id) => [id, 0]));
    const adj = new Map<string, string[]>();
    nodes.forEach((n) => n.dependsOn.forEach((d) => {
      if (!indeg.has(n.id) || !indeg.has(d)) return;
      indeg.set(n.id, (indeg.get(n.id) || 0) + 1);
      adj.set(d, [...(adj.get(d) || []), n.id]);
    }));
    const q = ids.filter((id) => (indeg.get(id) || 0) === 0);
    const out: string[] = [];
    while (q.length) {
      const cur = q.shift()!;
      out.push(cur);
      for (const nxt of adj.get(cur) || []) {
        indeg.set(nxt, indeg.get(nxt)! - 1);
        if (indeg.get(nxt) === 0) q.push(nxt);
      }
    }
    return out.length === ids.length ? out : ids;
  })();

  // Live transfer feed: completion sequence with inter-node gaps from real timestamps
  const transfers = (() => {
    if (!live) return [];
    const done = flowOrder
      .filter((id) => liveStates[id] && ['completed', 'failed', 'skipped'].includes(liveStates[id].status))
      .map((id) => ({ id, at: liveStates[id].atMs }));
    return done.slice(-8).map((d, i, arr) => ({
      from: i === 0 ? 'start' : arr[i - 1].id,
      to: d.id,
      gapMs: i === 0 ? d.at : d.at - arr[i - 1].at,
      latest: i === arr.length - 1,
    }));
  })();

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cy" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Directed Acyclic Graph (DAG) Execution Pipeline
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Dynamic 12-task decision workflow executing every 15-minute dispatch cycle.
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          {live && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/40 text-cy font-bold animate-pulse" title={liveRunId ? `Run ${liveRunId}` : 'Live run'}>
              <Radio className="w-3 h-3" />LIVE
            </span>
          )}
          <span className="text-muted">Total Latency:</span>
          <span className="text-cy font-bold tabular-nums">{totalDuration} ms</span>
          <span className="text-faintdeep">·</span>
          <span className="text-em font-medium">{nodes.filter((n) => n.status === 'completed').length}/{nodes.length} Completed</span>
          {admin && (
            <button onClick={editMode ? () => setEditMode(false) : loadDef} className="px-2 py-1 rounded bg-raise text-soft hover:text-paper flex items-center gap-1 text-[11px]" title="Requires Admin org role"><Pencil className="w-3 h-3" />{editMode ? 'View trace' : 'Edit DAG'}</button>
          )}
        </div>
      </div>

      {editMode && def && (
        <div className="p-3 rounded-lg bg-page border border-amber-500/30 space-y-2 text-xs">
          <div className="text-am font-semibold">User-editable DAG definition (enable/disable nodes; DAG-08 grounding locked; cycles rejected server-side)</div>
          {def.map((n) => (
            <div key={n.id} className="flex items-center justify-between gap-2 p-2 rounded bg-panel border border-line">
              <span className="font-mono text-soft">{n.id} · {n.name} <span className="text-faint">← {n.dependsOn.join(', ') || 'root'}</span></span>
              <button
                onClick={() => setDef(def.map((d) => (d.id === n.id ? { ...d, enabled: !d.enabled } : d)))}
                disabled={n.id === 'DAG-08'}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${n.enabled ? 'bg-emerald-500/15 text-em' : 'bg-raise text-faint'}`}
              >
                {n.id === 'DAG-08' ? 'LOCKED ON' : n.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={saveDef} className="px-3 py-1.5 bg-emerald-600 text-onaccent rounded flex items-center gap-1"><Save className="w-3.5 h-3.5" />Save DAG</button>
            {saveMsg && <span className="font-mono text-muted">{saveMsg}</span>}
          </div>
        </div>
      )}

      {/* DAG Flow Pipeline */}
      <div className="space-y-4">
        {/* Transfer strip: topological flow with live handoff animation */}
        <div className="p-3 rounded-lg bg-page border border-line overflow-x-auto">
          <div className="text-[10px] font-mono text-faint uppercase tracking-wider mb-2">
            {live ? 'Live data transfers (real executor events)' : 'Static flow order (topological)'}
          </div>
          <div className="flex items-center gap-1 min-w-max font-mono text-[11px]">
            {flowOrder.map((id, i) => {
              const st = live ? (liveStates[id]?.status || 'pending') : 'completed';
              const isLatestTransfer = live && transfers.length > 0 && transfers[transfers.length - 1].to === id;
              return (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className={`px-0.5 ${isLatestTransfer ? 'text-cy animate-pulse font-bold' : 'text-faint'}`} title={isLatestTransfer ? 'Data just transferred here' : 'Dependency edge'}>
                      {isLatestTransfer ? '⤑' : '→'}
                    </span>
                  )}
                  <span
                    title={id}
                    className={`px-1.5 py-0.5 rounded border whitespace-nowrap ${
                      st === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-em'
                      : st === 'running' ? 'bg-cyan-500/15 border-cyan-500/50 text-cy font-bold animate-pulse'
                      : st === 'failed' ? 'bg-rose-500/10 border-rose-500/40 text-ro'
                      : st === 'skipped' ? 'bg-raise border-linestrong text-faint line-through'
                      : 'bg-raise border-line text-faint'
                    }`}
                  >
                    {id.replace('DAG-', '')}
                  </span>
                </span>
              );
            })}
          </div>
          {live && transfers.length > 0 && (
            <div className="mt-2 font-mono text-[10px] text-muted tabular-nums truncate" title="Most recent inter-node handoff with real gap">
              last transfer: {transfers[transfers.length - 1].from} → {transfers[transfers.length - 1].to} (+{transfers[transfers.length - 1].gapMs}ms)
            </div>
          )}
        </div>
        {phases.map((phase) => {
          const phaseNodes = nodes.filter((n) => n.phase === phase.key);
          if (phaseNodes.length === 0) return null;

          return (
            <div key={phase.key} className="space-y-2">
              <div className="text-[11px] font-mono text-muted uppercase tracking-wider font-semibold">
                {phase.label}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {phaseNodes.map((node) => {
                  const st = statusOf(node);
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNode(node)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        st === 'running'
                          ? 'bg-cyan-500/[0.07] border-cyan-500/50 shadow-md'
                          : st === 'pending'
                            ? 'bg-page/40 border-line opacity-50'
                            : selectedNode?.id === node.id
                              ? 'bg-raise border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                              : 'bg-page/70 border-line hover:border-linestrong hover:bg-page'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {st === 'running' ? (
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-cyan-500/30 border-t-cy animate-spin shrink-0" />
                          ) : st === 'pending' ? (
                            <Clock className="w-3.5 h-3.5 text-faint shrink-0" />
                          ) : st === 'failed' ? (
                            <X className="w-3.5 h-3.5 text-ro shrink-0" />
                          ) : st === 'skipped' ? (
                            <span className="font-mono text-[10px] text-faint shrink-0">—</span>
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-em shrink-0" />
                          )}
                          <span className="font-semibold text-paper truncate max-w-[190px]">
                            {node.name}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-muted tabular-nums shrink-0">
                          {st === 'running' ? 'live…' : st === 'pending' ? 'queued' : `${node.durationMs}ms`}
                        </span>
                      </div>

                      <div className="text-[11px] text-muted mt-2 line-clamp-1">
                        <span className="text-faint font-mono">In:</span> {node.inputsSummary}
                      </div>
                      <div className="text-[11px] text-soft mt-1 line-clamp-1">
                        <span className="text-faint font-mono">Out:</span> {node.outputsSummary}
                      </div>

                      {node.dependsOn.length > 0 && (
                        <div className="mt-2 pt-1.5 border-t border-line/60 flex items-center gap-1 text-[10px] text-faint font-mono">
                          <CornerDownRight className="w-3 h-3 text-faintdeep" />
                          <span>Depends on: {node.dependsOn.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Inspector Drawer Modal */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-panel border border-linestrong rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-em" />
                <h4 className="text-sm font-semibold text-paper">{selectedNode.name}</h4>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 text-muted hover:text-paper rounded hover:bg-raise"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between font-mono text-muted">
                <span>Task ID: {selectedNode.id}</span>
                <span>Latency: {selectedNode.durationMs}ms</span>
              </div>

              <div>
                <span className="text-muted font-semibold block mb-1">Inputs:</span>
                <div className="p-2.5 rounded bg-page border border-line text-paper font-mono text-[11px]">
                  {selectedNode.inputsSummary}
                </div>
              </div>

              <div>
                <span className="text-muted font-semibold block mb-1">Outputs:</span>
                <div className="p-2.5 rounded bg-page border border-line text-em font-mono text-[11px]">
                  {selectedNode.outputsSummary}
                </div>
              </div>

              {selectedNode.dependsOn.length > 0 && (
                <div>
                  <span className="text-muted font-semibold block mb-1">Prerequisite Dependencies:</span>
                  <div className="flex gap-2">
                    {selectedNode.dependsOn.map((dep) => (
                      <span
                        key={dep}
                        className="px-2 py-0.5 rounded bg-raise text-soft font-mono text-[11px]"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedNode(null)}
                className="px-3 py-1.5 text-xs font-medium text-soft bg-raise rounded hover:bg-strong"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
