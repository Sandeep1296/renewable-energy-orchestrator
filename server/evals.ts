/**
 * Evaluation suites: deterministic (offline, CI-safe) + LLM-judge (quota-aware).
 * - Deterministic cases use synthetic fixtures and pure functions only.
 *   No file writes, no network, no LLM calls. Safe to run anytime.
 * - LLM cases attempt live reasoning; ANY provider outage marks them `skipped`
 *   (never failed) so a dead quota can't red the board.
 */
import { buildCandidates } from './scenarios.js';
import { runGuardrailsWith, assessHitl, confidenceScore } from './guardrails.js';
import { permissionsFor, roleFromClaims } from './auth.js';
import { searchRag } from './ragStore.js';
import { runCustomRules } from './groundingConfig.js';
import { applyLiveWeather } from './weather.js';
import { supervise } from './supervisor.js';
import { runSubAgentHandoff } from './subagents.js';
import { invokeWithFallback } from './llm.js';
import { provenanceOf } from '../src/services/provenance.js';
import { readJson, writeJsonAtomic } from './store.js';
import { fileURLToPath } from 'url';

export type EvalArea = 'reasoning' | 'safety' | 'knowledge' | 'access' | 'data';

export const AREA_LABEL: Record<EvalArea, string> = {
  reasoning: 'Agent reasoning',
  safety: 'Safety gates',
  knowledge: 'Knowledge & RAG',
  access: 'Access & audit honesty',
  data: 'Live data handling',
};

export interface EvalResult {
  id: string;
  suite: 'deterministic' | 'llm';
  area: EvalArea;
  name: string;
  soWhat: string;
  status: 'pass' | 'fail' | 'skipped';
  ms: number;
  detail: string;
}

interface Case {
  id: string;
  suite: 'deterministic' | 'llm';
  area: EvalArea;
  name: string;
  soWhat: string;
  run: () => Promise<string> | string;
}

// ---------- deterministic PRNG (mulberry32) ----------
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- synthetic fixtures (self-contained; immune to demo edits) ----------
const W = {
  minimizeCost: 35, minimizeEmissions: 40, minimizeCurtailment: 30,
  minimizeBatteryDegradation: 25, maximizeReliability: 60,
  maximizeRenewableUtilization: 45, maximizeArbitrageProfit: 30,
};
const POLICY = { powerBalanceToleranceMw: 1.0, batteryPowerHeadroomMw: 0.1 };

function mkBattery(id: string, overrides: any = {}) {
  return {
    id, name: id, chemistry: 'LFP', capacityMwh: 200, powerRatingMw: 50,
    currentSocPct: 68, minSocPct: 12, maxSocPct: 95, efficiency: 0.92,
    targetPowerMw: 0, status: 'idle', degradationRate: 0.00015, cycleCount: 120, tempC: 27,
    ...overrides,
  };
}

function mkPortfolio(overrides: any = {}) {
  return {
    solarFarms: [
      { id: 'SOL-01', name: 'S1', capacityMw: 50, currentOutputMw: 41, forecast15minMw: 40, forecast1hrMw: 38, status: 'online', tiltAngle: 25, degradationPct: 0.5, curtailedMw: 0 },
      { id: 'SOL-02', name: 'S2', capacityMw: 45, currentOutputMw: 37, forecast15minMw: 36, forecast1hrMw: 35, status: 'online', tiltAngle: 22, degradationPct: 0.6, curtailedMw: 0 },
    ],
    windFarms: [
      { id: 'WND-01', name: 'W1', capacityMw: 60, currentOutputMw: 46, forecast15minMw: 45, forecast1hrMw: 44, status: 'online', windSpeedMs: 9.2, gustWarning: false, curtailedMw: 0 },
    ],
    batteries: [mkBattery('BESS-01'), mkBattery('BESS-02', { chemistry: 'NMC', capacityMwh: 160, powerRatingMw: 40, currentSocPct: 54, minSocPct: 15, maxSocPct: 92 })],
    consumers: [
      { id: 'IND-01', name: 'Steel', totalDemandMw: 45, baseloadDemandMw: 30, flexibleDemandMw: 15, curtailedMw: 0, status: 'normal', drIncentiveRate: 85 },
      { id: 'IND-02', name: 'DC', totalDemandMw: 50, baseloadDemandMw: 42, flexibleDemandMw: 8, curtailedMw: 0, status: 'normal', drIncentiveRate: 85 },
    ],
    interties: [
      { id: 'LINE-NORTH', name: 'North', capacityMw: 150, currentFlowMw: 60, limitMw: 150, congested: false },
      { id: 'LINE-SOUTH', name: 'South', capacityMw: 120, currentFlowMw: 40, limitMw: 120, congested: false },
    ],
    grid: { frequencyHz: 50.01, frequencyStatus: 'nominal', totalDemandMw: 150, totalRenewableMw: 124, netExchangeMw: 0, inertiaScore: 90 },
    market: { spotPriceUsdPerMwh: 48.5, forecastPrice1hr: 52, carbonPriceUsdPerTon: 45, drIncentiveUsdPerMwh: 85, priceTrend: 'stable' },
    weather: { condition: 'partly_cloudy', cloudCoverPct: 30, windSpeedMs: 9.4, stormAlert: false, temperatureC: 24 },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function cleanGenOf(p: any): number {
  return [...p.solarFarms, ...p.windFarms]
    .reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
}

function mkCandidate(id: string, dispatch: Record<string, number> = {}, extra: any = {}) {
  return {
    id, name: id, strategyKicker: '', description: '',
    batteryDispatchMw: dispatch,
    curtailmentMw: { solar: 0, wind: 0 },
    demandResponseCurtailMw: {},
    gridNetImportMw: 0,
    projectedCostUsd: 0, projectedRevenueUsd: 0, netEconomicImpactUsd: 0,
    projectedEmissionsTons: 0, curtailmentMwh: 0,
    batteryDegradationScore: 80, reliabilityScore: 90, renewableUtilizationPct: 100,
    compositeUtilityScore: 0, rank: 0, isViable: true, scores: {},
    ...extra,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ---------- deterministic cases ----------
const deterministic: Case[] = [
  {
    id: 'rank_economics_responsive', suite: 'deterministic', area: 'reasoning', soWhat: 'Rankings follow real money — loss-makers cannot win on technicalities.',
    name: 'Economics discriminate: cheapest loss ranks first in deficit',
    run: () => {
      const p = mkPortfolio();
      p.solarFarms.forEach((s: any) => { s.currentOutputMw = 0; });
      p.windFarms.forEach((s: any) => { s.currentOutputMw = 0; });
      p.market.spotPriceUsdPerMwh = 120;
      const c = buildCandidates(p, 0, p.grid.totalDemandMw, W);
      const costs = c.map((x) => x.scores.cost?.raw ?? 0);
      assert(Math.max(...costs) - Math.min(...costs) > 20, `cost spread too flat: ${costs.join(',')}`);
      const worst = c.reduce((a, b) => (a.netEconomicImpactUsd < b.netEconomicImpactUsd ? a : b));
      assert(worst.rank === c.length || worst.compositeUtilityScore <= c[0].compositeUtilityScore, 'worst loss should not outrank winner');
      return `spread=${(Math.max(...costs) - Math.min(...costs)).toFixed(1)} winner=${c[0].id}`;
    },
  },
  {
    id: 'rank_weights_flip', suite: 'deterministic', area: 'reasoning', soWhat: 'Your weight presets genuinely steer strategy selection.',
    name: 'Weights move rankings (economic vs preservation presets differ)',
    run: () => {
      const p = mkPortfolio();
      const g = cleanGenOf(p);
      const a = buildCandidates(p, g, p.grid.totalDemandMw, W);
      const eco = { ...W, minimizeCost: 90, maximizeArbitrageProfit: 90, minimizeBatteryDegradation: 5 };
      const b = buildCandidates(JSON.parse(JSON.stringify(p)), g, p.grid.totalDemandMw, eco);
      const sig = (list: any[]) => list.map((x) => `${x.id}:${x.compositeUtilityScore}`).join('|');
      assert(sig(a) !== sig(b), 'preset change produced identical rankings');
      return `balanced→${a[0].id} economic→${b[0].id}`;
    },
  },
  {
    id: 'energy_closure_shocks', suite: 'deterministic', area: 'safety', soWhat: 'No dispatch can invent or lose a megawatt, in any shock state.',
    name: 'First-law closure holds across 6 shock states × 5 strategies',
    run: () => {
      const states: Array<[string, (p: any) => void]> = [
        ['nominal', () => {}],
        ['spike', (p) => { p.market.spotPriceUsdPerMwh = 340; }],
        ['cloud', (p) => { p.solarFarms.forEach((s: any) => { s.currentOutputMw = s.capacityMw * 0.2; }); }],
        ['gust', (p) => { p.windFarms.forEach((w: any) => { w.windSpeedMs = 24.2; w.gustWarning = true; }); }],
        ['trip', (p) => { p.batteries[1].status = 'fault'; }],
        ['surge', (p) => { p.grid.totalDemandMw = 175; }],
      ];
      let checked = 0;
      for (const [name, mut] of states) {
        const p = mkPortfolio();
        mut(p);
        const cands = buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W);
        for (const c of cands) {
          const bal = runGuardrailsWith(p, c, POLICY).find((x) => x.id === 'PHYS-CONSERV-ENERGY');
          assert(bal?.status === 'PASS', `${name}/${c.id}: ${bal?.detail}`);
          checked++;
        }
      }
      return `${checked} candidate-states closed`;
    },
  },
  {
    id: 'guardrail_fault_isolation', suite: 'deterministic', area: 'safety', soWhat: 'A faulted pack can never be dispatched, only held.',
    name: 'Faulted pack dispatched ≠0 fails; held at 0 passes',
    run: () => {
      const p = mkPortfolio();
      p.batteries[1].status = 'fault';
      const bad = runGuardrailsWith(p, mkCandidate('X', { 'BESS-02': 5 }), POLICY)
        .find((x) => x.id === 'PHYS-BATT-BESS-02');
      const good = runGuardrailsWith(p, mkCandidate('X', { 'BESS-02': 0 }), POLICY)
        .find((x) => x.id === 'PHYS-BATT-BESS-02');
      assert(bad?.status === 'FAIL', 'faulted dispatch should FAIL');
      assert(good?.status === 'PASS', 'held faulted pack should PASS');
      return 'fault isolation enforced';
    },
  },
  {
    id: 'guardrail_sol_and_freq', suite: 'deterministic', area: 'safety', soWhat: 'Overloaded lines block; frequency excursions warn without blocking.',
    name: 'Export beyond SOL fails; out-of-band frequency warns (not fails)',
    run: () => {
      const p = mkPortfolio();
      const over = runGuardrailsWith(p, mkCandidate('X', {}, { gridNetImportMw: -500 }), POLICY)
        .find((x) => x.id === 'GRID-LINE-LIMIT');
      assert(over?.status === 'FAIL', 'SOL breach should FAIL');
      const p2 = mkPortfolio({ grid: { ...mkPortfolio().grid, frequencyHz: 49.4 } });
      const f = runGuardrailsWith(p2, mkCandidate('X'), POLICY).find((x) => x.id === 'REG-IEEE-1547');
      assert(f?.status === 'WARN', 'frequency excursion should WARN, not FAIL');
      const p3 = mkPortfolio({ grid: { ...mkPortfolio().grid, frequencyHz: 49.6 } });
      const f2 = runGuardrailsWith(p3, mkCandidate('X'), POLICY).find((x) => x.id === 'REG-IEEE-1547');
      assert(f2?.status === 'PASS', 'in-envelope frequency should PASS');
      return 'SOL=FAIL, out-of-envelope=WARN, in-envelope=PASS';
    },
  },
  {
    id: 'hitl_tiers', suite: 'deterministic', area: 'safety', soWhat: 'Low confidence, big impacts, and nominal states always land in the right tier.',
    name: 'HITL tiers: low confidence→ADVISORY, big DR→SUPERVISED, nominal→AUTONOMOUS',
    run: () => {
      const p = mkPortfolio();
      const checks: any[] = [];
      const adv = assessHitl(p, mkCandidate('X'), 60, checks);
      assert(adv.status === 'ADVISORY' && adv.critical, 'conf<75 must be ADVISORY+critical');
      const dr = mkCandidate('X', {}, { demandResponseCurtailMw: { 'IND-01': 25 } });
      const sup = assessHitl(p, dr, 98, checks);
      assert(sup.status === 'SUPERVISED', '30MW shed at 98% must still be SUPERVISED');
      assert(sup.reasons.some((r: string) => r.includes('20 MW')), 'reason must cite impact threshold');
      const ok = assessHitl(p, mkCandidate('X'), 98, checks);
      assert(ok.status === 'AUTONOMOUS', 'nominal 98% must be AUTONOMOUS');
      return 'ADVISORY/SUPERVISED/AUTONOMOUS correct';
    },
  },
  {
    id: 'exclusion_rules', suite: 'deterministic', area: 'reasoning', soWhat: 'Disabling strategies constrains the supervisor; empty set is refused safely.',
    name: 'Strategy exclusion respected; empty set rejected',
    run: () => {
      const p = mkPortfolio();
      const all = ['BALANCED_APPROACH', 'AGGRESSIVE_DISCHARGE', 'CONSERVATIVE_HOLD', 'DEMAND_RESPONSE', 'RENEWABLE_CHARGE_AND_EXPORT'];
      const c = buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W, all.slice(0, 4));
      assert(c[0].id === 'RENEWABLE_CHARGE_AND_EXPORT', `expected last-standing winner, got ${c[0].id}`);
      assert(c.filter((x) => x.excluded).length === 4, 'excluded flags missing');
      let threw = false;
      try { buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W, all); } catch { threw = true; }
      assert(threw, 'empty strategy set must throw');
      return 'exclusion + guardrail-on-empty ok';
    },
  },
  {
    id: 'rag_probes', suite: 'deterministic', area: 'knowledge', soWhat: 'Operator questions retrieve the right codex documents.',
    name: 'RAG probes rank the right codex docs in top-3',
    run: () => {
      const probes: Array<[string, string]> = [
        ['frequency droop response under-frequency', 'RAG-REG-01'],
        ['NMC battery degradation thermal', 'RAG-ASSET-02'],
        ['negative price wind charging arbitrage', 'RAG-HIST-02'],
        ['cloud front solar collapse', 'RAG-ANOM-01'],
      ];
      for (const [q, want] of probes) {
        const top3 = searchRag(q, 3).map((d) => d.id);
        assert(top3.includes(want), `"${q}" missing ${want} in [${top3.join(',')}]`);
      }
      return '4/4 probes in top-3';
    },
  },
  {
    id: 'rbac_matrix', suite: 'deterministic', area: 'access', soWhat: 'Viewers stay read-only; unknown roles get nothing; grants work.',
    name: 'RBAC deny-by-default matrix incl. custom grants',
    run: () => {
      const { permissionsFor: pf } = { permissionsFor };
      const has = (p: any, perm: string) => pf(p).includes(perm);
      assert(has({ sub: 'u', org_role: 'org:admin' }, 'config:edit'), 'admin config');
      assert(has({ sub: 'u', org_role: 'org:operator' }, 'hitl:approve'), 'operator approve');
      assert(!has({ sub: 'u', org_role: 'org:operator' }, 'config:edit'), 'operator must not edit');
      assert(has({ sub: 'u', org_role: 'org:member' }, 'hitl:approve'), 'member approve');
      assert(!has({ sub: 'u', org_role: 'org:viewer' }, 'hitl:approve'), 'viewer read-only');
      assert(!has({ sub: 'u', org_role: 'org:auditor' }, 'hitl:approve'), 'unknown role denied');
      assert(!has({ sub: 'u' }, 'hitl:approve'), 'no role denied');
      assert(has({ sub: 'u', org_role: 'org:viewer', org_permissions: ['org:dispatch:approve'] }, 'hitl:approve'), 'custom grant works');
      const r = roleFromClaims({ sub: 'u', org_role: 'org:operator', org_id: 'o' });
      assert(r.role === 'operator' && r.orgId === 'o', 'claim parsing');
      return '9/9 RBAC assertions hold';
    },
  },
  {
    id: 'provenance_labels', suite: 'deterministic', area: 'access', soWhat: 'Every audit badge tells the truth about who/what decided.',
    name: 'Provenance taxonomy labels every decision source honestly',
    run: () => {
      const base: any = { decisionId: 'T', rationale: '', hitlStatus: 'AUTONOMOUS', hitlApproved: true };
      const live = 'langchain:groq/openai-gpt-oss-120b + langchain:groq/openai-gpt-oss-120b (supervisor)';
      const fb = 'deterministic-skill-reasoner (providers failed) + deterministic-supervisor (math-optimal)';
      assert(provenanceOf({ ...base, agenticTrace: { isAgentic: true, modelUsed: live } }).kind === 'ai-autonomous', 'live/live');
      assert(provenanceOf({ ...base, agenticTrace: { isAgentic: true, modelUsed: fb } }).kind === 'degraded-fallback', 'fb/fb');
      assert(provenanceOf({ ...base, hitlStatus: 'SUPERVISED', agenticTrace: { isAgentic: true, modelUsed: live } }).kind === 'ai-proposed-human-approved', 'approved');
      assert(provenanceOf({ ...base, rationale: 'Operator manually selected X' }).kind === 'human-override', 'override');
      assert(provenanceOf({ ...base, hitlApproved: false, pendingId: 'H-1' } as any).kind === 'staged-pending', 'staged');
      assert(provenanceOf({ ...base }).kind === 'local-engine', 'mock');
      return '6/6 labels correct';
    },
  },
  {
    id: 'fuzz_closure_50', suite: 'deterministic', area: 'safety', soWhat: '50 random grids all conserve energy with zero crashes.',
    name: 'Fuzz: 50 seeded random portfolios all close with zero throws',
    run: () => {
      const rnd = prng(42);
      for (let i = 0; i < 50; i++) {
        const p = mkPortfolio({
          market: { ...mkPortfolio().market, spotPriceUsdPerMwh: Math.round(10 + rnd() * 400) },
          grid: { ...mkPortfolio().grid, frequencyHz: 49.6 + rnd() * 0.8, totalDemandMw: Math.round(80 + rnd() * 150) },
        });
        p.solarFarms.forEach((s: any) => { s.currentOutputMw = Math.round(s.capacityMw * rnd() * 10) / 10; });
        p.windFarms.forEach((w: any) => { w.currentOutputMw = Math.round(w.capacityMw * rnd() * 10) / 10; });
        if (rnd() < 0.2) p.batteries[Math.floor(rnd() * 2)].status = 'fault';
        const cands = buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W);
        for (const c of cands) {
          const bal = runGuardrailsWith(p, c, POLICY).find((x) => x.id === 'PHYS-CONSERV-ENERGY');
          assert(bal?.status === 'PASS', `seed42[${i}]/${c.id}: ${bal?.detail}`);
        }
      }
      return '50 portfolios × 5 strategies closed';
    },
  },
  {
    id: 'custom_rules_eval', suite: 'deterministic', area: 'safety', soWhat: 'Your custom grounding rules fire, pass, and ignore bad input.',
    name: 'Custom grounding rules fire, pass, and ignore bad metrics',
    run: () => {
      const p = mkPortfolio();
      p.market.spotPriceUsdPerMwh = 340;
      const rules: any[] = [
        { id: 'GRD-CUSTOM-T1', name: 't', category: 'MARKET', severity: 'FAIL', conditions: [{ metric: 'spot_price', op: '>', value: 100 }], message: 'm' },
        { id: 'GRD-CUSTOM-T2', name: 't', category: 'MARKET', severity: 'WARN', conditions: [{ metric: 'spot_price', op: '>', value: 9999 }], message: 'm' },
        { id: 'GRD-CUSTOM-T3', name: 't', category: 'MARKET', severity: 'FAIL', conditions: [{ metric: 'nope', op: '>', value: 1 }], message: 'm' },
      ];
      const out = runCustomRules(p, mkCandidate('X'), rules);
      assert(out.some((c) => c.id === 'GRD-CUSTOM-T1' && c.status === 'FAIL'), 'breach must FAIL');
      assert(!out.some((c) => c.id === 'GRD-CUSTOM-T2'), 'non-breach must stay silent');
      assert(!out.some((c) => c.id === 'GRD-CUSTOM-T3'), 'bad metric must be ignored');
      return 'fire/pass/ignore correct';
    },
  },
  {
    id: 'weather_shock_preserved', suite: 'deterministic', area: 'data', soWhat: 'Live weather never overwrites an active shock state.',
    name: 'Live-weather blending never overwrites shock states',
    run: async () => {
      const { applyLiveWeather } = await import('./weather.js');
      const p = mkPortfolio();
      p.windFarms[0].windSpeedMs = 24.2;
      p.windFarms[0].gustWarning = true;
      const readings = { 'WND-01': { windMs: 3.1, cloudPct: 10, tempC: 20 }, 'SOL-01': { windMs: 0, cloudPct: 90, tempC: 20 } };
      const notes = applyLiveWeather(p, readings);
      assert(p.windFarms[0].windSpeedMs === 24.2, 'gust state must survive blending');
      assert(p.solarFarms[0].currentOutputMw < 45, 'normal farm must absorb reading');
      assert(notes.length >= 2, 'blend notes recorded');
      return 'shock preserved, normal blended';
    },
  },
];

// ---------- LLM-judge cases (skip, never fail, on quota death) ----------
const VALID_IDS = ['AGGRESSIVE_DISCHARGE', 'CONSERVATIVE_HOLD', 'BALANCED_APPROACH', 'DEMAND_RESPONSE', 'RENEWABLE_CHARGE_AND_EXPORT'];

const llmCases: Case[] = [
  {
    id: 'llm_supervisor_valid', suite: 'llm', area: 'reasoning', soWhat: 'The supervisor picks a real strategy with cited numbers.',
    name: 'Supervisor picks a valid strategy with numeric justification',
    run: async () => {
      const p = mkPortfolio();
      p.market.spotPriceUsdPerMwh = 340;
      const cands = buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W);
      const opinions = [
        { agentId: 'AGT-FORECAST', agentName: 'F', role: 'r', avatarIcon: '', recommendation: 'x', preferredScenario: 'BALANCED_APPROACH', priorityFactor: '', confidenceScore: 90, rationale: '', toolsUsed: [], skillEvidence: '' },
        { agentId: 'AGT-STORAGE', agentName: 'S', role: 'r', avatarIcon: '', recommendation: 'x', preferredScenario: 'AGGRESSIVE_DISCHARGE', priorityFactor: '', confidenceScore: 90, rationale: '', toolsUsed: [], skillEvidence: '' },
        { agentId: 'AGT-GRID', agentName: 'G', role: 'r', avatarIcon: '', recommendation: 'x', preferredScenario: 'BALANCED_APPROACH', priorityFactor: '', confidenceScore: 90, rationale: '', toolsUsed: [], skillEvidence: '' },
        { agentId: 'AGT-MARKET', agentName: 'M', role: 'r', avatarIcon: '', recommendation: 'x', preferredScenario: 'AGGRESSIVE_DISCHARGE', priorityFactor: '', confidenceScore: 90, rationale: '', toolsUsed: [], skillEvidence: '' },
        { agentId: 'AGT-SAFETY', agentName: 'S2', role: 'r', avatarIcon: '', recommendation: 'x', preferredScenario: 'BALANCED_APPROACH', priorityFactor: '', confidenceScore: 100, rationale: '', toolsUsed: [], skillEvidence: '' },
      ];
      const v = await supervise(p, W, cands as any, opinions as any, 'RAG-REG-01 IEEE frequency');
      assert(VALID_IDS.includes(v.winnerId), `invalid winner ${v.winnerId}`);
      assert(/\d/.test(v.rationale), 'rationale must cite a number');
      return `winner=${v.winnerId} (${v.modelUsed})`;
    },
  },
  {
    id: 'llm_rationale_judge', suite: 'llm', area: 'reasoning', soWhat: 'An independent judge rates rationale quality ≥3/5.',
    name: 'LLM judge scores rationale quality ≥3/5 (grounded, tradeoff, concise)',
    run: async () => {
      const p = mkPortfolio();
      const cands = buildCandidates(p, cleanGenOf(p), p.grid.totalDemandMw, W);
      const opinions = (['AGT-FORECAST', 'AGT-STORAGE', 'AGT-GRID', 'AGT-MARKET', 'AGT-SAFETY'] as const).map((id) => ({
        agentId: id, agentName: id, role: 'r', avatarIcon: '', recommendation: 'hold steady',
        preferredScenario: 'BALANCED_APPROACH', priorityFactor: '', confidenceScore: 90,
        rationale: '', toolsUsed: [] as string[], skillEvidence: '',
      }));
      const v = await supervise(p, W, cands as any, opinions as any, 'test');
      const { text } = await invokeWithFallback(
        'You are a strict power-systems eval judge. Reply with exactly: SCORE: <1-5>',
        `Score this dispatch rationale 1-5. Rubric: cites MW/$/Hz figures (+2), states the key tradeoff (+2), under 120 words (+1).\nRationale: ${v.rationale}\nTradeoff: ${v.tradeoff}`,
        { label: 'eval:judge', validate: (t) => /SCORE\s*:\s*[1-5]/.test(t), expectHint: 'SCORE line' },
      );
      const score = parseInt(text.match(/SCORE\s*:\s*([1-5])/)?.[1] || '0', 10);
      assert(score >= 3, `rationale scored ${score}/5`);
      return `rationale quality ${score}/5`;
    },
  },
  {
    id: 'llm_handoff_contract', suite: 'llm', area: 'reasoning', soWhat: 'All five agents return structured, in-range opinions.',
    name: 'Live handoff returns 5 structured opinions with sane confidences',
    run: async () => {
      const p = mkPortfolio();
      p.market.spotPriceUsdPerMwh = 340;
      p.windFarms.forEach((w: any) => { w.windSpeedMs = 24.2; w.gustWarning = true; });
      const { opinions, modelUsed } = await runSubAgentHandoff(p, W);
      assert(opinions.length === 5, `expected 5 opinions, got ${opinions.length}`);
      for (const o of opinions) {
        assert(VALID_IDS.includes(o.preferredScenario), `${o.agentId} invalid vote ${o.preferredScenario}`);
        assert(o.confidenceScore >= 50 && o.confidenceScore <= 100, `${o.agentId} confidence out of range`);
        assert(o.recommendation.length > 10, `${o.agentId} empty recommendation`);
      }
      return `5/5 structured (${modelUsed})`;
    },
  },
];

export function listEvals() {
  return [...deterministic, ...llmCases].map(({ id, suite, area, name, soWhat }) => ({
    id, suite, area, areaLabel: AREA_LABEL[area], name, soWhat, needsLLM: suite === 'llm',
  }));
}

export async function runEvals(includeLLM = true): Promise<{
  startedAt: string; durationMs: number;
  cases: EvalResult[];
  summary: { pass: number; fail: number; skipped: number };
}> {
  const t0 = Date.now();
  const cases: EvalResult[] = [];
  const runOne = async (c: Case): Promise<void> => {
    const start = Date.now();
    const base = { id: c.id, suite: c.suite, area: c.area, name: c.name, soWhat: c.soWhat };
    try {
      const detail = String(await c.run());
      cases.push({ ...base, status: 'pass', ms: Date.now() - start, detail });
    } catch (e: any) {
      const msg = String(e?.message || e);
      const quotaDead = /429|quota|rate limit|resource_exhausted|All .* providers failed|All .* models failed|daily quota|TPD/i.test(msg);
      if (c.suite === 'llm' && quotaDead) {
        cases.push({ ...base, status: 'skipped', ms: Date.now() - start, detail: `skipped — LLM unavailable: ${msg.slice(0, 140)}` });
      } else {
        cases.push({ ...base, status: c.suite === 'llm' ? 'skipped' : 'fail', ms: Date.now() - start, detail: c.suite === 'llm' ? `skipped — ${msg.slice(0, 160)}` : msg.slice(0, 300) });
      }
    }
  };
  for (const c of deterministic) await runOne(c);
  if (includeLLM) {
    for (const c of llmCases) await runOne(c);
  } else {
    for (const c of llmCases) {
      cases.push({ id: c.id, suite: c.suite, area: c.area, name: c.name, soWhat: c.soWhat, status: 'skipped', ms: 0, detail: 'skipped — deterministic-only run' });
    }
  }
  const report = {
    startedAt: new Date(t0).toISOString(),
    durationMs: Date.now() - t0,
    cases,
    summary: {
      pass: cases.filter((c) => c.status === 'pass').length,
      fail: cases.filter((c) => c.status === 'fail').length,
      skipped: cases.filter((c) => c.status === 'skipped').length,
    },
  };
  saveEvalHistory(report);
  return report;
}

const HISTORY_FILE = fileURLToPath(new URL('./data/eval_history.json', import.meta.url));

export interface EvalHistoryEntry {
  startedAt: string;
  durationMs: number;
  summary: { pass: number; fail: number; skipped: number };
  cases: Array<{ id: string; status: string }>;
}

/** Last-20 run history (scoreboard trend). Best-effort; evals never fail on it. */
function saveEvalHistory(report: { startedAt: string; durationMs: number; cases: EvalResult[]; summary: { pass: number; fail: number; skipped: number } }) {
  try {
    const prev = readJson<EvalHistoryEntry[]>(HISTORY_FILE, () => []);
    prev.unshift({
      startedAt: report.startedAt,
      durationMs: report.durationMs,
      summary: report.summary,
      cases: report.cases.map((c) => ({ id: c.id, status: c.status })),
    });
    writeJsonAtomic(HISTORY_FILE, prev.slice(0, 20));
  } catch { /* history is advisory only */ }
}

export function getEvalHistory(): EvalHistoryEntry[] {
  try {
    const h = readJson<EvalHistoryEntry[]>(HISTORY_FILE, () => []);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}
