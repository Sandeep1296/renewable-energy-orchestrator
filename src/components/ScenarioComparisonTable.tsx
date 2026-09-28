import React from 'react';
import { Trophy, CheckCircle, TrendingUp, AlertCircle, ArrowUpRight } from 'lucide-react';
import { ScenarioCandidate } from '../types/orchestrator';

interface ScenarioComparisonTableProps {
  scenarios: ScenarioCandidate[];
  selectedScenario: ScenarioCandidate;
}

export const ScenarioComparisonTable: React.FC<ScenarioComparisonTableProps> = ({
  scenarios,
  selectedScenario,
}) => {
  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-am" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Scenario Modeling & Multi-Attribute Trade-Off Comparison
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            5 concurrent strategy branches evaluated against user objective weights to identify the optimal Pareto frontier.
          </p>
        </div>
        <div className="text-xs text-muted font-mono">
          Winning Strategy: <span className="text-em font-semibold">{selectedScenario.name}</span>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-line text-muted font-mono text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-3">Rank / Strategy</th>
              <th className="py-2.5 px-3 text-right">BESS MW</th>
              <th className="py-2.5 px-3 text-right">Grid Exchange</th>
              <th className="py-2.5 px-3 text-right">Net Impact ($)</th>
              <th className="py-2.5 px-3 text-right">Emissions (t)</th>
              <th className="py-2.5 px-3 text-right">Curtail (MWh)</th>
              <th className="py-2.5 px-3 text-right">BESS Health</th>
              <th className="py-2.5 px-3 text-right">Reliability</th>
              <th className="py-2.5 px-3 text-right">Clean %</th>
              <th className="py-2.5 px-3 text-right font-bold text-paper">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60 font-mono">
            {scenarios.map((s) => {
              const isWinner = s.id === selectedScenario.id;
              const totalB = Object.values(s.batteryDispatchMw || {}).reduce((sum: number, v) => sum + (Number(v) || 0), 0);

              return (
                <tr
                  key={s.id}
                  className={`transition-colors ${
                    s.excluded
                      ? 'opacity-45'
                      : isWinner
                        ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                        : 'hover:bg-raise/40 text-soft'
                  }`}
                >
                  {/* Strategy Name */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                          isWinner
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-raise text-muted'
                        }`}
                      >
                        {s.rank}
                      </span>
                      <div>
                        <div className="font-semibold text-paper flex items-center gap-1.5 font-sans">
                          {s.name}
                          {isWinner && !s.excluded && (
                            <span className="text-[10px] text-em font-mono font-normal">
                              ★ SELECTED
                            </span>
                          )}
                          {s.excluded && (
                            <span className="text-[10px] text-faint font-mono font-normal border border-linestrong rounded px-1">
                              DISABLED BY OPERATOR
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-faint font-sans">{s.strategyKicker}</div>
                      </div>
                    </div>
                  </td>

                  {/* BESS MW */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {totalB > 0 ? (
                      <span className="text-cy">+{totalB.toFixed(1)} MW</span>
                    ) : totalB < 0 ? (
                      <span className="text-em">{totalB.toFixed(1)} MW</span>
                    ) : (
                      <span className="text-faint">0.0 MW</span>
                    )}
                  </td>

                  {/* Grid Net Exchange */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    {s.gridNetImportMw < 0 ? (
                      <span className="text-em">Export {Math.abs(s.gridNetImportMw).toFixed(1)}</span>
                    ) : s.gridNetImportMw > 0 ? (
                      <span className="text-am">Import {s.gridNetImportMw.toFixed(1)}</span>
                    ) : (
                      <span className="text-faint">Balanced 0.0</span>
                    )}
                  </td>

                  {/* Net Economic Impact */}
                  <td className="py-3 px-3 text-right tabular-nums font-semibold">
                    <span
                      className={
                        s.netEconomicImpactUsd >= 0 ? 'text-em' : 'text-ro'
                      }
                    >
                      {s.netEconomicImpactUsd >= 0 ? '+' : ''}${s.netEconomicImpactUsd.toFixed(0)}
                    </span>
                  </td>

                  {/* Carbon Emissions */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className={s.projectedEmissionsTons === 0 ? 'text-em' : 'text-soft'}>
                      {s.projectedEmissionsTons.toFixed(2)} t
                    </span>
                  </td>

                  {/* Curtailment */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className={s.curtailmentMwh > 0 ? 'text-am' : 'text-faint'}>
                      {s.curtailmentMwh.toFixed(1)} MWh
                    </span>
                  </td>

                  {/* Battery Health Score */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className={s.batteryDegradationScore >= 80 ? 'text-cy' : 'text-muted'}>
                      {s.batteryDegradationScore}/100
                    </span>
                  </td>

                  {/* Reliability Score */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className={s.reliabilityScore >= 90 ? 'text-em' : 'text-am'}>
                      {s.reliabilityScore}/100
                    </span>
                  </td>

                  {/* Clean Utilization */}
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className="text-paper font-medium">{s.renewableUtilizationPct.toFixed(1)}%</span>
                  </td>

                  {/* Composite Utility Score */}
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-sm">
                    <span className={isWinner ? 'text-em' : 'text-soft'}>
                      {s.compositeUtilityScore.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Description of Winning Strategy */}
      <div className="p-3.5 rounded-lg bg-page/70 border border-line text-xs text-soft flex items-start gap-2.5">
        <CheckCircle className="w-4 h-4 text-em shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-paper">{selectedScenario.name}: </span>
          <span>{selectedScenario.description}</span>
        </div>
      </div>
    </div>
  );
};
