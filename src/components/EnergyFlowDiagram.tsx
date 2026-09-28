import React from 'react';
import { Sun, Wind, BatteryCharging, Factory, ArrowRight, Zap, ArrowLeftRight } from 'lucide-react';
import { PortfolioState, ActionCommand, ScenarioCandidate } from '../types/orchestrator';

interface EnergyFlowDiagramProps {
  portfolio: PortfolioState;
  selectedScenario: ScenarioCandidate;
  actions: ActionCommand[];
}

export const EnergyFlowDiagram: React.FC<EnergyFlowDiagramProps> = ({
  portfolio,
  selectedScenario,
  actions,
}) => {
  const totalSolar = portfolio.solarFarms.reduce((s, a) => s + a.currentOutputMw, 0);
  const totalSolarCap = portfolio.solarFarms.reduce((s, a) => s + a.capacityMw, 0);
  const totalWind = portfolio.windFarms.reduce((s, a) => s + a.currentOutputMw, 0);
  const totalWindCap = portfolio.windFarms.reduce((s, a) => s + a.capacityMw, 0);
  const totalRenewable = totalSolar + totalWind;

  const totalBatteryDispatch = Object.values(selectedScenario.batteryDispatchMw).reduce((sum, val) => sum + val, 0); // + = discharge (supply), - = charge (demand)

  const drCurtailed = Object.values(selectedScenario.demandResponseCurtailMw).reduce((a, b) => a + b, 0);
  const effectiveDemand = portfolio.grid.totalDemandMw - drCurtailed;

  const netImportMw = selectedScenario.gridNetImportMw; // + = import from grid, - = export to grid
  const curtailmentMw = selectedScenario.curtailmentMw.solar + selectedScenario.curtailmentMw.wind;

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <h3 className="text-sm font-semibold text-paper tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-em" />
            Topological Energy Flow & Dispatch Balance
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Instantaneous power flow across renewable generation, battery storage, transmission interties, and industrial loads.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-muted">Total Supply:</span>
          <span className="text-em font-semibold tabular-nums">
            {(totalRenewable + (netImportMw > 0 ? netImportMw : 0) + (totalBatteryDispatch > 0 ? totalBatteryDispatch : 0)).toFixed(1)} MW
          </span>
          <span className="text-faintdeep">≡</span>
          <span className="text-muted">Total Demand:</span>
          <span className="text-cy font-semibold tabular-nums">
            {(effectiveDemand + (netImportMw < 0 ? -netImportMw : 0) + (totalBatteryDispatch < 0 ? -totalBatteryDispatch : 0) + curtailmentMw).toFixed(1)} MW
          </span>
        </div>
      </div>

      {/* Visual Topological Flow Map */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        {/* Column 1: Renewable Generation */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            01. Generation Fleet
          </div>

          {/* Solar Fleet Box */}
          <div className="p-3 rounded-lg bg-page/80 border border-amber-500/20">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-am">
                <Sun className="w-4 h-4" />
                <span className="font-medium">Solar Array ({portfolio.solarFarms.length} Farms)</span>
              </div>
              <span className="font-mono font-bold text-paper tabular-nums">
                {totalSolar.toFixed(1)} MW
              </span>
            </div>
            <div className="text-[11px] text-muted mt-1">{totalSolarCap.toFixed(0)} MW Nameplate DC</div>
          </div>

          {/* Wind Fleet Box */}
          <div className="p-3 rounded-lg bg-page/80 border border-cyan-500/20">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-cy">
                <Wind className="w-4 h-4" />
                <span className="font-medium">Wind Array ({portfolio.windFarms.length} Farms)</span>
              </div>
              <span className="font-mono font-bold text-paper tabular-nums">
                {totalWind.toFixed(1)} MW
              </span>
            </div>
            <div className="text-[11px] text-muted mt-1">{totalWindCap.toFixed(0)} MW Nameplate Rated</div>
          </div>

          {curtailmentMw > 0 && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-ro font-mono">
              ⚠️ Active Curtailment: {curtailmentMw.toFixed(1)} MW
            </div>
          )}
        </div>

        {/* Column 2: Storage Buffer (BESS Fleet) */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            02. Storage Buffer ({portfolio.batteries.length} BESS)
          </div>

          {portfolio.batteries.map((b) => {
            const dispatch = selectedScenario.batteryDispatchMw[b.id] ?? 0;
            return (
              <div key={b.id} className="p-3 rounded-lg bg-page/80 border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-em">
                    <BatteryCharging className="w-4 h-4" />
                    <span className="font-medium truncate max-w-[120px]">{b.name}</span>
                  </div>
                  <span className="font-mono font-bold text-paper tabular-nums text-xs">
                    {b.status === 'fault'
                      ? 'OFFLINE'
                      : dispatch > 0
                      ? `+${dispatch.toFixed(1)} MW`
                      : `${dispatch.toFixed(1)} MW`}
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-1 flex justify-between font-mono">
                  <span>{b.currentSocPct.toFixed(0)}% SOC ({b.chemistry})</span>
                  <span className="text-cy">
                    {b.status === 'fault'
                      ? 'Fault Alert'
                      : dispatch > 0.5
                      ? 'Discharging'
                      : dispatch < -0.5
                      ? 'Charging'
                      : 'Standby'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Column 3: Central Collector Bus & Transmission Intertie */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            03. Grid Intertie
          </div>

          <div className="p-3.5 rounded-lg bg-page/90 border border-purple-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-pu">Wholesale Market Exchange</span>
              <span className="font-mono font-bold text-paper tabular-nums">
                {netImportMw < 0 ? `Export ${Math.abs(netImportMw).toFixed(1)}` : `Import ${netImportMw.toFixed(1)}`} MW
              </span>
            </div>
            <div className="text-[11px] text-muted font-mono space-y-0.5">
              <div>Spot: ${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh</div>
              <div>Frequency: {portfolio.grid.frequencyHz.toFixed(2)} Hz</div>
            </div>
            <div className="pt-2 border-t border-line text-[11px] text-muted flex justify-between">
              <span>Intertie North:</span>
              <span className="text-paper font-mono">{portfolio.interties[0].currentFlowMw.toFixed(1)} MW</span>
            </div>
          </div>
        </div>

        {/* Column 4: Industrial Consumers Demand */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            04. Industrial Demand
          </div>

          <div className="p-3.5 rounded-lg bg-page/80 border border-linestrong space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-paper">
                <Factory className="w-4 h-4 text-muted" />
                <span className="font-medium">Total Load</span>
              </div>
              <span className="font-mono font-bold text-paper tabular-nums">
                {effectiveDemand.toFixed(1)} MW
              </span>
            </div>

            <div className="text-[11px] text-muted space-y-1">
              <div className="flex justify-between">
                <span>Baseload (Critical):</span>
                <span className="font-mono text-paper">110.0 MW</span>
              </div>
              <div className="flex justify-between">
                <span>Flexible (Active):</span>
                <span className="font-mono text-paper">{(40 - drCurtailed).toFixed(1)} MW</span>
              </div>
              {drCurtailed > 0 && (
                <div className="flex justify-between text-em font-mono">
                  <span>DR Curtailed:</span>
                  <span>-{drCurtailed.toFixed(1)} MW</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
