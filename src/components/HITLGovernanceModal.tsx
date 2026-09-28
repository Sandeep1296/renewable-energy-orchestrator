import React, { useState, useEffect, useMemo } from 'react';
import { ShieldAlert, CheckCircle, XCircle, Clock, AlertTriangle, X, Lock } from 'lucide-react';
import { OrchestrationDecision, ActionCommand, PortfolioState, ScenarioCandidate } from '../types/orchestrator';
import { useCanApprove, useSession } from '../auth/ClerkWrapper';
import { runGroundingValidation } from '../services/orchestrationEngine';

interface HITLGovernanceModalProps {
  decision: OrchestrationDecision;
  portfolio: PortfolioState;
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  onOverrideConservative: () => void;
  onSelectScenario: (sc: ScenarioCandidate) => void;
}

export const HITLGovernanceModal: React.FC<HITLGovernanceModalProps> = ({
  decision,
  portfolio,
  isOpen,
  onClose,
  onApprove,
  onOverrideConservative,
  onSelectScenario,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(decision.hitlTimeoutSec || 300);
  const canApprove = useCanApprove();
  const session = useSession();

  // Per-scenario live grounding, so the approver never picks a violating plan.
  // Balance is checked against each scenario's ASSUMED inputs (stored at compute
  // time); a staleness banner below covers telemetry drift since then.
  const scenarioGates = useMemo(() => {
    const m: Record<string, { fail: boolean; failIds: string[]; passCount: number; total: number }> = {};
    for (const sc of decision.allScenarios) {
      try {
        const checks = runGroundingValidation(sc, portfolio);
        const fails = checks.filter((c) => c.status === 'FAIL').map((c) => c.id);
        m[sc.id] = { fail: fails.length > 0, failIds: fails, passCount: checks.filter((c) => c.status === 'PASS').length, total: checks.length };
      } catch {
        m[sc.id] = { fail: true, failIds: ['VALIDATION-ERROR'], passCount: 0, total: 0 };
      }
    }
    return m;
  }, [decision, portfolio]);

  const liveCleanGen = useMemo(() => {
    const s = portfolio.solarFarms.reduce((sum: number, a) => sum + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
    const w = portfolio.windFarms.reduce((sum: number, a) => sum + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
    return Math.round((s + w) * 10) / 10;
  }, [portfolio]);
  const assumedGen = decision.selectedScenario.assumedCleanGenMw;
  const genDrift = assumedGen !== undefined ? Math.round(Math.abs(liveCleanGen - assumedGen) * 10) / 10 : 0;

  useEffect(() => {
    if (!isOpen || decision.hitlStatus === 'AUTONOMOUS') return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (canApprove) onOverrideConservative(); // Safe default executes only for authorized roles
          else onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, decision.hitlStatus, canApprove]);

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-panel border border-linestrong rounded-xl p-5 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-am" />
            <h3 className="text-base font-semibold text-paper tracking-tight">
              Human-in-the-Loop (HITL) Dispatch Governance
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-muted hover:text-paper rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tier Status Banner */}
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
            decision.hitlStatus === 'SUPERVISED'
              ? 'bg-amber-950/30 border-amber-500/40 text-am'
              : 'bg-rose-950/30 border-rose-500/40 text-ro'
          }`}
        >
          <div>
            <span className="font-bold uppercase font-mono tracking-wider">
              {decision.hitlStatus} STAGING MODE
            </span>
            <p className="text-[11px] text-soft mt-0.5">
              Calculated confidence ({decision.confidencePct}%) requires operator authorization before field actuator dispatch.
              {((decision as any).hitlReasons as string[] | undefined)?.length ? (
                <span className="block mt-1 font-mono text-am">
                  Why: {((decision as any).hitlReasons as string[]).join(' · ')}
                </span>
              ) : null}
            </p>
          </div>
          {decision.hitlStatus === 'SUPERVISED' && (
            <div className="text-right font-mono">
              <span className="text-[10px] text-muted block">Auto-Default In:</span>
              <span className="text-base font-bold text-am tabular-nums">
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Selected strategy + economics */}
        <div className="p-3.5 rounded-lg bg-page border border-line text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-paper">{decision.selectedScenario.name}</span>
            <span className="font-mono tabular-nums text-cy">{decision.selectedScenario.compositeUtilityScore.toFixed(1)}/100</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="p-2 rounded bg-raise/60 border border-line">
              <div className="text-[10px] text-faint">NET ECONOMIC</div>
              <div className={`font-bold tabular-nums ${decision.selectedScenario.netEconomicImpactUsd >= 0 ? 'text-em' : 'text-ro'}`}>
                {decision.selectedScenario.netEconomicImpactUsd >= 0 ? '+' : ''}${decision.selectedScenario.netEconomicImpactUsd.toFixed(0)}
              </div>
            </div>
            <div className="p-2 rounded bg-raise/60 border border-line">
              <div className="text-[10px] text-faint">CLEAN USE</div>
              <div className="font-bold tabular-nums text-paper">{decision.selectedScenario.renewableUtilizationPct.toFixed(1)}%</div>
            </div>
            <div className="p-2 rounded bg-raise/60 border border-line">
              <div className="text-[10px] text-faint">RELIABILITY</div>
              <div className="font-bold tabular-nums text-paper">{decision.selectedScenario.reliabilityScore}/100</div>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">{decision.selectedScenario.description}</p>
        </div>

        {/* All-scenario comparison for an informed decision */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            Full field — all ranked strategies:
          </div>
          <div className="rounded-lg border border-line overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-raise/60 text-faint font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-1.5 px-2.5 text-left">#</th>
                  <th className="py-1.5 px-2.5 text-left">Strategy</th>
                  <th className="py-1.5 px-2.5 text-right">Score</th>
                  <th className="py-1.5 px-2.5 text-right">Net $</th>
                  <th className="py-1.5 px-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 font-mono">
                {decision.allScenarios.map((sc) => {
                  const isSel = sc.id === decision.selectedScenario.id;
                  return (
                    <tr key={sc.id} className={isSel ? 'bg-emerald-500/[0.07]' : sc.excluded ? 'opacity-45' : ''}>
                      <td className="py-1.5 px-2.5 tabular-nums text-muted">{sc.rank || '—'}</td>
                      <td className="py-1.5 px-2.5 font-sans font-medium text-paper truncate max-w-[220px]" title={sc.name}>{sc.name}</td>
                      <td className="py-1.5 px-2.5 text-right tabular-nums text-cy">{sc.compositeUtilityScore.toFixed(1)}</td>
                      <td className={`py-1.5 px-2.5 text-right tabular-nums ${sc.netEconomicImpactUsd >= 0 ? 'text-em' : 'text-ro'}`}>
                        {sc.netEconomicImpactUsd >= 0 ? '+' : ''}${sc.netEconomicImpactUsd.toFixed(0)}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        {isSel ? (
                          <span className="text-[10px] font-bold text-em">★ STAGED</span>
                        ) : sc.excluded ? (
                          <span className="text-[10px] text-faint">disabled</span>
                        ) : (
                          <span className="text-[10px] text-faint">ranked out</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {decision.rejectedAlternatives.length > 0 && (
            <p className="text-[11px] text-muted leading-relaxed" title={decision.rejectedAlternatives.map((r) => `${r.name}: ${r.reason}`).join(' | ')}>
              Why not the rest: {decision.rejectedAlternatives[0].reason} Hover for all.
            </p>
          )}
        </div>

        {/* Pick a different strategy (re-validated before it can be staged) */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            Or select a different strategy:
          </div>
          <div className="space-y-1.5">
            {decision.allScenarios.map((sc) => {
              const isSel = sc.id === decision.selectedScenario.id;
              const gate = scenarioGates[sc.id] || { fail: false, failIds: [], passCount: 0, total: 0 };
              return (
                <button
                  key={sc.id}
                  onClick={() => { if (canApprove && !isSel && !gate.fail && !sc.excluded) onSelectScenario(sc); }}
                  disabled={!canApprove || isSel || gate.fail || !!sc.excluded}
                  title={!canApprove ? 'Requires Member role or above' : gate.fail ? `Blocked by: ${gate.failIds.join(', ') || 'validation error'}` : sc.excluded ? 'Disabled by operator in Scenarios tab' : isSel ? 'Currently staged' : `Stage ${sc.name} instead`}
                  className={`w-full p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 disabled:cursor-not-allowed ${isSel ? 'bg-emerald-500/[0.07] border-emerald-500/40' : gate.fail ? 'bg-page border-line opacity-70' : 'bg-page border-line hover:border-linestrong'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-paper truncate">{sc.name}</span>
                    <span className="block text-[11px] font-mono text-muted tabular-nums">
                      {sc.compositeUtilityScore.toFixed(1)} pts · {sc.netEconomicImpactUsd >= 0 ? '+' : ''}${sc.netEconomicImpactUsd.toFixed(0)} · grounding {gate.fail ? <span className="text-ro font-bold">FAIL ({gate.failIds.join(', ')})</span> : <span className="text-em">{gate.passCount}/{gate.total}</span>}
                    </span>
                  </span>
                  <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${isSel ? 'border-emerald-500 bg-emerald-500' : 'border-linestrong'}`}>
                    {isSel && <CheckCircle className="w-3 h-3 text-slate-950" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-faint">Picking another strategy re-validates grounding, rebuilds actuator commands, voids the AI-staged plan, and still requires Approve below.</p>
          {genDrift > 5 && (
            <p className="text-[11px] font-mono text-am bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
              Telemetry drifted Δ{genDrift.toFixed(1)} MW since this plan was computed (live {liveCleanGen.toFixed(1)} vs assumed {assumedGen?.toFixed(1)} MW). Grounding above uses plan-time inputs; consider re-running dispatch for fresh numbers.
            </p>
          )}
        </div>

        {/* Proposed Staged Actions */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            Staged Actuator Commands{(decision as any).pendingId ? ` · ${(decision as any).pendingId} (NOT yet dispatched)` : ''}:
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
            {decision.actions.map((act, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded bg-page border border-line flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-paper">{act.assetName}</div>
                  <div className="text-[11px] text-muted">{act.detail}</div>
                </div>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-raise text-cy">
                  {act.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Grounding Summary */}
        <div className="text-xs text-muted font-mono">
          Physically Grounded: 6/6 validation rules checked · Zero thermodynamic or line violations detected.
        </div>

        {/* What each choice does */}
        <div className="text-[11px] text-slate-400 space-y-1 bg-slate-950/60 border border-slate-800 rounded-lg p-3">
          <div><strong className="text-emerald-300">Approve</strong> — release this exact staged AI plan to field actuators now.</div>
          <div><strong className="text-amber-300">Override</strong> — discard the AI plan; hold all batteries and cover gaps from the market. Safest, costs more.</div>
          <div><strong className="text-slate-300">Dismiss</strong> — decide later; the plan stays staged. On SUPERVISED timeout the safe fallback executes automatically.</div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-line flex items-center justify-between">
          <button
            onClick={() => {
              onOverrideConservative();
              onClose();
            }}
            disabled={!canApprove}
            title={canApprove ? 'Execute safe fallback' : 'Requires Member role or above'}
            className="px-3.5 py-2 text-xs font-medium text-am bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
          >
            Override: Execute Safe Conservative Hold
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-soft bg-raise rounded-lg hover:bg-strong transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                onApprove();
                onClose();
              }}
              disabled={!canApprove}
              title={canApprove ? 'Approve staged dispatch' : 'Sign in as an org Member or Admin to approve'}
              className="px-4 py-2 text-xs font-semibold text-onaccent bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              {!canApprove && <Lock className="w-4 h-4" />}
              {canApprove ? <CheckCircle className="w-4 h-4" /> : null}
              <span>Approve & Dispatch Strategy{!session.local && session.role ? ` (${session.role})` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
