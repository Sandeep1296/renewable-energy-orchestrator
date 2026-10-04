import React from 'react';
import { GitBranch, Scale, ShieldCheck, UserCheck, Trophy } from 'lucide-react';
import { OrchestrationDecision, ObjectiveWeights } from '../types/orchestrator';

interface Props {
  decision: OrchestrationDecision;
  weights: ObjectiveWeights;
}

/** Plain-language account of how scenario modeling picks the winning strategy. */
export const ScenarioSelectionExplainer: React.FC<Props> = ({ decision, weights }) => {
  const sel = decision.selectedScenario;
  const enabledCount = decision.allScenarios.filter((c) => !c.excluded).length;
  const totalW = weights.minimizeCost + weights.minimizeEmissions + (weights.minimizeCurtailment ?? 50) +
    weights.minimizeBatteryDegradation + weights.maximizeReliability +
    weights.maximizeRenewableUtilization + (weights.maximizeArbitrageProfit ?? 50) || 1;
  const rows = Object.entries(sel.scores || {}).map(([k, v]: any) => ({ k, raw: v.raw, weighted: v.weighted }));
  const steps = [
    { icon: <GitBranch className="w-3.5 h-3.5 text-cy" />, title: '1 · Simulate strategy candidates', body: `Physics builders project ${enabledCount} enabled strategies (of ${decision.allScenarios.length}) against live telemetry — the LLM never invents MW or $. Disable strategies in the Scenarios tab to constrain the space.` },
    { icon: <Scale className="w-3.5 h-3.5 text-em" />, title: '2 · Score 7 objectives', body: `Each candidate is scored 0–100 on cost, emissions, curtailment, degradation, reliability, renewable use and arbitrage, then blended with YOUR weights ( Tunables above). Cost, emissions, curtailment and arbitrage rank relatively each cycle, so real spreads always discriminate; health metrics keep absolute scales.` },
    { icon: <Trophy className="w-3.5 h-3.5 text-am" />, title: `3 · Rank & select — "${sel.name}" won at ${sel.compositeUtilityScore}/100`, body: `Composite = Σ(raw × weight) ÷ ${totalW.toFixed(0)}. Highest viable composite wins; reliability < 70 vetoes a candidate outright.` },
    { icon: <ShieldCheck className="w-3.5 h-3.5 text-em" />, title: '4 · Non-bypassable guardrails', body: `${decision.groundingChecks.filter((g) => g.status === 'PASS').length}/${decision.groundingChecks.length} checks passed (battery ratings, SOC floors, line SOL, IEEE-1547, energy conservation). A FAIL blocks execution regardless of score.` },
    { icon: <UserCheck className="w-3.5 h-3.5 text-pu" />, title: `5 · HITL gate — ${decision.hitlStatus} at ${decision.confidencePct}%`, body: decision.hitlStatus === 'AUTONOMOUS' ? 'Confidence and grid state met autonomy criteria: dispatched immediately.' : 'Critical plan staged only — a human must approve before any actuator moves.' },
  ];
  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2.5">
        {steps.map((s) => (
          <div key={s.title} className="p-3 rounded-lg bg-page border border-line space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-paper">{s.icon}<span className="leading-tight">{s.title}</span></div>
            <p className="text-[11px] text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-left text-faint uppercase tracking-wider">
                <th className="py-1.5 pr-3">Objective</th>
                <th className="py-1.5 pr-3 text-right">Raw / 100</th>
                <th className="py-1.5 text-right">Weighted contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-soft">
              {rows.map((r) => (
                <tr key={r.k}>
                  <td className="py-1.5 pr-3">{r.k}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{Number(r.raw).toFixed(1)}</td>
                  <td className="py-1.5 text-right tabular-nums text-cy">+{Number(r.weighted).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
