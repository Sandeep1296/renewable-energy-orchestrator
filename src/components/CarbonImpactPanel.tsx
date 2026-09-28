import React, { useState } from 'react';
import {
  Leaf,
  Trees,
  Car,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
} from 'lucide-react';
import { CarbonMetrics, ScenarioCandidate, PortfolioState } from '../types/orchestrator';

interface CarbonImpactPanelProps {
  readOnly?: boolean;
  carbonMetrics: CarbonMetrics;
  portfolio: PortfolioState;
  scenarios: ScenarioCandidate[];
  selectedScenario: ScenarioCandidate;
  onUpdateCarbonPrice?: (price: number) => void;
}

export const CarbonImpactPanel: React.FC<CarbonImpactPanelProps> = ({
  carbonMetrics,  readOnly = false,

  portfolio,
  scenarios,
  selectedScenario,
  onUpdateCarbonPrice,
}) => {
  const [testCarbonPrice, setTestCarbonPrice] = useState<number>(portfolio.market.carbonPriceUsdPerTon);

  const handlePriceChange = (newPrice: number) => {
    setTestCarbonPrice(newPrice);
    if (onUpdateCarbonPrice) {
      onUpdateCarbonPrice(newPrice);
    }
  };

  // Standard coal/gas regional grid benchmark
  const gridBenchmarkIntensity = 485; // gCO2/kWh
  const intensityReductionPct = Math.round(
    ((gridBenchmarkIntensity - carbonMetrics.carbonIntensityGramsPerKwh) / gridBenchmarkIntensity) * 100,
  );

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="contents">
        {readOnly && <div className="text-[11px] font-mono text-am/80 pb-2">Read-only for your role — carbon price edits require Operator or above.</div>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-em" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Carbon Impact & Environmental Emission Abatement
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Real-time tracking of avoided greenhouse gas emissions, delivered carbon intensity, and economic offset value.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-muted">Carbon Intensity:</span>
          <span className="text-em font-bold tabular-nums">
            {carbonMetrics.carbonIntensityGramsPerKwh} gCO₂/kWh
          </span>
          <span className="text-faintdeep">·</span>
          <span className="text-muted">Avoided:</span>
          <span className="text-em font-bold tabular-nums">
            +{carbonMetrics.emissionsAvoidedTons} tCO₂/15m
          </span>
        </div>
      </div>

      {/* 4 Carbon KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Delivered Carbon Intensity */}
        <div className="bg-page/70 border border-line p-3.5 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Delivered Intensity</span>
            <span className="text-em font-mono text-[11px]">-{intensityReductionPct}% vs Grid</span>
          </div>
          <div className="text-2xl font-bold font-mono text-paper tabular-nums">
            {carbonMetrics.carbonIntensityGramsPerKwh}
            <span className="text-xs font-normal text-muted ml-1">gCO₂/kWh</span>
          </div>
          <div className="w-full h-1.5 bg-raise rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(100, (carbonMetrics.carbonIntensityGramsPerKwh / gridBenchmarkIntensity) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-faint font-mono flex justify-between pt-1">
            <span>Clean 0g</span>
            <span>Benchmark {gridBenchmarkIntensity}g</span>
          </div>
        </div>

        {/* Avoided Emissions This Cycle */}
        <div className="bg-page/70 border border-line p-3.5 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Avoided This Cycle</span>
            <span className="text-em font-mono text-[11px]">15m Interval</span>
          </div>
          <div className="text-2xl font-bold font-mono text-em tabular-nums">
            +{carbonMetrics.emissionsAvoidedTons.toFixed(1)}
            <span className="text-xs font-normal text-muted ml-1">tCO₂</span>
          </div>
          <div className="text-[11px] text-muted font-mono pt-1">
            Incurred from imports: <span className="text-ro font-medium">{carbonMetrics.emissionsIncurredTons.toFixed(2)} t</span>
          </div>
        </div>

        {/* Cumulative Carbon Avoided */}
        <div className="bg-page/70 border border-line p-3.5 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Cumulative Displaced</span>
            <span className="text-cy font-mono text-[11px]">All Cycles</span>
          </div>
          <div className="text-2xl font-bold font-mono text-cy tabular-nums">
            {carbonMetrics.cumulativeCarbonAvoidedTons.toFixed(1)}
            <span className="text-xs font-normal text-muted ml-1">tCO₂</span>
          </div>
          <div className="text-[11px] text-muted font-mono pt-1">
            Clean Energy Share: <span className="text-em font-medium">{carbonMetrics.cleanEnergySharePct}%</span>
          </div>
        </div>

        {/* Carbon Economic Valuation */}
        <div className="bg-page/70 border border-line p-3.5 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Net Carbon Offset Value</span>
            <span className="text-am font-mono text-[11px]">${portfolio.market.carbonPriceUsdPerTon}/t</span>
          </div>
          <div className="text-2xl font-bold font-mono text-em tabular-nums">
            +${carbonMetrics.netCarbonEconomicImpactUsd.toFixed(0)}
            <span className="text-xs font-normal text-muted ml-1">/15m</span>
          </div>
          <div className="text-[11px] text-muted font-mono pt-1">
            Offset: +${carbonMetrics.carbonOffsetValueUsd} · Tax: -${carbonMetrics.carbonTaxPaidUsd}
          </div>
        </div>
      </div>

      {/* Real-World Equivalencies Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-lg bg-page/80 border border-line/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-em shrink-0">
            <Trees className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted">Sequestration Equivalency</div>
            <div className="text-base font-bold font-mono text-paper tabular-nums">
              {carbonMetrics.equivalentTreesPlanted.toLocaleString()}{' '}
              <span className="text-xs font-normal text-muted">Urban Trees Planted & Growing for 10 Yrs</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-page/80 border border-line/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cy shrink-0">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted">Displaced Transportation Equivalency</div>
            <div className="text-base font-bold font-mono text-paper tabular-nums">
              {carbonMetrics.equivalentCarMilesAvoided.toLocaleString()}{' '}
              <span className="text-xs font-normal text-muted">Miles of Gasoline Passenger Vehicle Travel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Carbon Price Sensitivity Stress Test */}
      <div className="p-4 rounded-xl bg-page/80 border border-line space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-am" />
            <span className="text-xs font-semibold text-paper">
              Carbon Tax Sensitivity & Economic Merit-Order Simulator
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-am tabular-nums">
            ${testCarbonPrice.toFixed(2)} / ton CO₂
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="200"
          step="5"
          value={testCarbonPrice}
          onChange={(e) => handlePriceChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-amber-500"
        />

        <div className="flex items-center justify-between text-[11px] text-muted font-mono">
          <span>$0/t (No Carbon Policy)</span>
          <span>$45/t (Current Baseline)</span>
          <span>$120/t (EU ETS Peak)</span>
          <span>$200/t (Deep Decarbonization)</span>
        </div>

        <div className="text-xs text-muted bg-panel/60 p-2.5 rounded border border-line/60 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-cy shrink-0 mt-0.5" />
          <span>
            At ${testCarbonPrice.toFixed(0)}/t, imported grid electricity incurs an additional penalty of{' '}
            <strong className="text-paper font-mono">${(0.42 * testCarbonPrice).toFixed(2)}/MWh</strong>. This strongly disincentivizes fossil imports and elevates the ranking of Renewable Charging & Demand Response strategies.
          </span>
        </div>
      </div>
      </fieldset>
    </div>
  );
};
