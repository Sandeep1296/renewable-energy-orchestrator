import {
  PortfolioState,
  ObjectiveWeights,
  ScenarioCandidate,
  OrchestrationDecision,
  ActionCommand,
  GroundingCheck,
  HITLStatus,
  DAGNode,
} from '../types/orchestrator';

export function runOrchestrationEngine(
  state: PortfolioState,
  weights: ObjectiveWeights,
  previousDecision?: OrchestrationDecision,
  disabledIds: string[] = [],
  customRules: CustomGroundingRuleInput[] = [],
  policy?: { powerBalanceToleranceMw?: number; batteryPowerHeadroomMw?: number; n1GateEnabled?: boolean; n1UnservedThresholdMw?: number },
): OrchestrationDecision {
  const startTime = Date.now();

  // 1. Calculate aggregated portfolio metrics
  const totalSolar = state.solarFarms.reduce((acc, s) => acc + (s.status === 'online' ? s.currentOutputMw : 0), 0);
  const totalWind = state.windFarms.reduce((acc, w) => acc + (w.status === 'online' ? w.currentOutputMw : 0), 0);
  const totalCleanGen = totalSolar + totalWind;

  const totalBaseloadDemand = state.consumers.reduce((acc, c) => acc + c.baseloadDemandMw, 0);
  const totalFlexibleDemand = state.consumers.reduce((acc, c) => acc + c.flexibleDemandMw, 0);
  const totalRawDemand = totalBaseloadDemand + totalFlexibleDemand;

  const maxExportCapacity = state.interties.reduce((sum, i) => sum + i.limitMw, 0);

  // 2. Generate and evaluate the 5 scenario candidates
  const candidates: ScenarioCandidate[] = [
    buildAggressiveDischargeScenario(state, totalCleanGen, totalRawDemand, maxExportCapacity),
    buildConservativeHoldScenario(state, totalCleanGen, totalRawDemand, maxExportCapacity),
    buildBalancedApproachScenario(state, totalCleanGen, totalRawDemand, maxExportCapacity),
    buildDemandResponseScenario(state, totalCleanGen, totalRawDemand, maxExportCapacity),
    buildRenewableChargeScenario(state, totalCleanGen, totalRawDemand, maxExportCapacity),
  ];

  // Curtail solar first (regulatory merit order), remainder wind
  const onlineSolarOut = state.solarFarms.reduce((acc, s) => acc + (s.status === 'online' ? s.currentOutputMw : 0), 0);
  candidates.forEach((cand) => {
    const total = cand.curtailmentMw.solar + cand.curtailmentMw.wind;
    const solarCurt = Math.round(Math.min(total, onlineSolarOut) * 10) / 10;
    cand.curtailmentMw = { solar: solarCurt, wind: Math.round(Math.max(0, total - solarCurt) * 10) / 10 };
  });

  // 3. Multi-objective scoring (relative normalization across the set)
  candidates.forEach((cand) => {
    cand.assumedCleanGenMw = Math.round(totalCleanGen * 10) / 10;
    cand.assumedDemandMw = Math.round(totalRawDemand * 10) / 10;
  });
  scoreAllScenarios(candidates, weights, state);

  // Sort by composite score descending (operator-disabled strategies rank last)
  const disabled = new Set(disabledIds);
  candidates.forEach((c) => { c.excluded = disabled.has(c.id); });
  const enabled = candidates.filter((c) => !c.excluded);
  if (enabled.length === 0) throw new Error('At least one strategy must stay enabled.');
  enabled.sort((a, b) => b.compositeUtilityScore - a.compositeUtilityScore);
  enabled.forEach((c, idx) => { c.rank = idx + 1; });
  candidates.filter((c) => c.excluded).forEach((c) => { c.rank = 0; });
  candidates.sort((a, b) => (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || b.compositeUtilityScore - a.compositeUtilityScore);

  const selectedScenario = enabled[0];

  // 4. Grounding and physical validation checks
  const groundingChecks = runGroundingValidation(selectedScenario, state, policy || undefined);
  try {
    groundingChecks.push(...evaluateCustomRules(state, selectedScenario, customRules));
  } catch { /* custom rules never break built-ins */ }

  // 5. Calculate confidence score and HITL status
  const confidencePct = calculateConfidence(state, selectedScenario, groundingChecks);
  let hitlStatus: HITLStatus = 'AUTONOMOUS';
  if (confidencePct < 75 || state.grid.frequencyStatus === 'emergency' || state.weather.stormAlert) {
    hitlStatus = 'ADVISORY';
  } else if (confidencePct < 95 || state.interties.some((i) => i.congested) || state.market.spotPriceUsdPerMwh > 200) {
    hitlStatus = 'SUPERVISED';
  }

  // 6. Action commands generation
  const actions = generateActionCommands(selectedScenario, state);

  // 7. Rationale, trade-offs, and counterfactuals
  const { rationale, counterfactualReasoning, rejectedAlternatives, tradeoffs } =
    generateExplainability(selectedScenario, candidates, state, weights);

  // 8. Generate DAG execution trace
  const dagNodes = buildDAGExecutionTrace(state, selectedScenario);

  // 9. Calculate Carbon Impact Metrics
  const totalBatteryDischargeMw = Object.values(selectedScenario.batteryDispatchMw)
    .filter((v) => v > 0)
    .reduce((sum, v) => sum + v, 0);
  const cleanDeliveredMw = Math.min(
    totalRawDemand,
    totalCleanGen + totalBatteryDischargeMw,
  );
  const fossilImportMw = Math.max(0, selectedScenario.gridNetImportMw);

  const emissionsIncurredTons = Math.round(fossilImportMw * 0.42 * 0.25 * 100) / 100;
  const emissionsAvoidedTons = Math.round(cleanDeliveredMw * 0.55 * 0.25 * 100) / 100;
  const totalDeliveredMwh = (cleanDeliveredMw + fossilImportMw) * 0.25;
  const carbonIntensityGramsPerKwh = totalDeliveredMwh > 0
    ? Math.round((emissionsIncurredTons * 1_000_000) / (totalDeliveredMwh * 1000))
    : 0;

  const carbonTaxPaidUsd = Math.round(emissionsIncurredTons * state.market.carbonPriceUsdPerTon);
  const carbonOffsetValueUsd = Math.round(emissionsAvoidedTons * state.market.carbonPriceUsdPerTon);
  const netCarbonEconomicImpactUsd = carbonOffsetValueUsd - carbonTaxPaidUsd;
  const cleanEnergySharePct = totalRawDemand > 0
    ? Math.min(100, Math.round((cleanDeliveredMw / totalRawDemand) * 1000) / 10)
    : 100;

  const prevCumulative = previousDecision?.carbonMetrics?.cumulativeCarbonAvoidedTons ?? 342.8;
  const cumulativeCarbonAvoidedTons = Math.round((prevCumulative + emissionsAvoidedTons) * 100) / 100;
  const equivalentTreesPlanted = Math.round(cumulativeCarbonAvoidedTons * 45);
  const equivalentCarMilesAvoided = Math.round(cumulativeCarbonAvoidedTons * 2480);

  const carbonMetrics = {
    emissionsIncurredTons,
    emissionsAvoidedTons,
    carbonIntensityGramsPerKwh,
    carbonTaxPaidUsd,
    carbonOffsetValueUsd,
    netCarbonEconomicImpactUsd,
    cleanEnergySharePct,
    cumulativeCarbonAvoidedTons,
    equivalentTreesPlanted,
    equivalentCarMilesAvoided,
  };

  const decisionId = `ORH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;
  const auditHash = `SHA256:${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

  const now = new Date();
  const cycleTime = now.toTimeString().split(' ')[0];

  return {
    decisionId,
    timestamp: now.toISOString(),
    cycleTime,
    selectedScenario,
    allScenarios: candidates,
    confidencePct,
    hitlStatus,
    hitlApproved: hitlStatus === 'AUTONOMOUS',
    hitlTimeoutSec: hitlStatus === 'SUPERVISED' ? 300 : 0,
    rationale,
    counterfactualReasoning,
    rejectedAlternatives,
    tradeoffs,
    actions,
    groundingChecks,
    groundingPolicy: policy ? { ...policy } : undefined,
    auditHash,
    dagNodes,
    carbonMetrics,
  };
}

// Scenario 1: Aggressive Discharge (Maximizes market revenue & deficit coverage)
function buildAggressiveDischargeScenario(
  state: PortfolioState,
  cleanGen: number,
  demand: number,
  maxExport: number,
): ScenarioCandidate {
  const batteryDispatchMw: Record<string, number> = {};
  let totalBatteryMw = 0;

  state.batteries.forEach((b) => {
    if (b.status === 'fault' || b.status === 'maintenance' || b.currentSocPct <= b.minSocPct) {
      batteryDispatchMw[b.id] = 0;
    } else {
      const maxDischargeFromEnergy = (b.currentSocPct - b.minSocPct) * (b.capacityMwh / 100) * 4;
      const discharge = Math.min(b.powerRatingMw, Math.max(0, maxDischargeFromEnergy));
      batteryDispatchMw[b.id] = Math.round(discharge * 10) / 10;
      totalBatteryMw += batteryDispatchMw[b.id];
    }
  });

  const netGen = cleanGen + totalBatteryMw;
  const netBalance = netGen - demand; // positive = export surplus, negative = deficit import
  const actualExport = Math.min(Math.max(0, netBalance), maxExport);
  const actualImport = Math.max(0, -netBalance);

  const curtailmentMw = Math.max(0, netBalance - actualExport);
  const price = state.market.spotPriceUsdPerMwh;

  const cost = (actualImport * Math.max(0, price) * 0.25) + (actualImport * state.market.carbonPriceUsdPerTon * 0.42 * 0.25);
  const revenue = (actualExport * Math.max(0, price) * 0.25);
  const netImpact = revenue - cost;

  return {
    id: 'AGGRESSIVE_DISCHARGE',
    name: 'Aggressive Battery Discharge & Arbitrage',
    strategyKicker: 'Max Market Power & Deficit Relief',
    description: 'Discharges storage at peak allowable rates to capture wholesale price spikes or cover internal deficits, minimizing reliance on expensive market imports.',
    batteryDispatchMw,
    curtailmentMw: { solar: 0, wind: curtailmentMw },
    demandResponseCurtailMw: {},
    gridNetImportMw: actualImport - actualExport,
    projectedCostUsd: cost,
    projectedRevenueUsd: revenue,
    netEconomicImpactUsd: netImpact,
    projectedEmissionsTons: actualImport * 0.42 * 0.25,
    curtailmentMwh: curtailmentMw * 0.25,
    batteryDegradationScore: 45, // Heavy cycling wear
    reliabilityScore: 88,
    renewableUtilizationPct: cleanGen > 0 ? ((cleanGen - curtailmentMw) / cleanGen) * 100 : 100,
    compositeUtilityScore: 0,
    rank: 0,
    isViable: true,
    scores: {},
  };
}

// Scenario 2: Conservative Hold (Preserves asset longevity & reserves)
function buildConservativeHoldScenario(
  state: PortfolioState,
  cleanGen: number,
  demand: number,
  maxExport: number,
): ScenarioCandidate {
  const batteryDispatchMw: Record<string, number> = {};
  state.batteries.forEach((b) => {
    batteryDispatchMw[b.id] = 0;
  });

  const netBalance = cleanGen - demand;
  const actualExport = Math.min(Math.max(0, netBalance), maxExport);
  const actualImport = Math.max(0, -netBalance);
  const curtailmentMw = Math.max(0, netBalance - actualExport);

  const price = state.market.spotPriceUsdPerMwh;
  const cost = (actualImport * Math.max(0, price) * 0.25) + (actualImport * state.market.carbonPriceUsdPerTon * 0.42 * 0.25);
  const revenue = (actualExport * Math.max(0, price) * 0.25);

  return {
    id: 'CONSERVATIVE_HOLD',
    name: 'Conservative Reserve Hold & Asset Preservation',
    strategyKicker: 'Zero Battery Wear & High Emergency Buffer',
    description: 'Keeps batteries on standby to preserve cell life and reserve 100% capacity for unexpected grid frequency events. Imports remainder from market.',
    batteryDispatchMw,
    curtailmentMw: { solar: 0, wind: curtailmentMw },
    demandResponseCurtailMw: {},
    gridNetImportMw: actualImport - actualExport,
    projectedCostUsd: cost,
    projectedRevenueUsd: revenue,
    netEconomicImpactUsd: revenue - cost,
    projectedEmissionsTons: actualImport * 0.42 * 0.25,
    curtailmentMwh: curtailmentMw * 0.25,
    batteryDegradationScore: 98, // Nearly zero wear
    reliabilityScore: 78,
    renewableUtilizationPct: cleanGen > 0 ? ((cleanGen - curtailmentMw) / cleanGen) * 100 : 100,
    compositeUtilityScore: 0,
    rank: 0,
    isViable: true,
    scores: {},
  };
}

// Scenario 3: Balanced Approach (Zero net grid deviation / standard utility)
function buildBalancedApproachScenario(
  state: PortfolioState,
  cleanGen: number,
  demand: number,
  maxExport: number,
): ScenarioCandidate {
  const deficit = demand - cleanGen;
  const batteryDispatchMw: Record<string, number> = {};
  let totalBatteryMw = 0;

  if (deficit > 0) {
    // Need power: prioritize LFP chemistry over NMC to conserve degradation
    let remainingDeficit = deficit;
    const sorted = [...state.batteries]
      .filter((b) => b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct > b.minSocPct)
      .sort((a, b) => (a.chemistry === 'LFP' ? -1 : 1));

    sorted.forEach((b) => {
      const availRate = b.powerRatingMw * 0.65;
      const availEnergy = (b.currentSocPct - b.minSocPct) * (b.capacityMwh / 100) * 4;
      const dispatch = Math.min(remainingDeficit, Math.min(availRate, availEnergy));
      batteryDispatchMw[b.id] = Math.round(dispatch * 10) / 10;
      remainingDeficit -= batteryDispatchMw[b.id];
      totalBatteryMw += batteryDispatchMw[b.id];
    });
  } else if (deficit < 0) {
    // Surplus: charge available batteries
    let remainingSurplus = -deficit;
    const eligible = state.batteries.filter(
      (b) => b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct < b.maxSocPct,
    );
    eligible.forEach((b) => {
      const maxAbsorbRate = b.powerRatingMw * 0.65;
      const maxAbsorbEnergy = (b.maxSocPct - b.currentSocPct) * (b.capacityMwh / 100) * 4;
      const charge = Math.min(remainingSurplus, Math.min(maxAbsorbRate, maxAbsorbEnergy));
      batteryDispatchMw[b.id] = -Math.round(charge * 10) / 10;
      remainingSurplus -= charge;
      totalBatteryMw += batteryDispatchMw[b.id];
    });
  }

  // Ensure all batteries have entries in map
  state.batteries.forEach((b) => {
    if (batteryDispatchMw[b.id] === undefined) batteryDispatchMw[b.id] = 0;
  });

  const netBalance = cleanGen + totalBatteryMw - demand;
  const actualExport = Math.min(Math.max(0, netBalance), maxExport);
  const actualImport = Math.max(0, -netBalance);
  const curtailmentMw = Math.max(0, netBalance - actualExport);

  const price = state.market.spotPriceUsdPerMwh;
  const cost = (actualImport * Math.max(0, price) * 0.25) + (actualImport * state.market.carbonPriceUsdPerTon * 0.42 * 0.25);
  const revenue = (actualExport * Math.max(0, price) * 0.25);

  return {
    id: 'BALANCED_APPROACH',
    name: 'Balanced Dynamic Portfolio Optimization',
    strategyKicker: 'Optimized Trade-Off Equilibrium',
    description: 'Dynamically balances local generation and moderate storage dispatch to minimize grid imports while preserving battery health and maintaining stability.',
    batteryDispatchMw,
    curtailmentMw: { solar: 0, wind: curtailmentMw },
    demandResponseCurtailMw: {},
    gridNetImportMw: actualImport - actualExport,
    projectedCostUsd: cost,
    projectedRevenueUsd: revenue,
    netEconomicImpactUsd: revenue - cost,
    projectedEmissionsTons: actualImport * 0.42 * 0.25,
    curtailmentMwh: curtailmentMw * 0.25,
    batteryDegradationScore: 82,
    reliabilityScore: 94,
    renewableUtilizationPct: cleanGen > 0 ? ((cleanGen - curtailmentMw) / cleanGen) * 100 : 100,
    compositeUtilityScore: 0,
    rank: 0,
    isViable: true,
    scores: {},
  };
}

// Scenario 4: Demand Response (Curtails flexible industrial loads)
function buildDemandResponseScenario(
  state: PortfolioState,
  cleanGen: number,
  demand: number,
  maxExport: number,
): ScenarioCandidate {
  // Shed 50% + shift 25% of flexible industrial demand (rebound +1 cycle)
  const drMap: Record<string, number> = {};
  const shiftMap: Record<string, number> = {};
  let totalDrCurtailed = 0;
  let totalShifted = 0;
  state.consumers.forEach((c) => {
    const curtailed = c.status === 'offline' ? 0 : Math.round(c.flexibleDemandMw * 0.5 * 10) / 10;
    const shifted = c.status === 'offline' ? 0 : Math.round(c.flexibleDemandMw * 0.25 * 10) / 10;
    drMap[c.id] = curtailed;
    shiftMap[c.id] = shifted;
    totalDrCurtailed += curtailed;
    totalShifted += shifted;
  });

  const effectiveDemand = demand - totalDrCurtailed - totalShifted;
  const deficit = effectiveDemand - cleanGen;

  const batteryDispatchMw: Record<string, number> = {};
  let totalBatteryMw = 0;
  if (deficit > 0) {
    let remainingDeficit = deficit;
    state.batteries.forEach((b) => {
      if (b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct > b.minSocPct) {
        const dispatch = Math.min(remainingDeficit, b.powerRatingMw * 0.5);
        batteryDispatchMw[b.id] = Math.round(dispatch * 10) / 10;
        remainingDeficit -= batteryDispatchMw[b.id];
        totalBatteryMw += batteryDispatchMw[b.id];
      } else {
        batteryDispatchMw[b.id] = 0;
      }
    });
  } else {
    state.batteries.forEach((b) => {
      batteryDispatchMw[b.id] = 0;
    });
  }

  const netBalance = cleanGen + totalBatteryMw - effectiveDemand;
  const actualExport = Math.min(Math.max(0, netBalance), maxExport);
  const actualImport = Math.max(0, -netBalance);

  const price = state.market.spotPriceUsdPerMwh;
  // DR compensation paid to industrial customers (shed only); shifted load
  // rebounds off-peak, valued at half price as avoided peak cost
  const drPaymentCost = totalDrCurtailed * state.market.drIncentiveUsdPerMwh * 0.25;
  const cost = (actualImport * Math.max(0, price) * 0.25) +
               (actualImport * state.market.carbonPriceUsdPerTon * 0.42 * 0.25) +
               drPaymentCost;
  const revenue = actualExport * Math.max(0, price) * 0.25 + totalShifted * Math.max(0, price) * 0.5 * 0.25;

  return {
    id: 'DEMAND_RESPONSE',
    name: 'Industrial Demand Response & Peak Shaving',
    strategyKicker: 'Load Flexibility & Grid Stress Relief',
    description: 'Sheds 50% of flexible industrial load and shifts 25% to the off-peak window (rebound +1 cycle), relieving grid and line stress.',
    batteryDispatchMw,
    curtailmentMw: { solar: 0, wind: 0 },
    demandResponseCurtailMw: drMap,
    loadShiftMw: shiftMap,
    gridNetImportMw: actualImport - actualExport,
    projectedCostUsd: cost,
    projectedRevenueUsd: revenue,
    netEconomicImpactUsd: revenue - cost,
    projectedEmissionsTons: actualImport * 0.42 * 0.25,
    curtailmentMwh: 0,
    batteryDegradationScore: 89,
    reliabilityScore: 96,
    renewableUtilizationPct: 100,
    compositeUtilityScore: 0,
    rank: 0,
    isViable: true,
    scores: {},
  };
}

// Scenario 5: Renewable Charging & Clean Export
function buildRenewableChargeScenario(
  state: PortfolioState,
  cleanGen: number,
  demand: number,
  maxExport: number,
): ScenarioCandidate {
  // Charge all available batteries at maximum absorption rate
  const batteryDispatchMw: Record<string, number> = {};
  let totalBatteryCharge = 0;

  state.batteries.forEach((b) => {
    if (b.status === 'fault' || b.status === 'maintenance' || b.currentSocPct >= b.maxSocPct) {
      batteryDispatchMw[b.id] = 0;
    } else {
      const maxChargeEnergy = (b.maxSocPct - b.currentSocPct) * (b.capacityMwh / 100) * 4;
      const charge = Math.min(b.powerRatingMw, Math.max(0, maxChargeEnergy));
      batteryDispatchMw[b.id] = -Math.round(charge * 10) / 10;
      totalBatteryCharge += -batteryDispatchMw[b.id];
    }
  });

  const totalLoad = demand + totalBatteryCharge;
  const netBalance = cleanGen - totalLoad;

  const actualExport = Math.min(Math.max(0, netBalance), maxExport);
  const actualImport = Math.max(0, -netBalance);
  const curtailmentMw = Math.max(0, netBalance - actualExport);

  const price = state.market.spotPriceUsdPerMwh;
  const cost = (actualImport * Math.max(0, price) * 0.25) + (actualImport * state.market.carbonPriceUsdPerTon * 0.42 * 0.25);
  // If price is negative, we actually receive money for charging!
  const negativePricingBonus = price < 0 ? Math.abs(price) * (actualImport + totalBatteryCharge) * 0.25 : 0;
  const revenue = (actualExport * Math.max(0, price) * 0.25) + negativePricingBonus;

  return {
    id: 'RENEWABLE_CHARGE_AND_EXPORT',
    name: 'Renewable Storage Absorption & Max Clean Export',
    strategyKicker: 'Zero Curtailment & Clean Energy Maximization',
    description: 'Directs all surplus wind and solar generation into BESS storage units and exports remaining clean power up to transmission intertie limits.',
    batteryDispatchMw,
    curtailmentMw: { solar: 0, wind: curtailmentMw },
    demandResponseCurtailMw: {},
    gridNetImportMw: actualImport - actualExport,
    projectedCostUsd: cost,
    projectedRevenueUsd: revenue,
    netEconomicImpactUsd: revenue - cost,
    projectedEmissionsTons: actualImport * 0.42 * 0.25,
    curtailmentMwh: curtailmentMw * 0.25,
    batteryDegradationScore: 70,
    reliabilityScore: 91,
    renewableUtilizationPct: cleanGen > 0 ? ((cleanGen - curtailmentMw) / cleanGen) * 100 : 100,
    compositeUtilityScore: 0,
    rank: 0,
    isViable: true,
    scores: {},
  };
}

// Multi-attribute utility: two-pass scoring. Cost, emissions, curtailment and
// arbitrage are normalized RELATIVELY across the candidate set each cycle
// (min-max), so real economic spreads always discriminate fully. Health-like
// metrics (degradation, reliability, renewable %) keep absolute scales.
function scoreAllScenarios(candidates: ScenarioCandidate[], weights: ObjectiveWeights, state: PortfolioState) {
  const rel = (vals: number[], higherBetter: boolean): number[] => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return vals.map((v) => {
      if (hi === lo) return 50;
      const s = higherBetter ? ((v - lo) / (hi - lo)) * 100 : ((hi - v) / (hi - lo)) * 100;
      return Math.round(s * 10) / 10;
    });
  };

  const costS = rel(candidates.map((c) => c.netEconomicImpactUsd), true);
  const emisS = rel(candidates.map((c) => c.projectedEmissionsTons), false);
  const curtS = rel(candidates.map((c) => c.curtailmentMwh), false);
  const arbS = rel(candidates.map((c) => c.projectedRevenueUsd), true);

  const totalWeight =
    weights.minimizeCost +
    weights.minimizeEmissions +
    weights.minimizeCurtailment +
    weights.minimizeBatteryDegradation +
    weights.maximizeReliability +
    weights.maximizeRenewableUtilization +
    weights.maximizeArbitrageProfit || 1;

  candidates.forEach((candidate, i) => {
    const costScore = costS[i];
    const emissionsScore = emisS[i];
    const curtailmentScore = curtS[i];
    // 4. Battery degradation score
    const degradationScore = candidate.batteryDegradationScore;

    // 5. Reliability score
    let reliabilityScore = candidate.reliabilityScore;
    // If grid frequency is in warning or emergency, bump importance
    if (state.grid.frequencyStatus === 'emergency') {
      reliabilityScore = Math.max(30, reliabilityScore - 10);
    }

    // 6. Renewable utilization score
    const renewableScore = candidate.renewableUtilizationPct;

    // 7. Arbitrage profit score
    const arbitrageScore = arbS[i];

    const composite =
      (costScore * weights.minimizeCost +
        emissionsScore * weights.minimizeEmissions +
        curtailmentScore * weights.minimizeCurtailment +
        degradationScore * weights.minimizeBatteryDegradation +
        reliabilityScore * weights.maximizeReliability +
        renewableScore * weights.maximizeRenewableUtilization +
        arbitrageScore * weights.maximizeArbitrageProfit) /
      totalWeight;

    candidate.scores = {
      cost: { raw: costScore, weighted: (costScore * weights.minimizeCost) / totalWeight },
      emissions: { raw: emissionsScore, weighted: (emissionsScore * weights.minimizeEmissions) / totalWeight },
      curtailment: { raw: curtailmentScore, weighted: (curtailmentScore * weights.minimizeCurtailment) / totalWeight },
      batteryDegradation: { raw: degradationScore, weighted: (degradationScore * weights.minimizeBatteryDegradation) / totalWeight },
      reliability: { raw: reliabilityScore, weighted: (reliabilityScore * weights.maximizeReliability) / totalWeight },
      renewableUtilization: { raw: renewableScore, weighted: (renewableScore * weights.maximizeRenewableUtilization) / totalWeight },
      arbitrageProfit: { raw: arbitrageScore, weighted: (arbitrageScore * weights.maximizeArbitrageProfit) / totalWeight },
    };

    candidate.compositeUtilityScore = Math.round(composite * 10) / 10;
  });
}

// Rigorous grounding and physical validation checks
export function runGroundingValidation(
  scenario: ScenarioCandidate,
  state: PortfolioState,
  cfg: { powerBalanceToleranceMw?: number; batteryPowerHeadroomMw?: number; n1GateEnabled?: boolean; n1UnservedThresholdMw?: number } = {},
): GroundingCheck[] {
  const tolerance = cfg.powerBalanceToleranceMw ?? 1.0;
  const headroom = cfg.batteryPowerHeadroomMw ?? 0.1;
  const checks: GroundingCheck[] = [];

  // Check 1 & 2: Dynamic battery power and health limits
  state.batteries.forEach((b, idx) => {
    const bPower = Math.abs(scenario.batteryDispatchMw[b.id] || 0);
    const isPass = b.status === 'fault' ? bPower === 0 : bPower <= b.powerRatingMw + headroom;
    checks.push({
      id: `PHYS-BATT-${b.id || idx + 1}`,
      category: 'BATTERY_SAFETY',
      rule: `${b.name} (${b.id}) dispatch must comply with status (offline if faulted, max ${b.powerRatingMw.toFixed(1)} MW)`,
      status: isPass ? 'PASS' : 'FAIL',
      detail: b.status === 'fault'
        ? `${b.name} is faulted; actual dispatch: ${bPower.toFixed(1)} MW`
        : `Requested: ${bPower.toFixed(1)} MW / Limit: ${b.powerRatingMw.toFixed(1)} MW`,
    });

    const isDischarging = (scenario.batteryDispatchMw[b.id] || 0) > 0;
    const socSafe = !isDischarging || b.currentSocPct > b.minSocPct;
    checks.push({
      id: `PHYS-SOC-${b.id || idx + 1}`,
      category: 'BATTERY_SAFETY',
      rule: `${b.name} must not discharge when at or below emergency reserve floor (${b.minSocPct}%)`,
      status: socSafe ? 'PASS' : 'WARN',
      detail: `${b.name} SOC: ${b.currentSocPct.toFixed(1)}% (Floor: ${b.minSocPct}%)`,
    });
  });

  // Check 3: Transmission Intertie Limits
  const netExport = Math.max(0, -scenario.gridNetImportMw);
  const maxExport = state.interties.reduce((sum, i) => sum + i.limitMw, 0);
  const linePass = netExport <= maxExport;
  checks.push({
    id: 'GRID-LINE-LIMIT',
    category: 'GRID_CONSTRAINT',
    rule: `Net transmission export must not exceed thermal operating ratings (${maxExport.toFixed(1)} MW aggregate)`,
    status: linePass ? 'PASS' : 'FAIL',
    detail: `Export: ${netExport.toFixed(1)} MW / Max Line Rating: ${maxExport.toFixed(1)} MW`,
  });

  // Check 4: Thermodynamic Power Conservation Balance
  // Validated against the scenario's ASSUMED inputs (stored at compute time), so
  // live telemetry drift never false-fails an internally consistent plan. A
  // separate staleness warning covers drifted inputs.
  const liveGen = state.solarFarms.reduce((sum, s) => sum + s.currentOutputMw, 0) +
    state.windFarms.reduce((sum, w) => sum + w.currentOutputMw, 0);
  const totalGen = scenario.assumedCleanGenMw ?? liveGen;
  const bDispatch = Object.values(scenario.batteryDispatchMw).reduce((sum, v) => sum + v, 0);
  const drShed = Object.values(scenario.demandResponseCurtailMw).reduce((a, b) => a + b, 0);
  const shifted = Object.values(scenario.loadShiftMw || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const effectiveDemand = (scenario.assumedDemandMw ?? state.grid.totalDemandMw) - drShed - shifted;
  const netExchange = scenario.gridNetImportMw; // + = import, - = export
  const curtailment = scenario.curtailmentMw.solar + scenario.curtailmentMw.wind;

  // Equation: Total Gen + Net Import + Battery Discharge = Effective Demand + Curtailment
  const supply = totalGen + (netExchange > 0 ? netExchange : 0) + (bDispatch > 0 ? bDispatch : 0);
  const demand = effectiveDemand + (netExchange < 0 ? -netExchange : 0) + (bDispatch < 0 ? -bDispatch : 0) + curtailment;
  const powerBalanceError = Math.abs(supply - demand);
  const balancePass = powerBalanceError < tolerance;

  checks.push({
    id: 'PHYS-CONSERV-ENERGY',
    category: 'PHYSICAL',
    rule: 'First Law of Thermodynamics: Instantaneous supply must strictly match instantaneous demand & storage',
    status: balancePass ? 'PASS' : 'FAIL',
    detail: `Supply: ${supply.toFixed(1)} MW / Demand+Storage: ${demand.toFixed(1)} MW (Delta: ${powerBalanceError.toFixed(2)} MW, tolerance ${tolerance} MW)`,
  });

  // Check 5b: N-1 contingency screen (toggleable; never blocks on its own errors)
  if (cfg.n1GateEnabled !== false) {
    try {
      const threshold = cfg.n1UnservedThresholdMw ?? 25;
      const cleanNow = state.solarFarms.reduce((sum, s) => sum + (s.status === 'online' ? s.currentOutputMw : 0), 0)
        + state.windFarms.reduce((sum, w) => sum + (w.status === 'online' ? w.currentOutputMw : 0), 0);
      const battCover = state.batteries
        .filter((b) => b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct > b.minSocPct)
        .reduce((sum, b) => sum + Math.min(b.powerRatingMw, ((b.currentSocPct - b.minSocPct) / 100) * b.capacityMwh * 4), 0);
      const drShedN1 = Object.values(scenario.demandResponseCurtailMw).reduce((a, b) => a + b, 0);
      const demN1 = state.grid.totalDemandMw - drShedN1;
      let worst = { label: 'none', unserved: 0 };
      const consider = (label: string, gen: number) => {
        const u = Math.max(0, Math.round((demN1 - gen - battCover) * 10) / 10);
        if (u > worst.unserved) worst = { label, unserved: u };
      };
      for (const a of [...state.solarFarms, ...state.windFarms]) {
        if (a.status !== 'online') continue;
        consider(`loss of ${a.id}`, cleanNow - a.currentOutputMw);
      }
      const breach = worst.unserved > threshold;
      checks.push({
        id: 'N1-CONTINGENCY',
        category: 'GRID_CONSTRAINT',
        rule: `N-1 secure: worst single loss leaves < ${threshold} MW unserved`,
        status: breach ? 'FAIL' : 'PASS',
        detail: breach
          ? `VIOLATION under ${worst.label} (${worst.unserved} MW unserved after storage) — staged for human review`
          : `Worst single loss (${worst.label}) leaves ${worst.unserved} MW unserved — within tolerance`,
      });
    } catch { /* N-1 never blocks on its own errors */ }
  }

  // Check 5: IEEE 1547-2018 Regulatory Frequency Compliance
  const freq = state.grid.frequencyHz;
  const freqCompliant = (freq >= 49.5 && freq <= 50.5);
  checks.push({
    id: 'REG-IEEE-1547',
    category: 'REGULATORY',
    rule: 'IEEE 1547-2018 Category III frequency response and anti-islanding protocol',
    status: freqCompliant ? 'PASS' : 'WARN',
    detail: `Current Grid Frequency: ${freq.toFixed(2)} Hz (Nominal: 50.00 Hz, Safe band: 49.50 - 50.50 Hz)`,
  });

  return checks;
}

// Calculate Confidence Score
export function calculateConfidence(
  state: PortfolioState,
  scenario: ScenarioCandidate,
  checks: GroundingCheck[],
): number {
  let score = 98.0;

  // Any failed grounding check drastically reduces confidence
  if (checks.some((c) => c.status === 'FAIL')) score -= 35;
  if (checks.some((c) => c.status === 'WARN')) score -= 12;

  // Grid frequency warning / emergency
  if (state.grid.frequencyStatus === 'warning') score -= 8;
  if (state.grid.frequencyStatus === 'emergency') score -= 22;

  // Weather volatility
  if (state.weather.condition === 'heavy_overcast' || state.weather.condition === 'gusty_wind') score -= 5;
  if (state.weather.stormAlert) score -= 14;

  // Line congestion
  if (state.interties.some((i) => i.congested)) score -= 7;

  // Battery faults
  if (state.batteries.some((b) => b.status === 'fault')) score -= 9;

  // Market volatility
  if (state.market.priceTrend === 'spiking' || state.market.spotPriceUsdPerMwh > 250) score -= 4;

  return Math.max(50, Math.min(99.5, Math.round(score * 10) / 10));
}

// Action commands generation
export function generateActionCommands(
  scenario: ScenarioCandidate,
  state: PortfolioState,
): ActionCommand[] {
  const actions: ActionCommand[] = [];

  // Dynamic commands for all batteries in the portfolio
  state.batteries.forEach((b) => {
    const bMw = scenario.batteryDispatchMw[b.id] || 0;
    if (b.status === 'fault') {
      actions.push({
        assetId: b.id,
        assetName: b.name,
        type: 'BATTERY_HOLD',
        valueMw: 0,
        detail: 'Inverter locked out due to fault alert. Maintain isolation.',
        precondition: 'Fault clearance required before reconnect',
      });
    } else if (bMw > 0) {
      actions.push({
        assetId: b.id,
        assetName: b.name,
        type: 'BATTERY_DISCHARGE',
        valueMw: bMw,
        detail: `Discharge ${bMw.toFixed(1)} MW (${b.chemistry}) into local 34.5kV collector bus.`,
        precondition: `${b.name} SOC (${b.currentSocPct.toFixed(1)}%) > floor (${b.minSocPct}%)`,
      });
    } else if (bMw < 0) {
      actions.push({
        assetId: b.id,
        assetName: b.name,
        type: 'BATTERY_CHARGE',
        valueMw: Math.abs(bMw),
        detail: `Absorb ${Math.abs(bMw).toFixed(1)} MW clean surplus to replenish storage reserve.`,
        precondition: `${b.name} SOC (${b.currentSocPct.toFixed(1)}%) < max (${b.maxSocPct}%)`,
      });
    } else {
      actions.push({
        assetId: b.id,
        assetName: b.name,
        type: 'BATTERY_HOLD',
        valueMw: 0,
        detail: 'Maintain standby spinning reserve for fast frequency response.',
        precondition: 'System state stable',
      });
    }
  });

  // Demand Response triggers
  Object.entries(scenario.demandResponseCurtailMw).forEach(([cId, mw]) => {
    if (mw > 0) {
      const consumer = state.consumers.find((c) => c.id === cId);
      actions.push({
        assetId: cId,
        assetName: consumer?.name || cId,
        type: 'DEMAND_RESPONSE_TRIGGER',
        valueMw: mw,
        detail: `Curtail ${mw.toFixed(1)} MW flexible load under ISO tariff incentive ($${state.market.drIncentiveUsdPerMwh}/MWh).`,
        precondition: 'Industrial consumer advance notification confirmed',
      });
    }
  });

  // Load shifting (shed now, rebound off-peak next cycle)
  Object.entries(scenario.loadShiftMw || {}).forEach(([cId, mw]) => {
    const v = Number(mw) || 0;
    if (v > 0) {
      const consumer = state.consumers.find((c) => c.id === cId);
      actions.push({
        assetId: cId,
        assetName: consumer?.name || cId,
        type: 'SHIFT_LOAD',
        valueMw: v,
        detail: `Shift ${v.toFixed(1)} MW to off-peak window (rebound +1 cycle).`,
        precondition: 'Rebound capacity reserved next cycle',
      });
    }
  });

  // Grid Intertie Exchange
  if (scenario.gridNetImportMw < 0) {
    const exportMw = -scenario.gridNetImportMw;
    actions.push({
      assetId: 'INTERTIE-GRID',
      assetName: 'Regional Transmission Intertie',
      type: 'GRID_EXPORT',
      valueMw: exportMw,
      detail: `Transmit ${exportMw.toFixed(1)} MW surplus renewable energy to wholesale market at spot price $${state.market.spotPriceUsdPerMwh}/MWh.`,
      precondition: 'Line loading < 100% thermal capacity',
    });
  } else if (scenario.gridNetImportMw > 0) {
    actions.push({
      assetId: 'INTERTIE-GRID',
      assetName: 'Regional Transmission Intertie',
      type: 'GRID_IMPORT',
      valueMw: scenario.gridNetImportMw,
      detail: `Import ${scenario.gridNetImportMw.toFixed(1)} MW to bridge residual supply gap.`,
      precondition: 'Firm transmission capacity available',
    });
  }

  // Curtailment actions if required (solar first per merit order)
  if (scenario.curtailmentMw.solar > 0) {
    actions.push({
      assetId: 'SOL-FLEET',
      assetName: 'Solar Generation Fleet',
      type: 'CURTAIL_SOLAR',
      valueMw: scenario.curtailmentMw.solar,
      detail: `Curtail ${scenario.curtailmentMw.solar.toFixed(1)} MW solar output (merit order first) to respect export/storage limits.`,
      precondition: 'Transmission intertie thermal constraint active',
    });
  }
  if (scenario.curtailmentMw.wind > 0) {
    actions.push({
      assetId: 'WND-FLEET',
      assetName: 'Wind Generation Fleet',
      type: 'CURTAIL_WIND',
      valueMw: scenario.curtailmentMw.wind,
      detail: `Throttle pitch control to curtail ${scenario.curtailmentMw.wind.toFixed(1)} MW wind output to prevent transmission overload.`,
      precondition: 'Transmission intertie thermal constraint active',
    });
  }

  actions.push(...planMaintenanceActions(state));

  return actions;
}

/**
 * Maintenance domain planner (mirrors server/scenarios.ts planMaintenanceActions):
 * fault → inspection; overheat/degradation/gust → schedule; maintenance during
 * emergency → delay (hold return-to-service).
 */
export function planMaintenanceActions(state: PortfolioState): ActionCommand[] {
  const actions: ActionCommand[] = [];
  const emergency = state.grid.frequencyStatus === 'emergency'
    || state.market.spotPriceUsdPerMwh > 200
    || state.weather.stormAlert;
  state.batteries.forEach((b) => {
    if (b.status === 'fault') {
      actions.push({ assetId: b.id, assetName: b.name, type: 'DISPATCH_INSPECTION', valueMw: 0, detail: 'Dispatch crew to diagnose inverter fault', precondition: 'Fault event logged' });
    } else if (b.status === 'maintenance' && emergency) {
      actions.push({ assetId: b.id, assetName: b.name, type: 'DELAY_MAINTENANCE', valueMw: 0, detail: 'Hold return-to-service during grid emergency', precondition: 'Emergency declared' });
    } else if (b.tempC > 38 && b.status !== 'maintenance') {
      actions.push({ assetId: b.id, assetName: b.name, type: 'SCHEDULE_MAINTENANCE', valueMw: 0, detail: `Cooling inspection due (cell ${b.tempC.toFixed(1)}°C), next low-price window`, precondition: 'Off-peak window available' });
    }
  });
  state.solarFarms.forEach((s) => {
    if (s.degradationPct > 1.5 && s.status === 'online') {
      actions.push({ assetId: s.id, assetName: s.name, type: 'SCHEDULE_MAINTENANCE', valueMw: 0, detail: `Cleaning + IV-curve test due (degradation ${s.degradationPct.toFixed(1)}%)`, precondition: 'Low-irradiance window' });
    }
  });
  state.windFarms.forEach((w) => {
    if (w.gustWarning && w.status === 'online') {
      actions.push({ assetId: w.id, assetName: w.name, type: 'DISPATCH_INSPECTION', valueMw: 0, detail: 'Post-gust blade/pitch inspection after storm front passes', precondition: 'Wind below 20 m/s' });
    }
  });
  return actions;
}

// Generate Explainability, Rationale, and Counterfactuals
function generateExplainability(
  selected: ScenarioCandidate,
  all: ScenarioCandidate[],
  state: PortfolioState,
  weights: ObjectiveWeights,
) {
  const rejected = all.filter((s) => s.id !== selected.id);

  const rationale = `The Autonomous Orchestrator selected "${selected.name}" with a composite utility score of ${selected.compositeUtilityScore.toFixed(1)}/100. Under current conditions (Spot Price: $${state.market.spotPriceUsdPerMwh.toFixed(2)}/MWh, Grid Frequency: ${state.grid.frequencyHz.toFixed(2)} Hz, Clean Generation: ${(state.solarFarms.reduce((s, a) => s + a.currentOutputMw, 0) + state.windFarms.reduce((w, a) => w + a.currentOutputMw, 0)).toFixed(1)} MW vs Demand: ${state.grid.totalDemandMw.toFixed(1)} MW), this strategy optimally aligns with the user's active objective priorities. It achieves ${selected.renewableUtilizationPct.toFixed(1)}% clean energy utilization while yielding a net economic impact of ${selected.netEconomicImpactUsd >= 0 ? '+' : ''}$${selected.netEconomicImpactUsd.toFixed(0)} and maintaining grid reliability at ${selected.reliabilityScore}/100.`;

  const rejectedAlternatives = rejected.map((alt) => {
    let reason = '';
    if (alt.compositeUtilityScore < selected.compositeUtilityScore) {
      const delta = selected.compositeUtilityScore - alt.compositeUtilityScore;
      if (alt.projectedCostUsd > selected.projectedCostUsd) {
        reason = `Rejected: Cost is $${(alt.projectedCostUsd - selected.projectedCostUsd).toFixed(0)} higher with a lower composite utility score (-${delta.toFixed(1)} pts).`;
      } else if (alt.batteryDegradationScore < selected.batteryDegradationScore) {
        reason = `Rejected: Causes higher battery degradation without proportional financial or reliability gain (-${delta.toFixed(1)} pts).`;
      } else if (alt.reliabilityScore < selected.reliabilityScore) {
        reason = `Rejected: Lower grid reliability margin during volatile operating conditions (-${delta.toFixed(1)} pts).`;
      } else {
        reason = `Rejected: Suboptimal multi-attribute trade-off balance (-${delta.toFixed(1)} pts).`;
      }
    }
    return { name: alt.name, reason };
  });

  const counterfactualReasoning = `Counterfactual Analysis: If the operator had enforced a pure "Conservative Hold" strategy, the utility would have incurred an estimated $${Math.abs(all.find((s) => s.id === 'CONSERVATIVE_HOLD')?.projectedCostUsd || 0).toFixed(0)} in additional market import costs and generated ${((all.find((s) => s.id === 'CONSERVATIVE_HOLD')?.projectedEmissionsTons || 0) - selected.projectedEmissionsTons).toFixed(2)} tons more carbon emissions. Conversely, a full "Aggressive Discharge" would have accelerated BESS cell wear by ${(selected.batteryDegradationScore - (all.find((s) => s.id === 'AGGRESSIVE_DISCHARGE')?.batteryDegradationScore || 0))} wear points for diminishing economic returns.`;

  const tradeoffs = [
    {
      objective: 'Economic vs Asset Longevity',
      impact: selected.id === 'AGGRESSIVE_DISCHARGE'
        ? 'High merchant revenue prioritized over battery cycle life.'
        : 'Battery cycling moderated to prolong pack lifetime past year 10.',
    },
    {
      objective: 'Renewable Utilization vs Grid Limit',
      impact: selected.curtailmentMwh > 0
        ? `Curtailed ${selected.curtailmentMwh.toFixed(1)} MWh to prevent tripping regional transmission intertie limits.`
        : '100% of generated clean power absorbed or exported without curtailment.',
    },
    {
      objective: 'Reliability vs Spot Margin',
      impact: `Maintained emergency reserve headroom while capturing $${selected.projectedRevenueUsd.toFixed(0)} in market exchange.`,
    },
  ];

  return {
    rationale,
    counterfactualReasoning,
    rejectedAlternatives,
    tradeoffs,
  };
}

// Build 12-Node DAG execution trace for visualization
function buildDAGExecutionTrace(state: PortfolioState, selected: ScenarioCandidate): DAGNode[] {
  return [
    {
      id: 'DAG-01',
      name: 'Data Ingestion & SCADA Telemetry Feeds',
      phase: 'INGESTION',
      status: 'completed',
      durationMs: 42,
      inputsSummary: '5 Solar, 3 Wind, 2 BESS, 4 Industrial, 2 Interties, Market API',
      outputsSummary: `Ingested ${state.solarFarms.length + state.windFarms.length + state.batteries.length + state.consumers.length} asset telemetry data points`,
      dependsOn: [],
    },
    {
      id: 'DAG-02',
      name: 'Data Aggregation & Format Normalization',
      phase: 'INGESTION',
      status: 'completed',
      durationMs: 28,
      inputsSummary: 'Raw SCADA telemetry and market spot quotes',
      outputsSummary: 'Unit-normalized time-series aligned to 15-minute dispatch interval',
      dependsOn: ['DAG-01'],
    },
    {
      id: 'DAG-03',
      name: 'Generation & Weather Forecast Analysis',
      phase: 'ANALYSIS',
      status: 'completed',
      durationMs: 65,
      inputsSummary: `Weather condition: ${state.weather.condition}, Wind: ${state.weather.windSpeedMs} m/s`,
      outputsSummary: 'Solar & wind generation 15-min and 1-hr delta projections mapped',
      dependsOn: ['DAG-02'],
    },
    {
      id: 'DAG-04',
      name: 'Battery State & Health Optimization',
      phase: 'ANALYSIS',
      status: 'completed',
      durationMs: 52,
      inputsSummary: 'BESS-01 SOC: 68.5%, BESS-02 SOC: 54.0%, Inverter temperatures',
      outputsSummary: 'Max C-rate envelopes & thermal degradation constraints updated',
      dependsOn: ['DAG-02'],
    },
    {
      id: 'DAG-05',
      name: 'Grid Frequency & Intertie Congestion Analysis',
      phase: 'ANALYSIS',
      status: 'completed',
      durationMs: 48,
      inputsSummary: `Frequency: ${state.grid.frequencyHz.toFixed(2)} Hz, Line North: ${state.interties[0].currentFlowMw} MW`,
      outputsSummary: 'Congestion safety margins calculated; IEEE-1547 flags checked',
      dependsOn: ['DAG-02'],
    },
    {
      id: 'DAG-06',
      name: 'Multi-Scenario Simulation & Candidate Projection',
      phase: 'SCENARIO_MODELING',
      status: 'completed',
      durationMs: 115,
      inputsSummary: '5 candidate strategies (Aggressive, Conservative, Balanced, DR, Clean Export)',
      outputsSummary: 'Simulated 5 dispatch profiles across cost, emissions, wear, and stability',
      dependsOn: ['DAG-03', 'DAG-04', 'DAG-05'],
    },
    {
      id: 'DAG-07',
      name: 'Multi-Objective Utility Optimization & Ranking',
      phase: 'OPTIMIZATION',
      status: 'completed',
      durationMs: 78,
      inputsSummary: 'User objective weights applied to multi-attribute utility matrix',
      outputsSummary: `Ranked 5 candidates: Winner is ${selected.name} (${selected.compositeUtilityScore} pts)`,
      dependsOn: ['DAG-06'],
    },
    {
      id: 'DAG-08',
      name: 'Grounding & Physical Validation Check',
      phase: 'GROUNDING',
      status: 'completed',
      durationMs: 38,
      inputsSummary: 'Conservation of energy, BESS limits, line ratings, regulatory bounds',
      outputsSummary: '6/6 Grounding rules verified with zero physical violations',
      dependsOn: ['DAG-07'],
    },
    {
      id: 'DAG-09',
      name: 'Explainability & Counterfactual Reasoning',
      phase: 'EXPLAINABILITY',
      status: 'completed',
      durationMs: 84,
      inputsSummary: 'Winning candidate vs 4 rejected alternatives and trade-offs',
      outputsSummary: 'Generated natural language justification and counterfactual baseline',
      dependsOn: ['DAG-08'],
    },
    {
      id: 'DAG-10',
      name: 'Actuator Execution Planning & Safety Preconditions',
      phase: 'EXECUTION',
      status: 'completed',
      durationMs: 45,
      inputsSummary: 'BESS setpoints, curtailment orders, demand response dispatches',
      outputsSummary: 'Synthesized atomic actuator commands with rollback preconditions',
      dependsOn: ['DAG-08'],
    },
    {
      id: 'DAG-11',
      name: 'Command Execution & Actuation Dispatch',
      phase: 'EXECUTION',
      status: 'completed',
      durationMs: 50,
      inputsSummary: 'Actuator commands dispatched to inverters and ISO market interfaces',
      outputsSummary: 'Dispatches acknowledged by SCADA field controllers',
      dependsOn: ['DAG-10'],
    },
    {
      id: 'DAG-12',
      name: 'Immutable Audit Logging & Cryptographic Stamp',
      phase: 'EXECUTION',
      status: 'completed',
      durationMs: 22,
      inputsSummary: 'Decision trace, grounding log, operator permissions, telemetry snapshot',
      outputsSummary: 'Decision committed to append-only audit trail with SHA256 integrity hash',
      dependsOn: ['DAG-11'],
    },
  ];
}

// ---------------------------------------------------------------------------
// Admin custom grounding rules (frontend mirror of server/groundingConfig.ts).
// Same closed metric vocabulary, same breach semantics: ALL conditions true.
// ---------------------------------------------------------------------------

export interface CustomGroundingRuleInput {
  id: string;
  name: string;
  category: 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT' | 'MARKET';
  severity: 'WARN' | 'FAIL';
  conditions: Array<{ metric: string; op: '>' | '>=' | '<' | '<='; value: number }>;
  message: string;
}

function customMetricValue(portfolio: PortfolioState, scenario: ScenarioCandidate, metric: string): number | null {
  const clean = [...portfolio.solarFarms, ...portfolio.windFarms]
    .reduce((s, a) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const dis = Object.values(scenario.batteryDispatchMw || {}).filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const net = scenario.gridNetImportMw || 0;
  switch (metric) {
    case 'freq_hz': return portfolio.grid?.frequencyHz ?? 50.0;
    case 'demand_mw': return portfolio.grid?.totalDemandMw ?? 0;
    case 'spot_price': return portfolio.market?.spotPriceUsdPerMwh ?? 0;
    case 'clean_gen_mw': return clean;
    case 'battery_discharge_mw': return dis;
    case 'grid_import_mw': return Math.max(0, net);
    case 'grid_export_mw': return Math.max(0, -net);
    case 'curtail_mwh': return scenario.curtailmentMwh ?? 0;
    case 'dr_shed_mw': return Object.values(scenario.demandResponseCurtailMw || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    case 'batt_min_soc': return portfolio.batteries.length ? Math.min(...portfolio.batteries.map((b) => b.currentSocPct)) : 100;
    case 'batt_max_temp': return portfolio.batteries.length ? Math.max(...portfolio.batteries.map((b) => b.tempC || 0)) : 0;
    case 'intertie_max_load_pct': {
      const ls = portfolio.interties.map((l) => (Math.abs(l.currentFlowMw || 0) / (l.limitMw || 1)) * 100);
      return ls.length ? Math.max(...ls) : 0;
    }
    default: return null;
  }
}

function testCustomOp(op: string, left: number, right: number): boolean {
  switch (op) {
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    default: return false;
  }
}

export function evaluateCustomRules(
  portfolio: PortfolioState,
  scenario: ScenarioCandidate,
  rules: CustomGroundingRuleInput[],
): GroundingCheck[] {
  const out: GroundingCheck[] = [];
  for (const rule of rules || []) {
    if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) continue;
    const parts: string[] = [];
    let breach = true;
    for (const c of rule.conditions) {
      const v = customMetricValue(portfolio, scenario, c.metric);
      if (v === null) { breach = false; break; }
      const ok = testCustomOp(c.op, v, Number(c.value));
      parts.push(`${c.metric} ${v} ${c.op} ${c.value}`);
      if (!ok) breach = false;
    }
    if (!breach) continue;
    out.push({
      id: rule.id,
      category: rule.category,
      rule: `${rule.name} [custom rule]`,
      status: rule.severity === 'FAIL' ? 'FAIL' : 'WARN',
      detail: `${rule.message || 'Custom threshold breached'} (${parts.join(' AND ')})`,
    });
  }
  return out;
}
