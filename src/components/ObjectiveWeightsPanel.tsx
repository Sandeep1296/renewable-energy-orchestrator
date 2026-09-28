import React from 'react';
import { Sliders, CheckCircle2, RotateCcw, Info } from 'lucide-react';
import { ObjectiveWeights, PresetName } from '../types/orchestrator';
import { objectivePresets } from '../data/initialPortfolio';

interface ObjectiveWeightsPanelProps {
  readOnly?: boolean;
  weights: ObjectiveWeights;
  onUpdateWeights: (newWeights: ObjectiveWeights) => void;
  activePreset: PresetName | null;
  setActivePreset: (preset: PresetName | null) => void;
}

export const ObjectiveWeightsPanel: React.FC<ObjectiveWeightsPanelProps> = ({
  weights,  readOnly = false,

  onUpdateWeights,
  activePreset,
  setActivePreset,
}) => {
  const totalWeight =
    weights.minimizeCost +
    weights.minimizeEmissions +
    weights.minimizeCurtailment +
    weights.minimizeBatteryDegradation +
    weights.maximizeReliability +
    weights.maximizeRenewableUtilization +
    weights.maximizeArbitrageProfit || 1;

  const handleSliderChange = (key: keyof ObjectiveWeights, value: number) => {
    setActivePreset(null);
    onUpdateWeights({
      ...weights,
      [key]: value,
    });
  };

  const applyPreset = (presetKey: PresetName) => {
    setActivePreset(presetKey);
    onUpdateWeights({ ...objectivePresets[presetKey].weights });
  };

  const getPercent = (val: number) => Math.round((val / totalWeight) * 100);

  return (
    <div className="bg-panel/90 border border-line rounded-xl p-4 sm:p-5">
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="contents">
        {readOnly && <div className="text-[11px] font-mono text-am/80 pb-2">Read-only for your role — weight tuning requires Operator or above.</div>}

      {/* Header and Presets Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-em" />
            <h2 className="text-sm font-semibold text-paper tracking-tight">
              Multi-Objective Optimization Weights
            </h2>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Tuning weights re-evaluates multi-attribute utility curves and Pareto rankings in real-time.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(objectivePresets) as PresetName[]).map((key) => {
            const preset = objectivePresets[key];
            const isSelected = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-500/20 text-em border border-emerald-500/40 shadow-sm'
                    : 'bg-raise/80 text-soft border border-linestrong/60 hover:bg-raise hover:text-paper'
                }`}
                title={preset.description}
              >
                {preset.label.split(' ')[0]} {preset.label.split(' ')[1]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders Grid: 4 Minimization Objectives + 3 Maximization Objectives */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-4">
        {/* Left Column: Minimization Objectives */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-xs text-muted uppercase tracking-wider font-semibold">
            <span>Minimization Goals (Cost & Stress)</span>
            <span className="font-mono text-em">Target Low</span>
          </div>

          {/* Minimize Cost */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Electricity Cost</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.minimizeCost)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.minimizeCost}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.minimizeCost}
              onChange={(e) => handleSliderChange('minimizeCost', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Minimize Carbon Emissions */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Carbon Emissions (tCO₂)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.minimizeEmissions)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.minimizeEmissions}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.minimizeEmissions}
              onChange={(e) => handleSliderChange('minimizeEmissions', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Minimize Renewable Curtailment */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Renewable Curtailment</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.minimizeCurtailment)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.minimizeCurtailment}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.minimizeCurtailment}
              onChange={(e) => handleSliderChange('minimizeCurtailment', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Minimize Battery Degradation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Battery Degradation (Cycle Wear)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.minimizeBatteryDegradation)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.minimizeBatteryDegradation}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.minimizeBatteryDegradation}
              onChange={(e) => handleSliderChange('minimizeBatteryDegradation', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        {/* Right Column: Maximization Objectives */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-xs text-muted uppercase tracking-wider font-semibold">
            <span>Maximization Goals (Performance & Value)</span>
            <span className="font-mono text-cy">Target High</span>
          </div>

          {/* Maximize Grid Reliability */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Grid Reliability & Stability</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.maximizeReliability)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.maximizeReliability}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.maximizeReliability}
              onChange={(e) => handleSliderChange('maximizeReliability', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Maximize Renewable Utilization */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Clean Energy Utilization %</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.maximizeRenewableUtilization)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.maximizeRenewableUtilization}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.maximizeRenewableUtilization}
              onChange={(e) => handleSliderChange('maximizeRenewableUtilization', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>

          {/* Maximize Market Arbitrage Profit */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-paper font-medium">Market Arbitrage & Profit ($)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted text-[11px]">{getPercent(weights.maximizeArbitrageProfit)}%</span>
                <span className="font-mono tabular-nums text-paper w-8 text-right font-medium">{weights.maximizeArbitrageProfit}</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={weights.maximizeArbitrageProfit}
              onChange={(e) => handleSliderChange('maximizeArbitrageProfit', parseInt(e.target.value))}
              className="w-full h-1.5 bg-raise rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Active Trade-Off Hint */}
          <div className="p-2.5 rounded bg-page/60 border border-line text-[11px] text-muted flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-cy shrink-0 mt-0.5" />
            <span>
              {activePreset ? (
                <span>Profile <strong>{objectivePresets[activePreset].label}</strong>: {objectivePresets[activePreset].description}</span>
              ) : (
                <span>Custom objective mix active. Scenario rank updates dynamically based on current weights.</span>
              )}
            </span>
          </div>
        </div>
      </div>
      </fieldset>
    </div>
  );
};
