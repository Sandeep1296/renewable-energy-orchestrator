// Shared physics-based scenario builders + multi-objective scoring.
// Used by the backend supervisor so the LLM reasons over grounded numbers it cannot invent.
export interface Candidate {
  id: string; name: string; strategyKicker: string; description: string;
  batteryDispatchMw: Record<string, number>;
  curtailmentMw: { solar: number; wind: number };
  demandResponseCurtailMw: Record<string, number>;
  gridNetImportMw: number;
  projectedCostUsd: number; projectedRevenueUsd: number; netEconomicImpactUsd: number;
  projectedEmissionsTons: number; curtailmentMwh: number;
  batteryDegradationScore: number; reliabilityScore: number; renewableUtilizationPct: number;
  compositeUtilityScore: number; rank: number; isViable: boolean;
  excluded?: boolean;
  assumedCleanGenMw?: number;
  assumedDemandMw?: number;
  scores: Record<string, { raw: number; weighted: number }>;
}

export function buildCandidates(portfolio: any, cleanGen: number, demand: number, weights: any, disabledIds: string[] = []): Candidate[] {
  const batteries: any[] = portfolio.batteries || [];
  const deficit = demand - cleanGen;
  const price = portfolio.market?.spotPriceUsdPerMwh ?? 48.5;
  const bal: Record<string, number> = {};
  const agg: Record<string, number> = {};
  const chg: Record<string, number> = {};
  const hold: Record<string, number> = {};
  const drb: Record<string, number> = {};
  batteries.forEach((b) => {
    hold[b.id] = 0;
    if (b.status === 'fault' || b.status === 'maintenance') { bal[b.id] = 0; agg[b.id] = 0; chg[b.id] = 0; drb[b.id] = 0; }
    else {
      const pMax = b.powerRatingMw || 40;
      agg[b.id] = Math.round(pMax * 0.85);
      chg[b.id] = -Math.round(pMax * 0.8);
      bal[b.id] = deficit > 0
        ? Math.round(Math.min(deficit / Math.max(1, batteries.length), pMax * 0.6))
        : -Math.round(Math.min(-deficit / Math.max(1, batteries.length), pMax * 0.6));
      drb[b.id] = deficit > 0 ? Math.round(pMax * 0.25) : 0;
    }
  });
  const drMap: Record<string, number> = {};
  let drTotal = 0;
  (portfolio.consumers || []).forEach((c: any) => {
    const shed = Math.round((c.flexibleDemandMw || 10) * 0.75);
    drMap[c.id] = shed; drTotal += shed;
  });
  const list: Candidate[] = [
    { id: 'BALANCED_APPROACH', name: 'Balanced Dynamic Portfolio Optimization', strategyKicker: 'Agentic Multi-Objective Equilibrium', description: 'Balances local renewables and dual-BESS storage for optimal cost, carbon, stability.', batteryDispatchMw: bal, curtailmentMw: { solar: 0, wind: 0 }, demandResponseCurtailMw: {}, gridNetImportMw: Math.max(-150, Math.min(150, deficit * 0.2)), projectedCostUsd: Math.max(0, deficit * 0.2 * price * 0.25), projectedRevenueUsd: Math.max(0, -deficit * 0.2 * price * 0.25), netEconomicImpactUsd: 0, projectedEmissionsTons: Math.max(0, deficit * 0.2 * 0.42 * 0.25), curtailmentMwh: 0, batteryDegradationScore: 84, reliabilityScore: 95, renewableUtilizationPct: 100, compositeUtilityScore: 0, rank: 0, isViable: true, scores: {} },
    { id: 'AGGRESSIVE_DISCHARGE', name: 'Aggressive Battery Discharge & Arbitrage', strategyKicker: 'Max Market Power & Deficit Relief', description: 'Peak-rate BESS discharge to capture price spikes.', batteryDispatchMw: agg, curtailmentMw: { solar: 0, wind: 0 }, demandResponseCurtailMw: {}, gridNetImportMw: -75, projectedCostUsd: 0, projectedRevenueUsd: 75 * price * 0.25, netEconomicImpactUsd: 0, projectedEmissionsTons: 0, curtailmentMwh: 0, batteryDegradationScore: 48, reliabilityScore: 88, renewableUtilizationPct: 100, compositeUtilityScore: 0, rank: 0, isViable: true, scores: {} },
    { id: 'DEMAND_RESPONSE', name: 'Industrial Demand Response & Peak Shaving', strategyKicker: 'Load Flexibility & Grid Stress Relief', description: 'Shed flexible industrial load to relieve grid stress.', batteryDispatchMw: drb, curtailmentMw: { solar: 0, wind: 0 }, demandResponseCurtailMw: drMap, gridNetImportMw: 0, projectedCostUsd: drTotal * (portfolio.market?.drIncentiveUsdPerMwh || 85) * 0.25, projectedRevenueUsd: 0, netEconomicImpactUsd: 0, projectedEmissionsTons: 0, curtailmentMwh: 0, batteryDegradationScore: 92, reliabilityScore: 97, renewableUtilizationPct: 100, compositeUtilityScore: 0, rank: 0, isViable: true, scores: {} },
    { id: 'RENEWABLE_CHARGE_AND_EXPORT', name: 'Renewable Storage Absorption & Max Clean Export', strategyKicker: 'Zero Curtailment & Clean Energy Maximization', description: 'Absorb surplus into BESS, export remainder.', batteryDispatchMw: chg, curtailmentMw: { solar: 0, wind: 0 }, demandResponseCurtailMw: {}, gridNetImportMw: -50, projectedCostUsd: 0, projectedRevenueUsd: 50 * price * 0.25, netEconomicImpactUsd: 0, projectedEmissionsTons: 0, curtailmentMwh: 0, batteryDegradationScore: 72, reliabilityScore: 91, renewableUtilizationPct: 100, compositeUtilityScore: 0, rank: 0, isViable: true, scores: {} },
    { id: 'CONSERVATIVE_HOLD', name: 'Conservative Reserve Hold & Asset Preservation', strategyKicker: 'Zero Battery Wear & High Emergency Buffer', description: 'Hold reserves, eliminate degradation.', batteryDispatchMw: hold, curtailmentMw: { solar: 0, wind: 0 }, demandResponseCurtailMw: {}, gridNetImportMw: Math.max(0, deficit), projectedCostUsd: Math.max(0, deficit * price * 0.25), projectedRevenueUsd: 0, netEconomicImpactUsd: 0, projectedEmissionsTons: Math.max(0, deficit * 0.42 * 0.25), curtailmentMwh: 0, batteryDegradationScore: 99, reliabilityScore: 79, renewableUtilizationPct: 100, compositeUtilityScore: 0, rank: 0, isViable: true, scores: {} },
  ];
  list.forEach((c) => {
    closeEnergy(c, {
      cleanGen, demand,
      maxExport: (portfolio.interties || []).reduce((s: number, i: any) => s + (i.limitMw || 0), 0),
      price: portfolio.market?.spotPriceUsdPerMwh ?? 48.5,
      carbon: portfolio.market?.carbonPriceUsdPerTon ?? 45,
      drIncentive: portfolio.market?.drIncentiveUsdPerMwh ?? 85,
    });
  });
  list.forEach((c) => { c.netEconomicImpactUsd = Math.round(c.projectedRevenueUsd - c.projectedCostUsd); score(c, weights, portfolio); });
  list.forEach((c) => { c.assumedCleanGenMw = Math.round(cleanGen * 10) / 10; c.assumedDemandMw = Math.round(demand * 10) / 10; });
  const disabled = new Set(disabledIds);
  list.forEach((c) => { c.excluded = disabled.has(c.id); });
  const enabled = list.filter((c) => !c.excluded);
  if (enabled.length === 0) throw new Error('At least one strategy must stay enabled.');
  enabled.sort((a, b) => b.compositeUtilityScore - a.compositeUtilityScore);
  enabled.forEach((c, i) => { c.rank = i + 1; });
  list.filter((c) => c.excluded).forEach((c) => { c.rank = 0; });
  list.sort((a, b) => (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || b.compositeUtilityScore - a.compositeUtilityScore);
  return list;
}

/**
 * First-law closure: every candidate must account for all energy — surplus is
 * exported (up to SOL) then curtailed, deficit is imported. Recomputes the
 * economics consistently so grounding validation passes on exact residuals.
 */
function closeEnergy(
  c: Candidate,
  ctx: { cleanGen: number; demand: number; maxExport: number; price: number; carbon: number; drIncentive: number },
) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const battSum: number = Object.values(c.batteryDispatchMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const drShed: number = Object.values(c.demandResponseCurtailMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const effectiveDemand = ctx.demand - drShed;
  const net = ctx.cleanGen + battSum - effectiveDemand; // >0 surplus, <0 deficit

  let imp = 0;
  let exp = 0;
  let curt = 0;
  if (net >= 0) {
    exp = r1(Math.min(net, ctx.maxExport));
    curt = r1(Math.max(0, net - exp));
  } else {
    imp = r1(-net);
  }
  const price = Math.max(0, ctx.price);
  const energyCost = imp * price * 0.25 + imp * ctx.carbon * 0.42 * 0.25;
  const drCost = drShed * ctx.drIncentive * 0.25;
  c.gridNetImportMw = r1(imp - exp);
  c.curtailmentMw = { solar: 0, wind: curt };
  c.curtailmentMwh = r2(curt * 0.25);
  c.projectedCostUsd = r2(energyCost + drCost);
  c.projectedRevenueUsd = r2(exp * price * 0.25);
  c.projectedEmissionsTons = r2(imp * 0.42 * 0.25);
  c.renewableUtilizationPct = ctx.cleanGen > 0
    ? Math.round(((ctx.cleanGen - curt) / ctx.cleanGen) * 1000) / 10
    : 100;
}

function score(c: Candidate, w: any, state: any) {
  const costScore = Math.max(0, Math.min(100, 50 + c.netEconomicImpactUsd / 200));
  const emissionsScore = Math.max(0, Math.min(100, 100 - c.projectedEmissionsTons * 8));
  const curtailScore = Math.max(0, Math.min(100, 100 - c.curtailmentMwh * 5));
  let rel = c.reliabilityScore;
  if (state.grid?.frequencyStatus === 'emergency') rel = Math.max(30, rel - 10);
  const arb = Math.max(0, Math.min(100, c.projectedRevenueUsd > 0 ? 50 + c.projectedRevenueUsd / 100 : 30));
  const total = (w.minimizeCost + w.minimizeEmissions + (w.minimizeCurtailment ?? 50) + w.minimizeBatteryDegradation + w.maximizeReliability + w.maximizeRenewableUtilization + (w.maximizeArbitrageProfit ?? 50)) || 1;
  const comp = (costScore * w.minimizeCost + emissionsScore * w.minimizeEmissions + curtailScore * (w.minimizeCurtailment ?? 50) + c.batteryDegradationScore * w.minimizeBatteryDegradation + rel * w.maximizeReliability + c.renewableUtilizationPct * w.maximizeRenewableUtilization + arb * (w.maximizeArbitrageProfit ?? 50)) / total;
  c.scores = {
    cost: { raw: costScore, weighted: (costScore * w.minimizeCost) / total },
    emissions: { raw: emissionsScore, weighted: (emissionsScore * w.minimizeEmissions) / total },
    reliability: { raw: rel, weighted: (rel * w.maximizeReliability) / total },
    renewableUtilization: { raw: c.renewableUtilizationPct, weighted: (c.renewableUtilizationPct * w.maximizeRenewableUtilization) / total },
  };
  c.compositeUtilityScore = Math.round(comp * 10) / 10;
}

export function buildActions(scenario: Candidate, portfolio: any) {
  const actions: any[] = [];
  (portfolio.batteries || []).forEach((b: any) => {
    const mw = scenario.batteryDispatchMw[b.id] || 0;
    if (b.status === 'fault') actions.push({ assetId: b.id, assetName: b.name || b.id, type: 'BATTERY_HOLD', valueMw: 0, detail: 'Locked out — fault isolation. Maintain separation.', precondition: 'Fault clearance required' });
    else if (mw > 0) actions.push({ assetId: b.id, assetName: b.name || b.id, type: 'BATTERY_DISCHARGE', valueMw: mw, detail: `Discharge ${mw.toFixed(1)} MW into collector bus`, precondition: `SOC > ${b.minSocPct}%` });
    else if (mw < 0) actions.push({ assetId: b.id, assetName: b.name || b.id, type: 'BATTERY_CHARGE', valueMw: Math.abs(mw), detail: `Charge ${Math.abs(mw).toFixed(1)} MW from clean surplus`, precondition: `SOC < ${b.maxSocPct}%` });
  });
  if (scenario.gridNetImportMw < 0) actions.push({ assetId: 'INTERTIE-GRID', assetName: 'Regional Transmission Interties', type: 'GRID_EXPORT', valueMw: Math.abs(scenario.gridNetImportMw), detail: `Export ${Math.abs(scenario.gridNetImportMw).toFixed(1)} MW clean surplus`, precondition: 'Line loading < 100% SOL' });
  else if (scenario.gridNetImportMw > 0) actions.push({ assetId: 'INTERTIE-GRID', assetName: 'Regional Transmission Interties', type: 'GRID_IMPORT', valueMw: scenario.gridNetImportMw, detail: `Import ${scenario.gridNetImportMw.toFixed(1)} MW to cover residual gap`, precondition: 'Firm transmission available' });
  Object.entries(scenario.demandResponseCurtailMw || {}).forEach(([id, mw]) => {
    if ((mw as number) > 0) actions.push({ assetId: id, assetName: id, type: 'DEMAND_RESPONSE_TRIGGER', valueMw: mw, detail: `Curtail ${(mw as number).toFixed(1)} MW flexible load`, precondition: 'Advance notification confirmed' });
  });
  return actions;
}
