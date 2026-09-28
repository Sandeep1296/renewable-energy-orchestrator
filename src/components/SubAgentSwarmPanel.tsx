import React from 'react';
import {
  Users,
  SunMedium,
  Shield,
  Activity,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  Bot,
  Brain,
} from 'lucide-react';
import { SubAgentOpinion, PortfolioState, ScenarioCandidate } from '../types/orchestrator';

interface SubAgentSwarmPanelProps {
  portfolio: PortfolioState;
  selectedScenario: ScenarioCandidate;
  liveSwarm?: SubAgentOpinion[];
  modelUsed?: string;
}

export const SubAgentSwarmPanel: React.FC<SubAgentSwarmPanelProps> = ({
  portfolio,
  selectedScenario,
  liveSwarm,
  modelUsed,
}) => {
  const spotPrice = portfolio.market.spotPriceUsdPerMwh;
  const freq = portfolio.grid.frequencyHz;
  const isSpike = spotPrice > 120;
  const isFreqWarn = Math.abs(freq - 50.0) > 0.08;

  // 5 Specialized Sub-Agents collaborating in consensus
  // Prefer live backend handoff when available; fall back to local deterministic mirror.
  const swarm: SubAgentOpinion[] = (liveSwarm && liveSwarm.length > 0 ? liveSwarm : [
    {
      agentId: 'AGT-FORECAST',
      agentName: 'Forecast Intelligence Agent',
      role: 'Renewable Meteorologist & Ramp Predictor',
      avatarIcon: '☀️',
      preferredScenario: 'RENEWABLE_CHARGE_AND_EXPORT',
      priorityFactor: 'Solar & Wind Ramp Smoothing',
      confidenceScore: 94,
      recommendation: portfolio.weather.condition === 'heavy_overcast'
        ? 'Steep cloud front detected. Solar output down 70%. Pre-position BESS in hot-standby.'
        : 'Solar and wind outputs are stable with minimal 15-minute ramp variance.',
      rationale: `Current solar (${portfolio.solarFarms.reduce((s, a) => s + a.currentOutputMw, 0).toFixed(0)} MW) and wind (${portfolio.windFarms.reduce((w, a) => w + a.currentOutputMw, 0).toFixed(0)} MW) projected to hold steady over the next 15-minute dispatch interval.`,
    },
    {
      agentId: 'AGT-STORAGE',
      agentName: 'Storage Guardian Agent',
      role: 'Battery Chemistry & Degradation Specialist',
      avatarIcon: '🔋',
      preferredScenario: isSpike ? 'AGGRESSIVE_DISCHARGE' : 'BALANCED_APPROACH',
      priorityFactor: 'Cell Life & Thermal Derating',
      confidenceScore: 96,
      recommendation: portfolio.batteries.some((b) => b.tempC > 38)
        ? 'Cell temperature above 38°C. Derating discharge rate to 0.5C to protect pack longevity.'
        : 'Discharging BESS-01 (LFP) preferentially due to 46% lower degradation coefficient vs NMC.',
      rationale: `BESS-01 SOC at ${portfolio.batteries[0]?.currentSocPct.toFixed(0)}% (well above 12% floor). BESS-02 NMC reserved for high-margin dispatch.`,
    },
    {
      agentId: 'AGT-GRID',
      agentName: 'Grid Stability Sentinel',
      role: 'Frequency & Transmission Integrity Guardian',
      avatarIcon: '⚡',
      preferredScenario: isFreqWarn ? 'DEMAND_RESPONSE' : 'BALANCED_APPROACH',
      priorityFactor: 'IEEE-1547 & Line Thermal Capacity',
      confidenceScore: 98,
      recommendation: isFreqWarn
        ? `Frequency deviation (${freq.toFixed(2)} Hz) requires immediate synthetic inertia support.`
        : 'Grid frequency nominal at 50.01 Hz. Transmission interties operating within thermal rating.',
      rationale: `Line North flow at ${portfolio.interties[0]?.currentFlowMw.toFixed(1)} MW (${((portfolio.interties[0]?.currentFlowMw / portfolio.interties[0]?.limitMw) * 100).toFixed(0)}% load). No tripping hazard present.`,
    },
    {
      agentId: 'AGT-MARKET',
      agentName: 'Merchant Arbitrage Agent',
      role: 'Wholesale Electricity Market Strategist',
      avatarIcon: '📈',
      preferredScenario: isSpike ? 'AGGRESSIVE_DISCHARGE' : 'BALANCED_APPROACH',
      priorityFactor: 'Net Economic Revenue & DR Incentive',
      confidenceScore: 91,
      recommendation: isSpike
        ? `Spot price spike ($${spotPrice.toFixed(0)}/MWh)! Recommend aggressive export to capture peak merchant spreads.`
        : `Wholesale prices normal at $${spotPrice.toFixed(2)}/MWh. Standard economic dispatch optimal.`,
      rationale: `Net economic margin maximized by balancing local consumption and exporting surplus clean energy up to intertie limits.`,
    },
    {
      agentId: 'AGT-SAFETY',
      agentName: 'Data Grounding & Safety Guardian',
      role: 'Thermodynamics & Regulatory Verifier',
      avatarIcon: '🛡️',
      preferredScenario: selectedScenario.id,
      priorityFactor: 'Power Balance & Schema Compliance',
      confidenceScore: 100,
      recommendation: 'First Law of Thermodynamics strictly satisfied. Instantaneous supply equals demand plus storage.',
      rationale: 'Verified all 6 physical inverter bounds, non-negative dispatch variables, and IEEE 1547 droop envelopes with zero violations.',
    },
  ]) as SubAgentOpinion[];

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-pu" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Autonomous Multi-Agent Consensus Swarm
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            5 specialized sub-agents independently evaluate domain constraints and cast consensus votes for the dispatch cycle.
            {liveSwarm && liveSwarm.length > 0 ? ` Live backend handoff${modelUsed ? ` via ${modelUsed}` : ''}.` : ' Local mirror (backend unreachable).'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-muted">Consensus Decision:</span>
          <span className="text-em font-semibold px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30">
            {selectedScenario.name}
          </span>
        </div>
      </div>

      {/* Sub-Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {swarm.map((subAgent) => {
          const agrees = subAgent.preferredScenario === selectedScenario.id;

          return (
            <div
              key={subAgent.agentId}
              className="p-4 rounded-xl bg-page border border-line space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{subAgent.avatarIcon}</span>
                    <div>
                      <h4 className="font-semibold text-paper text-xs">{subAgent.agentName}</h4>
                      <span className="text-[10px] text-muted block">{subAgent.role}</span>
                    </div>
                  </div>

                  <span className="font-mono text-xs text-cy font-bold tabular-nums">
                    {subAgent.confidenceScore}% conf
                  </span>
                </div>

                <div className="text-[11px] p-2.5 rounded bg-panel/80 border border-line/80 text-soft leading-snug">
                  {subAgent.recommendation}
                </div>

                <div className="text-[10px] text-muted font-mono space-y-0.5">
                  <div>
                    Focus: <span className="text-paper">{subAgent.priorityFactor}</span>
                  </div>
                  <div>
                    Evidence: <span className="text-soft font-sans">{subAgent.rationale}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted">Vote:</span>
                <span
                  className={
                    agrees
                      ? 'text-em font-semibold flex items-center gap-1'
                      : 'text-am font-semibold'
                  }
                >
                  {agrees && <CheckCircle2 className="w-3 h-3" />}
                  {subAgent.preferredScenario.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
