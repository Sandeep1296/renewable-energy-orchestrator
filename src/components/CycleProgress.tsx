import React, { useEffect, useState } from 'react';
import { CloudSun, Brain, ClipboardCheck, Loader2, CheckCircle2, Clock, Timer } from 'lucide-react';
import { OrchestrationDecision } from '../types/orchestrator';

interface Props {
  decision: OrchestrationDecision;
  isLoadingAgentic: boolean;
  lastRun?: { at: string; outcome: 'completed' | 'held' | 'dropped' | 'failed' } | null;
}

interface Stage {
  label: string;
  icon: React.ReactNode;
  status: 'done' | 'running' | 'waiting';
  note: string;
}

/** Quick-glance dispatch cycle: Forecast → Deliberation → Dispatch review. */
export const CycleProgress: React.FC<Props> = ({ decision, isLoadingAgentic, lastRun = null }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isLoadingAgentic) return;
    setElapsed(0);
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [isLoadingAgentic]);
  const lastWall = (decision.agenticTrace as any)?.serverLatencyMs;
  const pending = Boolean((decision as any).pendingId) && !decision.hitlApproved;
  const deliberated = Boolean(decision.agenticTrace && decision.agenticTrace.toolsInvoked.length > 0);
  const dispatched = decision.hitlApproved && decision.hitlStatus === 'AUTONOMOUS';
  const approved = decision.hitlApproved && decision.hitlStatus !== 'AUTONOMOUS';

  const stages: Stage[] = [
    {
      label: 'Forecast ingest',
      icon: <CloudSun className="w-4 h-4" />,
      status: 'done',
      note: `Telemetry + live weather in (${decision.cycleTime})`,
    },
    {
      label: 'Agent deliberation',
      icon: <Brain className="w-4 h-4" />,
      status: deliberated ? 'done' : isLoadingAgentic ? 'running' : 'waiting',
      note: deliberated
        ? `${decision.agenticTrace!.toolsInvoked.length} tools · ${decision.selectedScenario.name}`
        : isLoadingAgentic
          ? `Agents reasoning… ${elapsed}s (handoff → supervisor → guard)`
          : 'Queued',
    },
    {
      label: 'Dispatch review',
      icon: <ClipboardCheck className="w-4 h-4" />,
      status: dispatched || approved ? 'done' : pending ? 'waiting' : isLoadingAgentic ? 'running' : 'waiting',
      note: dispatched ? 'Dispatched autonomously' : approved ? `Approved${(decision as any).approvedBy ? ` by ${(decision as any).approvedBy}` : ''}` : pending ? 'Awaiting operator' : 'Pending deliberation',
    },
  ];
  const doneCount = stages.filter((s) => s.status === 'done').length;
  const runningCount = stages.filter((s) => s.status === 'running').length;
  const pct = Math.round(((doneCount + runningCount * 0.5) / stages.length) * 100);

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs min-w-0">
        <span className="font-semibold text-paper truncate">
          Current cycle <span className="font-mono font-normal text-muted">Forecast → plan → dispatch</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
          {typeof lastWall === 'number' && !isLoadingAgentic && (
            <span title="Wall time of the last completed backend dispatch" className="flex items-center gap-1 text-[10px] text-faint">
              <Timer className="w-3 h-3" />{(lastWall / 1000).toFixed(1)}s
            </span>
          )}
          <span className="text-cy">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-raise overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {lastRun && (
        <div className="font-mono text-[10px] text-faint tabular-nums truncate" title="Outcome of the most recent dispatch trigger">
          Last trigger {lastRun.at} · {lastRun.outcome === 'completed' ? 'completed' : lastRun.outcome === 'held' ? 'held (strict AI, no LLM)' : lastRun.outcome === 'dropped' ? 'dropped (already running)' : 'backend failed → local engine'}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {stages.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.note}`}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border min-w-0 transition-colors ${
              s.status === 'done'
                ? 'bg-emerald-500/[0.07] border-emerald-500/30'
                : s.status === 'running'
                  ? 'bg-cyan-500/[0.07] border-cyan-500/30'
                  : 'bg-page border-line'
            }`}
          >
            <span className={`shrink-0 ${s.status === 'done' ? 'text-em' : s.status === 'running' ? 'text-cy' : 'text-faint'}`}>
              {s.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : s.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-paper">
                <span className="truncate">{s.label}</span>
                <span className={`shrink-0 font-mono text-[9px] font-bold px-1 py-px rounded uppercase tracking-wide ${
                  s.status === 'done' ? 'bg-emerald-500/15 text-em' : s.status === 'running' ? 'bg-cyan-500/15 text-cy' : 'bg-raise text-faint'
                }`}>
                  {s.status === 'done' ? 'done' : s.status === 'running' ? 'live' : 'wait'}
                </span>
              </span>
              <span className="block text-[11px] text-muted truncate">{s.note}</span>
            </span>
            <span className="shrink-0 opacity-70">{s.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
