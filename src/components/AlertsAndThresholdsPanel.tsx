import React, { useState } from 'react';
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  Sparkles,
  Check,
  Info,
  Zap,
  RotateCcw,
} from 'lucide-react';
import { ActiveAlert, AlertThresholds, PortfolioState } from '../types/orchestrator';
import { defaultAlertThresholds } from '../services/alertEvaluator';

interface AlertsAndThresholdsPanelProps {
  readOnly?: boolean;
  alerts: ActiveAlert[];
  thresholds: AlertThresholds;
  onUpdateThresholds: (thresholds: AlertThresholds) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onAutoMitigateAlert: (alert: ActiveAlert) => void;
  portfolio: PortfolioState;
}

export const AlertsAndThresholdsPanel: React.FC<AlertsAndThresholdsPanelProps> = ({
  alerts,  readOnly = false,

  thresholds,
  onUpdateThresholds,
  onAcknowledgeAlert,
  onAutoMitigateAlert,
  portfolio,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'critical' | 'warning' | 'info'>('ALL');
  const [activeTab, setActiveTab] = useState<'feed' | 'thresholds'>('feed');

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length;
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.acknowledged).length;

  const filteredAlerts = alerts.filter(
    (a) => filterSeverity === 'ALL' || a.severity === filterSeverity,
  );

  const handleSliderChange = (key: keyof AlertThresholds, value: number) => {
    onUpdateThresholds({
      ...thresholds,
      [key]: value,
    });
  };

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="contents">
        {readOnly && <div className="text-[11px] font-mono text-am/80 pb-2">Read-only for your role — threshold edits and alert actions require Operator or above.</div>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-am" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Operational Alert Center & Configurable Thresholds
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Continuous boundary checking across grid frequency, thermal limits, line flows, and market volatility.
          </p>
        </div>

        {/* View Toggle: Alert Feed vs Threshold Controls */}
        <div className="flex items-center gap-1 bg-page p-1 rounded-lg border border-line text-xs">
          <button
            onClick={() => setActiveTab('feed')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
              activeTab === 'feed'
                ? 'bg-raise text-paper shadow-sm'
                : 'text-muted hover:text-paper'
            }`}
          >
            <span>Active Alerts</span>
            {unacknowledgedAlerts.length > 0 && (
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  criticalCount > 0
                    ? 'bg-rose-500 text-onaccent'
                    : 'bg-amber-500 text-slate-950'
                }`}
              >
                {unacknowledgedAlerts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 font-medium ${
              activeTab === 'thresholds'
                ? 'bg-raise text-paper shadow-sm'
                : 'text-muted hover:text-paper'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configure Thresholds</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Live Alert Feed */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {/* Severity Filter Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setFilterSeverity('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filterSeverity === 'ALL'
                    ? 'bg-raise text-paper'
                    : 'text-muted hover:text-paper'
                }`}
              >
                All ({alerts.length})
              </button>
              <button
                onClick={() => setFilterSeverity('critical')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  filterSeverity === 'critical'
                    ? 'bg-rose-500/20 text-ro border border-rose-500/30'
                    : 'text-muted hover:text-ro'
                }`}
              >
                Critical ({alerts.filter((a) => a.severity === 'critical').length})
              </button>
              <button
                onClick={() => setFilterSeverity('warning')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  filterSeverity === 'warning'
                    ? 'bg-amber-500/20 text-am border border-amber-500/30'
                    : 'text-muted hover:text-am'
                }`}
              >
                Warning ({alerts.filter((a) => a.severity === 'warning').length})
              </button>
              <button
                onClick={() => setFilterSeverity('info')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                  filterSeverity === 'info'
                    ? 'bg-cyan-500/20 text-cy border border-cyan-500/30'
                    : 'text-muted hover:text-cy'
                }`}
              >
                Info ({alerts.filter((a) => a.severity === 'info').length})
              </button>
            </div>

            <div className="text-xs text-muted font-mono">
              Status:{' '}
              {criticalCount > 0 ? (
                <span className="text-ro font-bold uppercase">Critical Alarm Active</span>
              ) : warningCount > 0 ? (
                <span className="text-am font-bold uppercase">Cautionary Band</span>
              ) : (
                <span className="text-em font-bold uppercase">All Parameters Nominal</span>
              )}
            </div>
          </div>

          {/* Alert Cards List */}
          {filteredAlerts.length === 0 ? (
            <div className="p-8 text-center bg-page/60 rounded-xl border border-line space-y-2">
              <CheckCircle2 className="w-8 h-8 text-em mx-auto" />
              <div className="text-sm font-semibold text-paper">Zero Active Violations</div>
              <p className="text-xs text-muted max-w-md mx-auto">
                All generation, frequency, thermal, and market metrics are operating strictly within safe threshold envelopes.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAlerts.map((alert) => {
                const isCrit = alert.severity === 'critical';
                const isWarn = alert.severity === 'warning';

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-lg border transition-all space-y-2 ${
                      alert.acknowledged
                        ? 'bg-page/40 border-line/60 opacity-60'
                        : isCrit
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : isWarn
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-cyan-950/20 border-cyan-500/40'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isCrit
                              ? 'bg-rose-500 text-onaccent'
                              : isWarn
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-cyan-500 text-slate-950'
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <span className="font-semibold text-paper">{alert.title}</span>
                        <span className="text-[11px] text-faint font-mono">[{alert.category}]</span>
                        {alert.hysteresisHeld && (
                          <span title="Condition hovers near the threshold — held to avoid flapping" className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-raise text-muted border border-linestrong">HELD</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-muted">
                          Val: <strong className="text-paper">{alert.value}</strong>
                        </span>
                        <span className="text-faint">·</span>
                        <span className="text-muted">
                          Limit: <strong className="text-am">{alert.threshold}</strong>
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-soft leading-relaxed">{alert.message}</p>

                    {/* Agentic Mitigation Recommendation */}
                    <div className="p-2.5 rounded bg-page/80 border border-line text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-1.5 text-soft">
                        <Sparkles className="w-3.5 h-3.5 text-cy shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-cy font-mono text-[11px]">
                            Agent Playbook Mitigation:
                          </span>{' '}
                          <span className="text-soft text-[11px]">{alert.suggestedMitigation}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onAutoMitigateAlert(alert)}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-onaccent transition-colors flex items-center gap-1 shadow-xs whitespace-nowrap"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Auto-Mitigate</span>
                        </button>

                        {!alert.acknowledged && (
                          <button
                            onClick={() => onAcknowledgeAlert(alert.id)}
                            className="px-2 py-1 text-[11px] font-medium text-muted hover:text-paper rounded hover:bg-raise transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Configurable Threshold Sliders */}
      {activeTab === 'thresholds' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-line text-xs text-muted">
            <span>Adjust boundary limits to tune orchestrator sensitivity.</span>
            <button
              onClick={() => onUpdateThresholds(defaultAlertThresholds)}
              className="text-xs text-cy hover:text-cy flex items-center gap-1 font-mono"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs">
            {/* Frequency Warning Band */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Grid Frequency Warning Deadband</span>
                <span className="font-mono text-am">±{thresholds.frequencyWarningDeltaHz.toFixed(2)} Hz</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.20"
                step="0.01"
                value={thresholds.frequencyWarningDeltaHz}
                onChange={(e) => handleSliderChange('frequencyWarningDeltaHz', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>Strict (±0.02 Hz)</span>
                <span>Normal (±0.08 Hz)</span>
                <span>Wide (±0.20 Hz)</span>
              </div>
            </div>

            {/* Frequency Emergency Limit */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Grid Frequency Emergency Trip Limit</span>
                <span className="font-mono text-ro">±{thresholds.frequencyEmergencyDeltaHz.toFixed(2)} Hz</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.40"
                step="0.01"
                value={thresholds.frequencyEmergencyDeltaHz}
                onChange={(e) => handleSliderChange('frequencyEmergencyDeltaHz', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-rose-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>±0.10 Hz</span>
                <span>IEEE-1547 (±0.22 Hz)</span>
                <span>±0.40 Hz</span>
              </div>
            </div>

            {/* Spot Price Spike Alert */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Wholesale Price Spike Alarm</span>
                <span className="font-mono text-am">${thresholds.priceSpikeThresholdUsd.toFixed(0)}/MWh</span>
              </div>
              <input
                type="range"
                min="60"
                max="300"
                step="5"
                value={thresholds.priceSpikeThresholdUsd}
                onChange={(e) => handleSliderChange('priceSpikeThresholdUsd', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>$60/MWh</span>
                <span>$120/MWh (Standard)</span>
                <span>$300/MWh</span>
              </div>
            </div>

            {/* Transmission Congestion Ceiling */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Transmission Intertie Congestion Alert</span>
                <span className="font-mono text-am">{thresholds.lineCongestionThresholdPct}% Capacity</span>
              </div>
              <input
                type="range"
                min="70"
                max="98"
                step="1"
                value={thresholds.lineCongestionThresholdPct}
                onChange={(e) => handleSliderChange('lineCongestionThresholdPct', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>70% (Conservative)</span>
                <span>90% (Standard)</span>
                <span>98% (Thermal Edge)</span>
              </div>
            </div>

            {/* Battery Temperature Warning */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">BESS Cell Temperature Derating Alert</span>
                <span className="font-mono text-am">{thresholds.batteryTempWarningC}°C</span>
              </div>
              <input
                type="range"
                min="30"
                max="45"
                step="1"
                value={thresholds.batteryTempWarningC}
                onChange={(e) => handleSliderChange('batteryTempWarningC', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>30°C</span>
                <span>38°C (Recommended)</span>
                <span>45°C</span>
              </div>
            </div>

            {/* Battery Minimum SOC Floor Warning */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">BESS Low SOC Floor Alert</span>
                <span className="font-mono text-cy">{thresholds.batteryMinSocFloorWarningPct}% SOC</span>
              </div>
              <input
                type="range"
                min="12"
                max="30"
                step="1"
                value={thresholds.batteryMinSocFloorWarningPct}
                onChange={(e) => handleSliderChange('batteryMinSocFloorWarningPct', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>12% (Hardware Floor)</span>
                <span>18% (Warning)</span>
                <span>30% (High Reserve)</span>
              </div>
            </div>

            {/* Solar Fleet Collapse Alert */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Solar Fleet Collapse (cloud ramp)</span>
                <span className="font-mono text-am">fires below {(100 - thresholds.solarRampDropPct).toFixed(0)}% of nameplate</span>
              </div>
              <input
                type="range"
                min="20"
                max="70"
                step="5"
                value={thresholds.solarRampDropPct}
                onChange={(e) => handleSliderChange('solarRampDropPct', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>20% drop</span>
                <span>45% drop</span>
                <span>70% drop</span>
              </div>
            </div>

            {/* Supply Deficit Alert */}
            <div className="space-y-1.5 p-3 rounded-lg bg-page/60 border border-line">
              <div className="flex justify-between font-medium">
                <span className="text-paper">Supply Deficit (demand {'>'} clean gen)</span>
                <span className="font-mono text-am">fires above {thresholds.demandDeficitMw} MW shortfall</span>
              </div>
              <input
                type="range"
                min="10"
                max="150"
                step="10"
                value={thresholds.demandDeficitMw}
                onChange={(e) => handleSliderChange('demandDeficitMw', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[10px] text-faint flex justify-between font-mono">
                <span>10 MW</span>
                <span>50 MW</span>
                <span>150 MW</span>
              </div>
            </div>
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
};
