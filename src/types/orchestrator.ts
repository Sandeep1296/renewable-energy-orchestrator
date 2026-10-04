export type AssetStatus = 'online' | 'degraded' | 'curtailed' | 'offline';
export type BatteryStatus = 'idle' | 'charging' | 'discharging' | 'fault' | 'maintenance';
export type ConsumerStatus = 'normal' | 'dr_active' | 'offline';

export interface SolarAsset {
  id: string;
  name: string;
  capacityMw: number;
  currentOutputMw: number;
  forecast15minMw: number;
  forecast1hrMw: number;
  status: AssetStatus;
  tiltAngle: number;
  degradationPct: number;
  curtailedMw: number;
}

export interface WindAsset {
  id: string;
  name: string;
  capacityMw: number;
  currentOutputMw: number;
  forecast15minMw: number;
  forecast1hrMw: number;
  status: AssetStatus;
  windSpeedMs: number;
  gustWarning: boolean;
  curtailedMw: number;
}

export interface BatteryAsset {
  id: string;
  name: string;
  chemistry: 'LFP' | 'NMC' | 'Sodium-Ion' | 'Flow';
  capacityMwh: number;
  powerRatingMw: number;
  currentSocPct: number;
  minSocPct: number;
  maxSocPct: number;
  efficiency: number; // e.g. 0.92
  targetPowerMw: number; // positive = discharge to grid, negative = charge from grid/renewables
  status: BatteryStatus;
  degradationRate: number; // degradation per full cycle
  cycleCount: number;
  tempC: number;
}

export interface IndustrialConsumer {
  id: string;
  name: string;
  totalDemandMw: number;
  baseloadDemandMw: number;
  flexibleDemandMw: number;
  curtailedMw: number;
  status: ConsumerStatus;
  drIncentiveRate: number; // $/MWh
}

export interface GridIntertie {
  id: string;
  name: string;
  capacityMw: number;
  currentFlowMw: number; // positive = exporting surplus, negative = importing
  limitMw: number;
  congested: boolean;
}

export interface GridState {
  frequencyHz: number; // nominal 50.00
  frequencyStatus: 'nominal' | 'warning' | 'emergency';
  totalDemandMw: number;
  totalRenewableMw: number;
  netExchangeMw: number;
  inertiaScore: number; // 0-100
}

export interface MarketState {
  spotPriceUsdPerMwh: number;
  forecastPrice1hr: number;
  carbonPriceUsdPerTon: number;
  drIncentiveUsdPerMwh: number;
  priceTrend: 'spiking' | 'rising' | 'stable' | 'falling' | 'negative';
}

export interface WeatherState {
  condition: 'clear' | 'partly_cloudy' | 'heavy_overcast' | 'gusty_wind' | 'severe_storm';
  cloudCoverPct: number;
  windSpeedMs: number;
  stormAlert: boolean;
  temperatureC: number;
}

export interface PortfolioState {
  solarFarms: SolarAsset[];
  windFarms: WindAsset[];
  batteries: BatteryAsset[];
  consumers: IndustrialConsumer[];
  interties: GridIntertie[];
  grid: GridState;
  market: MarketState;
  weather: WeatherState;
  timestamp: string;
}

export interface ObjectiveWeights {
  minimizeCost: number;             // Weight 0-100
  minimizeEmissions: number;        // Weight 0-100
  minimizeCurtailment: number;      // Weight 0-100
  minimizeBatteryDegradation: number;// Weight 0-100
  maximizeReliability: number;      // Weight 0-100
  maximizeRenewableUtilization: number;// Weight 0-100
  maximizeArbitrageProfit: number;  // Weight 0-100
}

export type PresetName = 
  | 'balanced' 
  | 'green' 
  | 'economic' 
  | 'grid_emergency' 
  | 'battery_preservation';

export interface ScenarioCandidate {
  id: 'AGGRESSIVE_DISCHARGE' | 'CONSERVATIVE_HOLD' | 'BALANCED_APPROACH' | 'DEMAND_RESPONSE' | 'RENEWABLE_CHARGE_AND_EXPORT';
  name: string;
  strategyKicker: string;
  description: string;
  batteryDispatchMw: Record<string, number>; // batteryId -> MW (positive = discharge, negative = charge)
  curtailmentMw: { solar: number; wind: number };
  demandResponseCurtailMw: Record<string, number>; // consumerId -> MW curtailed
  loadShiftMw?: Record<string, number>; // consumerId -> MW shifted to off-peak (rebound +1 cycle)
  gridNetImportMw: number; // positive = import from market, negative = export to market
  projectedCostUsd: number;
  projectedRevenueUsd: number;
  netEconomicImpactUsd: number;
  projectedEmissionsTons: number;
  curtailmentMwh: number;
  batteryDegradationScore: number; // 0-100 (100 = minimal wear)
  reliabilityScore: number; // 0-100
  renewableUtilizationPct: number; // 0-100%
  compositeUtilityScore: number; // 0-100
  rank: number;
  isViable: boolean;
  excluded?: boolean;
  assumedCleanGenMw?: number;
  assumedDemandMw?: number;
  violationReason?: string;
  scores: Record<string, { raw: number; weighted: number }>;
}

export type DAGNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface DAGNode {
  id: string;
  name: string;
  phase: 'INGESTION' | 'ANALYSIS' | 'SCENARIO_MODELING' | 'OPTIMIZATION' | 'DECISION' | 'GROUNDING' | 'EXPLAINABILITY' | 'EXECUTION';
  status: DAGNodeStatus;
  durationMs: number;
  inputsSummary: string;
  outputsSummary: string;
  dependsOn: string[];
}

export interface GroundingCheck {
  id: string;
  category: 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT' | 'MARKET';
  rule: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

export type HITLStatus = 'AUTONOMOUS' | 'SUPERVISED' | 'ADVISORY';

export interface ActionCommand {
  assetId: string;
  assetName: string;
  type: 'BATTERY_CHARGE' | 'BATTERY_DISCHARGE' | 'BATTERY_HOLD' | 'CURTAIL_SOLAR' | 'CURTAIL_WIND' | 'DEMAND_RESPONSE_TRIGGER' | 'SHIFT_LOAD' | 'SCHEDULE_MAINTENANCE' | 'DELAY_MAINTENANCE' | 'DISPATCH_INSPECTION' | 'GRID_EXPORT' | 'GRID_IMPORT';
  valueMw: number;
  detail: string;
  precondition: string;
}

export interface CarbonMetrics {
  emissionsIncurredTons: number;        // From fossil grid imports (0.42 tCO2/MWh)
  emissionsAvoidedTons: number;         // Clean energy delivered vs fossil grid benchmark (0.55 tCO2/MWh)
  carbonIntensityGramsPerKwh: number;   // Delivered carbon intensity (0 - 450 gCO2/kWh)
  carbonTaxPaidUsd: number;             // Taxes paid on imported power ($45/t)
  carbonOffsetValueUsd: number;         // Avoided carbon value at $45/t
  netCarbonEconomicImpactUsd: number;   // Offset value minus tax paid
  cleanEnergySharePct: number;          // % of consumer demand served cleanly
  cumulativeCarbonAvoidedTons: number;  // Cumulative across cycles
  equivalentTreesPlanted: number;       // Metric tons * 45 trees
  equivalentCarMilesAvoided: number;    // Metric tons * 2,480 miles
}

export interface AgenticToolCall {
  toolName: string;
  category: string;
  params: Record<string, any>;
  resultSummary: string;
  executionTimeMs: number;
}

export interface AlertThresholds {
  frequencyWarningDeltaHz: number;      // e.g. 0.08 Hz (49.92 or 50.08)
  frequencyEmergencyDeltaHz: number;    // e.g. 0.25 Hz (49.75 or 50.25)
  priceSpikeThresholdUsd: number;       // e.g. $150.00/MWh
  priceNegativeThresholdUsd: number;    // e.g. -$5.00/MWh
  lineCongestionThresholdPct: number;   // e.g. 90% of capacity
  batteryTempWarningC: number;          // e.g. 38°C
  batteryTempTripC: number;             // e.g. 50°C
  batteryMinSocFloorWarningPct: number; // e.g. 18% SOC
  windGustCutoutMs: number;             // e.g. 22 m/s
  solarRampDropPct: number;             // e.g. fleet output < 55% of online nameplate
  demandDeficitMw: number;              // e.g. demand exceeds clean gen by > 50 MW
}

export interface ActiveAlert {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'FREQUENCY' | 'MARKET' | 'THERMAL' | 'CONGESTION' | 'BATTERY' | 'WEATHER' | 'SOLAR' | 'DEMAND' | 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT';
  title: string;
  message: string;
  sourceAssetId?: string;
  value: string;
  threshold: string;
  acknowledged: boolean;
  suggestedMitigation: string;
  autoMitigated: boolean;
  hysteresisHeld?: boolean;
}

export interface SubAgentOpinion {
  agentId: string;
  agentName: string;
  role: string;
  avatarIcon: string;
  recommendation: string;
  preferredScenario: string;
  priorityFactor: string;
  confidenceScore: number; // 0-100
  rationale: string;
}

export interface AgenticTrace {
  isAgentic: boolean;
  modelUsed: string;
  thoughtTrace: string[];
  toolsInvoked: AgenticToolCall[];
  serverLatencyMs: number;
  agentEvaluationSummary: string;
  subAgentSwarm?: SubAgentOpinion[];
}

export interface OrchestrationDecision {
  decisionId: string;
  timestamp: string;
  cycleTime: string; // e.g. "14:15:00"
  approvedBy?: string;
  selectedScenario: ScenarioCandidate;
  allScenarios: ScenarioCandidate[];
  confidencePct: number;
  hitlStatus: HITLStatus;
  hitlApproved: boolean;
  hitlTimeoutSec: number;
  rationale: string;
  counterfactualReasoning: string;
  rejectedAlternatives: Array<{ name: string; reason: string }>;
  tradeoffs: Array<{ objective: string; impact: string }>;
  actions: ActionCommand[];
  groundingChecks: GroundingCheck[];
  groundingPolicy?: {
    powerBalanceToleranceMw?: number;
    batteryPowerHeadroomMw?: number;
    n1GateEnabled?: boolean;
    n1UnservedThresholdMw?: number;
  };
  auditHash: string;
  dagNodes: DAGNode[];
  carbonMetrics: CarbonMetrics;
  agenticTrace?: AgenticTrace;
}

export interface SimulationScenario {
  id: string;
  num: number;
  name: string;
  category: 'WEATHER_SURGE' | 'MARKET_VOLATILITY' | 'ASSET_FAILURE' | 'GRID_CONGESTION' | 'FREQUENCY_EVENT' | 'DEMAND_SPIKE';
  description: string;
  expectedStrategy: string;
  stressFactor: string;
  apply: (current: PortfolioState) => PortfolioState;
}

export interface RAGDocument {
  id: string;
  title: string;
  category: 'ASSET_SPEC' | 'REGULATORY_STANDARD' | 'HISTORICAL_CASE' | 'ANOMALY_SIGNATURE';
  summary: string;
  content: string;
  relevanceTags: string[];
}
