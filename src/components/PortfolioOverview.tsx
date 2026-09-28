import React, { useEffect, useState } from 'react';
import {
  Sun,
  Wind,
  BatteryCharging,
  Factory,
  ArrowRightLeft,
  AlertTriangle,
  Flame,
  Gauge,
  Thermometer,
  Zap,
} from 'lucide-react';
import { PortfolioState, ActionCommand } from '../types/orchestrator';
import { authHeaders, usePermissions } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface PortfolioOverviewProps {
  portfolio: PortfolioState;
  actions: ActionCommand[];
  weatherSource?: 'live' | 'simulated';
}

export const PortfolioOverview: React.FC<PortfolioOverviewProps> = ({
  portfolio,
  actions,
  weatherSource,
}) => {
  const totalSolar = portfolio.solarFarms.reduce((s, a) => s + a.currentOutputMw, 0);
  const totalSolarCap = portfolio.solarFarms.reduce((s, a) => s + a.capacityMw, 0);
  const totalWind = portfolio.windFarms.reduce((s, a) => s + a.currentOutputMw, 0);
  const perms = usePermissions();
  const toast = useToast();
  const [wxMode, setWxMode] = useState<'live' | 'simulated' | 'auto'>('auto');
  useEffect(() => {
    fetch('/api/weather/mode').then((r) => r.json()).then((j) => {
      if (j.configured) setWxMode(j.configured);
    }).catch(() => {});
  }, []);
  const cycleWxMode = async () => {
    const next = wxMode === 'auto' ? 'live' : wxMode === 'live' ? 'simulated' : 'auto';
    const h = await authHeaders();
    let r: Response;
    try {
      r = await fetch('/api/weather/mode', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ mode: next }) });
    } catch {
      toast('Switch failed: backend unreachable (is npm run dev up?).', 'error');
      return;
    }
    if (r.ok) {
      const j = await r.json();
      setWxMode(j.configured);
      toast(`Telemetry source: ${j.configured.toUpperCase()} — applies on next dispatch.`, 'info');
    } else {
      let detail = '';
      try { detail = (await r.json()).error || ''; } catch { /* ignore */ }
      toast(`Switch failed (${r.status}): ${detail || 'unknown error'}.`, 'error');
    }
  };
  const totalWindCap = portfolio.windFarms.reduce((s, a) => s + a.capacityMw, 0);
  const totalClean = totalSolar + totalWind;
  const totalDemand = portfolio.grid.totalDemandMw;
  const totalFlexDemand = portfolio.consumers.reduce((s, c) => s + c.flexibleDemandMw, 0);

  const totalBessMw = portfolio.batteries.reduce((s, b) => s + b.powerRatingMw, 0);
  const totalBessMwh = portfolio.batteries.reduce((s, b) => s + b.capacityMwh, 0);
  const avgSoc = portfolio.batteries.length > 0
    ? portfolio.batteries.reduce((s, b) => s + b.currentSocPct, 0) / portfolio.batteries.length
    : 0;

  const totalIntertieLimit = portfolio.interties.reduce((sum, i) => sum + i.limitMw, 0);
  const netIntertie = portfolio.interties.reduce((sum, i) => sum + i.currentFlowMw, 0);

  return (
    <div className="space-y-6">
      {/* High-Density Top Metric KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Clean Generation */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Renewable Gen</span>
            <span className="text-em font-mono text-[11px]">{portfolio.solarFarms.length + portfolio.windFarms.length} Farms</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            {totalClean.toFixed(1)} <span className="text-xs font-normal text-muted">MW</span>
          </div>
          <div className="text-[11px] text-muted mt-1 flex items-center gap-1 font-mono">
            <span className="text-am">☀️ {totalSolar.toFixed(0)}</span>
            <span>·</span>
            <span className="text-cy">💨 {totalWind.toFixed(0)}</span>
          </div>
        </div>

        {/* Industrial Demand */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Portfolio Demand</span>
            <span className="text-muted font-mono text-[11px]">{portfolio.consumers.length} Plants</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            {totalDemand.toFixed(1)} <span className="text-xs font-normal text-muted">MW</span>
          </div>
          <div className="text-[11px] text-muted mt-1 font-mono">
            Flex Load: <span className="text-em font-medium">{totalFlexDemand.toFixed(1)} MW</span>
          </div>
        </div>

        {/* BESS Fleet Capacity & SOC */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>BESS Storage</span>
            <span className="text-cy font-mono text-[11px]">{totalBessMwh} MWh</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            {avgSoc.toFixed(1)}% <span className="text-xs font-normal text-muted">SOC</span>
          </div>
          <div className="text-[11px] text-muted mt-1 font-mono truncate">
            {portfolio.batteries.length > 0
              ? portfolio.batteries.map((b) => `${b.id}: ${b.currentSocPct.toFixed(0)}%`).join(' · ')
              : 'No storage units'}
          </div>
        </div>

        {/* Market Spot Price */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Market Spot Price</span>
            <span
              className={`font-mono text-[11px] uppercase ${
                portfolio.market.priceTrend === 'spiking'
                  ? 'text-ro'
                  : portfolio.market.priceTrend === 'negative'
                  ? 'text-pu'
                  : 'text-em'
              }`}
            >
              {portfolio.market.priceTrend}
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            ${portfolio.market.spotPriceUsdPerMwh.toFixed(2)} <span className="text-xs font-normal text-muted">/MWh</span>
          </div>
          <div className="text-[11px] text-muted mt-1 font-mono">
            Carbon: ${portfolio.market.carbonPriceUsdPerTon}/t
          </div>
        </div>

        {/* Grid Frequency */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Grid Frequency</span>
            <span
              className={`font-mono text-[11px] uppercase ${
                portfolio.grid.frequencyStatus === 'nominal'
                  ? 'text-em'
                  : portfolio.grid.frequencyStatus === 'warning'
                  ? 'text-am'
                  : 'text-ro'
              }`}
            >
              {portfolio.grid.frequencyStatus}
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            {portfolio.grid.frequencyHz.toFixed(2)} <span className="text-xs font-normal text-muted">Hz</span>
          </div>
          <div className="text-[11px] text-muted mt-1 font-mono">
            Inertia: {portfolio.grid.inertiaScore.toFixed(0)}/100
          </div>
        </div>

        {/* Net Transmission Flow */}
        <div className="bg-panel border border-line p-3 rounded-xl">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Net Intertie Flow</span>
            <span className="font-mono text-[11px] text-muted">2 Corridors</span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-paper mt-1">
            {netIntertie >= 0 ? `+${netIntertie.toFixed(1)}` : netIntertie.toFixed(1)}{' '}
            <span className="text-xs font-normal text-muted">MW</span>
          </div>
          <div className="text-[11px] text-muted mt-1 font-mono">
            {netIntertie >= 0 ? 'Exporting Surplus' : 'Importing Deficit'}
          </div>
        </div>
      </div>

      {/* Main Asset Matrix Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: 5 Solar Farms (200 MW) */}
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-am" />
              <h3 className="text-sm font-semibold text-paper">Solar Generation ({portfolio.solarFarms.length} Farms)</h3>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted">
              {totalSolar.toFixed(1)} / {totalSolarCap.toFixed(1)} MW
            </span>
          </div>

          <div className="divide-y divide-line/60 mt-2">
            {portfolio.solarFarms.map((farm) => {
              const utilPct = Math.round((farm.currentOutputMw / farm.capacityMw) * 100);
              return (
                <div key={farm.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-paper">{farm.name}</span>
                      {farm.status === 'curtailed' && (
                        <span className="text-[10px] text-am font-mono">CURTAILED</span>
                      )}
                    </div>
                    <div className="text-[11px] text-faint font-mono">
                      Capacity: {farm.capacityMw} MW · Tilt: {farm.tiltAngle}° · Deg: {farm.degradationPct}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold tabular-nums text-paper">
                      {farm.currentOutputMw.toFixed(1)} <span className="text-[10px] text-muted">MW</span>
                    </div>
                    <div className="text-[11px] text-muted font-mono">
                      15m: {farm.forecast15minMw.toFixed(1)} MW ({utilPct}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle Column: Wind Farms + Weather */}
        <div className="space-y-6">
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-cy" />
                <h3 className="text-sm font-semibold text-paper">Wind Generation ({portfolio.windFarms.length} Farms)</h3>
              </div>
              <span className="font-mono text-xs tabular-nums text-muted">
                {totalWind.toFixed(1)} / {totalWindCap.toFixed(1)} MW
              </span>
            </div>

            <div className="divide-y divide-line/60 mt-2">
              {portfolio.windFarms.map((farm) => {
                const utilPct = Math.round((farm.currentOutputMw / farm.capacityMw) * 100);
                return (
                  <div key={farm.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-paper">{farm.name}</span>
                        {farm.gustWarning && (
                          <span className="text-[10px] text-ro font-mono flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> GUST
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-faint font-mono">
                        Rated: {farm.capacityMw} MW · Wind: {farm.windSpeedMs.toFixed(1)} m/s
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold tabular-nums text-paper">
                        {farm.currentOutputMw.toFixed(1)} <span className="text-[10px] text-muted">MW</span>
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        15m: {farm.forecast15minMw.toFixed(1)} MW ({utilPct}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weather & Environmental Context Box */}
          <div className="bg-panel/60 border border-line rounded-xl p-3.5 text-xs">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="font-medium text-soft">Weather & Meso-Forecast</span>
              <span className="flex items-center gap-1.5">
                {weatherSource && (
                  <button
                    onClick={() => { if (perms.canOperate) cycleWxMode(); }}
                    disabled={!perms.canOperate}
                    title={perms.canOperate ? `Telemetry source: ${wxMode.toUpperCase()} (click: auto → live → simulated). Effective now: ${(weatherSource || '').toUpperCase()}` : 'Requires Operator role or above'}
                    className={`font-mono text-[10px] font-bold px-1.5 py-px rounded border disabled:cursor-not-allowed ${weatherSource === 'live' ? 'text-em border-emerald-500/40 bg-emerald-500/10' : 'text-faint border-linestrong bg-raise'}`}
                  >
                    ● {weatherSource === 'live' ? 'LIVE' : 'SIM'}{wxMode !== 'auto' ? ` (${wxMode})` : ''}
                  </button>
                )}
                <span className="font-mono uppercase text-muted text-[11px]">
                  {portfolio.weather.condition.replace('_', ' ')}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-page/60 border border-line">
                <div className="text-muted text-[10px]">Cloud Cover</div>
                <div className="font-mono font-semibold text-paper mt-0.5">{portfolio.weather.cloudCoverPct}%</div>
              </div>
              <div className="p-2 rounded bg-page/60 border border-line">
                <div className="text-muted text-[10px]">Avg Wind</div>
                <div className="font-mono font-semibold text-paper mt-0.5">{portfolio.weather.windSpeedMs} m/s</div>
              </div>
              <div className="p-2 rounded bg-page/60 border border-line">
                <div className="text-muted text-[10px]">Ambient Temp</div>
                <div className="font-mono font-semibold text-paper mt-0.5">{portfolio.weather.temperatureC}°C</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: BESS Batteries + Transmission Interties */}
        <div className="space-y-6">
          {/* BESS Batteries */}
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-em" />
                <h3 className="text-sm font-semibold text-paper">Battery Storage ({portfolio.batteries.length} BESS)</h3>
              </div>
              <span className="font-mono text-xs text-muted">{totalBessMw.toFixed(0)} MW / {totalBessMwh.toFixed(0)} MWh</span>
            </div>

            <div className="space-y-4 mt-3">
              {portfolio.batteries.map((bess) => {
                const actionForBess = actions.find((a) => a.assetId === bess.id);
                return (
                  <div key={bess.id} className="p-3 rounded-lg bg-page/70 border border-line/80">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-paper">{bess.name}</span>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                            bess.status === 'fault'
                              ? 'bg-rose-500/20 text-ro'
                              : 'bg-emerald-500/10 text-em'
                          }`}
                        >
                          {bess.status.toUpperCase()}
                        </span>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-paper">
                        {bess.currentSocPct.toFixed(1)}% SOC
                      </span>
                    </div>

                    {/* SOC Progress Bar with Floor Marker */}
                    <div className="mt-2 relative">
                      <div className="w-full h-2 bg-raise rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            bess.status === 'fault'
                              ? 'bg-rose-500'
                              : bess.currentSocPct <= bess.minSocPct
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${bess.currentSocPct}%` }}
                        />
                      </div>
                      {/* Emergency Reserve floor indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-400"
                        style={{ left: `${bess.minSocPct}%` }}
                        title={`Emergency reserve floor (${bess.minSocPct}%)`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted font-mono mt-2">
                      <span>Rate: ±{bess.powerRatingMw} MW</span>
                      <span>Cycles: {bess.cycleCount}</span>
                      <span>Temp: {bess.tempC}°C</span>
                    </div>

                    {actionForBess && (
                      <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between text-xs font-mono">
                        <span className="text-muted">Dispatch Order:</span>
                        <span className="text-cy font-medium">
                          {actionForBess.type === 'BATTERY_DISCHARGE' && `Discharge +${actionForBess.valueMw.toFixed(1)} MW`}
                          {actionForBess.type === 'BATTERY_CHARGE' && `Charge -${actionForBess.valueMw.toFixed(1)} MW`}
                          {actionForBess.type === 'BATTERY_HOLD' && 'Standby Reserve (0 MW)'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transmission Interties & Industrial Consumers Mini-Card */}
          <div className="bg-panel border border-line rounded-xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-pu" />
                <h3 className="text-sm font-semibold text-paper">Transmission Interties ({portfolio.interties.length} Lines)</h3>
              </div>
              <span className="font-mono text-xs text-muted">{totalIntertieLimit.toFixed(0)} MW Cap</span>
            </div>

            <div className="space-y-3 mt-3">
              {portfolio.interties.map((line) => {
                const loadPct = Math.round((Math.abs(line.currentFlowMw) / (line.limitMw || 1)) * 100);
                return (
                  <div key={line.id} className="text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-soft font-medium">{line.name}</span>
                      <span className="font-mono text-paper tabular-nums">
                        {line.currentFlowMw.toFixed(1)} / {line.limitMw} MW ({loadPct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-raise rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          line.congested || loadPct > 95
                            ? 'bg-rose-500'
                            : loadPct > 80
                            ? 'bg-amber-400'
                            : 'bg-purple-500'
                        }`}
                        style={{ width: `${Math.min(100, loadPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
