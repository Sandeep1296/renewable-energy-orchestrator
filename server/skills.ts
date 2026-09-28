import fs from 'fs';
import path from 'path';
import { readJson, writeJsonAtomic } from './store.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const SKILLS_FILE = path.join(DATA_DIR, 'skills.json');

export interface Skill {
  id: string;
  name: string;
  agentId: string;
  category: string;
  description: string;
  promptFragment: string;
  enabled: boolean;
  version: string;
  updatedAt: string;
  updatedBy?: string;
}

export const AGENTS = [
  { id: 'AGT-FORECAST', name: 'Forecast Intelligence Agent', role: 'Renewable Meteorologist & Ramp Predictor' },
  { id: 'AGT-STORAGE', name: 'Storage Guardian Agent', role: 'Battery Chemistry & Degradation Specialist' },
  { id: 'AGT-GRID', name: 'Grid Stability Sentinel', role: 'Frequency & Transmission Integrity Guardian' },
  { id: 'AGT-MARKET', name: 'Merchant Arbitrage Agent', role: 'Wholesale Electricity Market Strategist' },
  { id: 'AGT-SAFETY', name: 'Data Grounding & Safety Guardian', role: 'Thermodynamics & Regulatory Verifier' },
];

const DEFAULT_SKILLS: Skill[] = [
  { id: 'SOLAR_FORECAST_ANALYSIS', name: 'Solar Forecast Analysis', agentId: 'AGT-FORECAST', category: 'GENERATION_SKILLS', description: 'Project solar output over 15min/1hr horizons from telemetry + weather.', promptFragment: 'Assess solar ramp risk from cloud cover, pyranometer delta, and inverter headroom. Cite MW figures.', enabled: true, version: '1.1', updatedAt: new Date().toISOString() },
  { id: 'WIND_FORECAST_ANALYSIS', name: 'Wind Forecast Analysis', agentId: 'AGT-FORECAST', category: 'GENERATION_SKILLS', description: 'Project wind output and gust cut-out risk.', promptFragment: 'Assess wind ramp and cut-out risk (22 m/s pitch, 25 m/s trip). Recommend battery pre-ramp if needed.', enabled: true, version: '1.1', updatedAt: new Date().toISOString() },
  { id: 'RAMP_ANOMALY_DETECTION', name: 'Ramp Anomaly Detection', agentId: 'AGT-FORECAST', category: 'GENERATION_SKILLS', description: 'Detect cloud-front and ramp signatures.', promptFragment: 'Flag anomaly signatures (cloud-front >50MW/10min loss, RoCoF events) and pre-positioning actions.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'SOC_OPTIMIZATION', name: 'SOC Optimization', agentId: 'AGT-STORAGE', category: 'STORAGE_SKILLS', description: 'Compute feasible charge/discharge envelopes from SOC floors.', promptFragment: 'Prefer LFP (BESS-01) cycling over NMC (BESS-02, 1.46x wear). Never breach SOC floors or dispatch faulted packs.', enabled: true, version: '1.2', updatedAt: new Date().toISOString() },
  { id: 'HEALTH_MONITORING', name: 'Battery Health Monitoring', agentId: 'AGT-STORAGE', category: 'STORAGE_SKILLS', description: 'Thermal derating and degradation guard.', promptFragment: 'Derate to 0.5C above 38C cell temp; lock out above 55C. Minimize NMC micro-cycling.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'CHARGE_DISCHARGE_PLANNING', name: 'Charge/Discharge Planning', agentId: 'AGT-STORAGE', category: 'STORAGE_SKILLS', description: 'Plan 15-min setpoints within C-rate and energy bounds.', promptFragment: 'Propose explicit MW setpoints per BESS within powerRating and available energy. Show math.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'FREQUENCY_ANALYSIS', name: 'Frequency Analysis', agentId: 'AGT-GRID', category: 'GRID_SKILLS', description: 'IEEE 1547 frequency droop assessment.', promptFragment: 'Enforce IEEE 1547-2018 Cat III: FFR discharge below 49.90Hz within 500ms; inhibit charging on under-frequency.', enabled: true, version: '1.1', updatedAt: new Date().toISOString() },
  { id: 'CONGESTION_DETECTION', name: 'Congestion Detection', agentId: 'AGT-GRID', category: 'GRID_SKILLS', description: 'Intertie thermal limit watch.', promptFragment: 'Respect Line North 150MW / South 120MW. Priority: charge locally, then DR, then curtail. Never approve export beyond SOL.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'STABILITY_ASSESSMENT', name: 'Stability Assessment', agentId: 'AGT-GRID', category: 'GRID_SKILLS', description: 'Inertia and reserve adequacy.', promptFragment: 'Maintain 15% emergency reserve floor. Demand synthetic inertia on RoCoF < -0.12 Hz/s.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'PRICE_FORECASTING', name: 'Price Forecasting', agentId: 'AGT-MARKET', category: 'MARKET_SKILLS', description: 'Spot price regime classification.', promptFragment: 'Classify regime (spike >$150, negative <-$5). Only recommend aggressive export on verified spikes.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'ARBITRAGE_OPPORTUNITY', name: 'Arbitrage Opportunity', agentId: 'AGT-MARKET', category: 'MARKET_SKILLS', description: 'Revenue vs degradation trade.', promptFragment: 'Weigh merchant revenue against degradation cost. NMC only for high-margin spikes.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'DEMAND_RESPONSE_ANALYSIS', name: 'Demand Response Analysis', agentId: 'AGT-MARKET', category: 'MARKET_SKILLS', description: 'Flexible load shed valuation.', promptFragment: 'Value DR curtailment at ISO incentive ($/MWh). Shed only flexible MW with advance notice.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'PHYSICAL_GROUNDING', name: 'Physical Grounding', agentId: 'AGT-SAFETY', category: 'GOVERNANCE_SKILLS', description: 'First-law power balance verification. NON-BYPASSABLE.', promptFragment: 'VETO any plan violating conservation of energy, inverter ratings, or non-negative dispatch. This is a hard gate.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'REGULATORY_COMPLIANCE', name: 'Regulatory Compliance', agentId: 'AGT-SAFETY', category: 'GOVERNANCE_SKILLS', description: 'IEEE 1547 / FERC / NERC checks. NON-BYPASSABLE.', promptFragment: 'VETO any plan breaching IEEE-1547 frequency bands or intertie SOL. Cite rule IDs.', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
  { id: 'PRECONDITION_CHECK', name: 'Precondition Check', agentId: 'AGT-SAFETY', category: 'GOVERNANCE_SKILLS', description: 'Actuator precondition audit.', promptFragment: 'Require explicit preconditions per command (SOC bounds, line headroom, fault clearance).', enabled: true, version: '1.0', updatedAt: new Date().toISOString() },
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadSkills(): Skill[] {
  ensureDataDir();
  return readJson<Skill[]>(SKILLS_FILE, () => DEFAULT_SKILLS);
}

export function saveSkills(skills: Skill[]) {
  ensureDataDir();
  writeJsonAtomic(SKILLS_FILE, skills);
}

export function updateSkill(id: string, patch: Partial<Skill>, updatedBy?: string): Skill | null {
  const skills = loadSkills();
  const idx = skills.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  // Safety skills cannot be disabled — guardrail integrity
  if ((id === 'PHYSICAL_GROUNDING' || id === 'REGULATORY_COMPLIANCE') && patch.enabled === false) {
    throw new Error('Safety guardrail skills cannot be disabled');
  }
  skills[idx] = { ...skills[idx], ...patch, id, updatedAt: new Date().toISOString(), updatedBy };
  saveSkills(skills);
  return skills[idx];
}
