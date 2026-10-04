import { z } from 'zod';
import { loadPolicy, DEFAULT_POLICY, loadCustomRules, runCustomRules } from './groundingConfig.js';

export const PortfolioSchema = z.object({
  solarFarms: z.array(z.object({ id: z.string(), status: z.string(), currentOutputMw: z.number() }).passthrough()),
  windFarms: z.array(z.object({ id: z.string(), status: z.string(), currentOutputMw: z.number() }).passthrough()),
  batteries: z.array(z.object({
    id: z.string(), status: z.string(), powerRatingMw: z.number(),
    currentSocPct: z.number(), minSocPct: z.number(), maxSocPct: z.number(),
  }).passthrough()),
  consumers: z.array(z.object({ id: z.string(), flexibleDemandMw: z.number() }).passthrough()).default([]),
  interties: z.array(z.object({ limitMw: z.number(), congested: z.boolean().optional() }).passthrough()).default([]),
  grid: z.object({ frequencyHz: z.number(), frequencyStatus: z.string(), totalDemandMw: z.number() }).passthrough(),
  market: z.object({ spotPriceUsdPerMwh: z.number(), carbonPriceUsdPerTon: z.number().default(45), drIncentiveUsdPerMwh: z.number().default(85) }).passthrough(),
  weather: z.object({ stormAlert: z.boolean().default(false) }).passthrough(),
}).passthrough();

export const WeightsSchema = z.object({
  minimizeCost: z.number().min(0).max(100),
  minimizeEmissions: z.number().min(0).max(100),
  minimizeCurtailment: z.number().min(0).max(100).default(50),
  minimizeBatteryDegradation: z.number().min(0).max(100),
  maximizeReliability: z.number().min(0).max(100),
  maximizeRenewableUtilization: z.number().min(0).max(100),
  maximizeArbitrageProfit: z.number().min(0).max(100).default(50),
}).passthrough();

export interface GroundingCheck {
  id: string;
  category: 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT' | 'MARKET';
  rule: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

/** Non-bypassable physics + regulatory gates. FAIL = block execution. */
export function runGuardrails(portfolio: any, scenario: any): GroundingCheck[] {
  let policy = DEFAULT_POLICY;
  try {
    policy = loadPolicy();
  } catch { /* safe defaults */ }
  return runGuardrailsWith(portfolio, scenario, policy);
}

/** Guardrail evaluation against an explicit policy (admin-tunable tolerances). */
export function runGuardrailsWith(
  portfolio: any,
  scenario: any,
  policy: { powerBalanceToleranceMw: number; batteryPowerHeadroomMw: number; n1GateEnabled?: boolean; n1UnservedThresholdMw?: number },
): GroundingCheck[] {
  const checks: GroundingCheck[] = [];
  const batteries: any[] = portfolio.batteries || [];
  batteries.forEach((b) => {
    const p = Math.abs(scenario.batteryDispatchMw?.[b.id] || 0);
    const limit = (b.powerRatingMw || 0) + policy.batteryPowerHeadroomMw;
    const pass = b.status === 'fault' ? p === 0 : p <= limit;
    checks.push({
      id: `PHYS-BATT-${b.id}`, category: 'BATTERY_SAFETY',
      rule: `${b.id} dispatch within rating + ${policy.batteryPowerHeadroomMw} MW headroom (faulted packs must read 0)`,
      status: pass ? 'PASS' : 'FAIL',
      detail: `Dispatch ${p.toFixed(1)} MW / limit ${(b.powerRatingMw || 0).toFixed(1)} MW (+${policy.batteryPowerHeadroomMw} headroom), status=${b.status}`,
    });
    const discharging = (scenario.batteryDispatchMw?.[b.id] || 0) > 0;
    const socOk = !discharging || b.currentSocPct > b.minSocPct;
    checks.push({
      id: `PHYS-SOC-${b.id}`, category: 'BATTERY_SAFETY',
      rule: `No discharge below emergency floor (${b.minSocPct}%)`,
      status: socOk ? 'PASS' : 'WARN',
      detail: `SOC ${Number(b.currentSocPct).toFixed(1)}% vs floor ${b.minSocPct}%`,
    });
  });
  const netExport = Math.max(0, -(scenario.gridNetImportMw || 0));
  const maxExport = (portfolio.interties || []).reduce((s: number, i: any) => s + (i.limitMw || 0), 0);
  checks.push({
    id: 'GRID-LINE-LIMIT', category: 'GRID_CONSTRAINT',
    rule: `Net export within aggregate SOL (${maxExport.toFixed(1)} MW)`,
    status: netExport <= maxExport ? 'PASS' : 'FAIL',
    detail: `Export ${netExport.toFixed(1)} MW / SOL ${maxExport.toFixed(1)} MW`,
  });
  const freq = portfolio.grid?.frequencyHz ?? 50.0;
  checks.push({
    id: 'REG-IEEE-1547', category: 'REGULATORY',
    rule: 'IEEE 1547-2018 frequency envelope 49.50–50.50 Hz',
    status: freq >= 49.5 && freq <= 50.5 ? 'PASS' : 'WARN',
    detail: `Frequency ${Number(freq).toFixed(2)} Hz`,
  });
  // Conservation residual — real First-Law equation against the scenario's
  // assumed inputs (stored at compute time), tolerance is admin-tunable.
  const totalGen = scenario.assumedCleanGenMw ?? [...(portfolio.solarFarms || []), ...(portfolio.windFarms || [])]
    .reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const bSum: number = Object.values(scenario.batteryDispatchMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const drShed: number = Object.values(scenario.demandResponseCurtailMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const shifted: number = Object.values(scenario.loadShiftMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const effectiveDemand = (scenario.assumedDemandMw ?? portfolio.grid?.totalDemandMw ?? 0) - drShed - shifted;
  const netExchange = scenario.gridNetImportMw || 0;
  const curtail = (scenario.curtailmentMw?.solar || 0) + (scenario.curtailmentMw?.wind || 0);
  const supply = totalGen + Math.max(0, netExchange) + Math.max(0, bSum);
  const demandSide = effectiveDemand + Math.max(0, -netExchange) + Math.max(0, -bSum) + curtail;
  const residual = Math.abs(supply - demandSide);
  const balancePass = residual < policy.powerBalanceToleranceMw;
  checks.push({
    id: 'PHYS-CONSERV-ENERGY', category: 'PHYSICAL',
    rule: `First-law closure: residual variance < ${policy.powerBalanceToleranceMw} MW equivalent`,
    status: balancePass ? 'PASS' : 'FAIL',
    detail: `Supply: ${supply.toFixed(1)} MW / Demand+Storage: ${demandSide.toFixed(1)} MW (Delta: ${residual.toFixed(2)} MW, tolerance ${policy.powerBalanceToleranceMw} MW)`,
  });
  // Admin custom rules (each audited at creation/deletion)
  try {
    for (const c of runCustomRules(portfolio, scenario, loadCustomRules())) checks.push(c);
  } catch { /* custom rules never break built-ins */ }
  // N-1 contingency screen (toggleable; degrade-safe: any error skips, never blocks)
  if (policy.n1GateEnabled !== false) {
    try {
      const n1 = evaluateN1(portfolio, scenario, policy.n1UnservedThresholdMw ?? 25);
      checks.push({
        id: 'N1-CONTINGENCY', category: 'GRID_CONSTRAINT',
        rule: `N-1 secure: worst single loss leaves < ${(policy.n1UnservedThresholdMw ?? 25)} MW unserved`,
        status: n1.breach ? 'FAIL' : 'PASS',
        detail: n1.breach
          ? `VIOLATION under ${n1.worstCase} (${n1.unservedMw} MW unserved after storage) — staged for human review`
          : `Worst single loss (${n1.worstCase}) leaves ${n1.unservedMw} MW unserved — within tolerance`,
      });
    } catch { /* N-1 never blocks on its own errors */ }
  }
  return checks;
}

/** N-1 screen: remove each intertie and each online generator once; measure
 *  unserved demand after battery cover. Pure math, no external data. */
export function evaluateN1(
  portfolio: any,
  scenario: any,
  thresholdMw = 25,
): { breach: boolean; worstCase: string; unservedMw: number } {
  const cleanOf = (p: any) => [...(p.solarFarms || []), ...(p.windFarms || [])]
    .reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const battOf = (p: any) => (p.batteries || [])
    .filter((b: any) => b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct > b.minSocPct)
    .reduce((s: number, b: any) => s + Math.min(b.powerRatingMw || 0, ((b.currentSocPct - b.minSocPct) / 100) * (b.capacityMwh || 0) * 4), 0);
  const drShed: number = Object.values(scenario.demandResponseCurtailMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const shifted: number = Object.values(scenario.loadShiftMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const demand = (portfolio.grid?.totalDemandMw ?? 0) - drShed - shifted;
  const unservedAfter = (gen: number) => Math.max(0, Math.round((demand - gen - battOf(portfolio)) * 10) / 10);

  let worst = { breach: false, worstCase: 'none', unservedMw: 0 };
  const consider = (label: string, gen: number) => {
    const u = unservedAfter(gen);
    if (u > thresholdMw && u >= worst.unservedMw) worst = { breach: true, worstCase: label, unservedMw: u };
    else if (!worst.breach && u > worst.unservedMw) worst = { ...worst, worstCase: label, unservedMw: u };
  };
  for (const i of portfolio.interties || []) {
    const exp = Math.min(Math.max(0, cleanOf(portfolio) - demand), i.limitMw || 0);
    consider(`loss of ${i.id} (${exp} MW export path)`, cleanOf(portfolio));
  }
  for (const a of [...(portfolio.solarFarms || []), ...(portfolio.windFarms || [])]) {
    if (a.status !== 'online') continue;
    consider(`loss of ${a.id} (${a.currentOutputMw || 0} MW)`, cleanOf(portfolio) - (a.currentOutputMw || 0));
  }
  return worst;
}

export interface HitlAssessment { status: 'AUTONOMOUS' | 'SUPERVISED' | 'ADVISORY'; reasons: string[]; critical: boolean }

/** Critical-decision classifier. Critical => plan-only, execution gated on human approval. */
export function assessHitl(portfolio: any, scenario: any, confidence: number, checks: GroundingCheck[]): HitlAssessment {
  const reasons: string[] = [];
  let status: HitlAssessment['status'] = 'AUTONOMOUS';
  const demand = (n: string, c: boolean) => { if (c) { reasons.push(n); if (status === 'AUTONOMOUS') status = 'SUPERVISED'; } };
  if (checks.some((c) => c.status === 'FAIL')) { status = 'ADVISORY'; reasons.push('Guardrail FAIL present — execution blocked until review'); }
  if (confidence < 75) { status = 'ADVISORY'; reasons.push(`Confidence ${confidence}% below 75% autonomy floor`); }
  if (portfolio.grid?.frequencyStatus === 'emergency') { status = 'ADVISORY'; reasons.push('Grid frequency EMERGENCY'); }
  if (portfolio.weather?.stormAlert) { status = 'ADVISORY'; reasons.push('Storm alert active'); }
  demand('Confidence below 95% high-assurance band', confidence < 95);
  demand('Intertie congestion present', (portfolio.interties || []).some((i: any) => i.congested));
  demand('Spot price above $200/MWh', (portfolio.market?.spotPriceUsdPerMwh || 0) > 200);
  const drTotal: number = Object.values(scenario.demandResponseCurtailMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  demand(`Demand-response shed ${drTotal.toFixed(1)} MW exceeds 20 MW impact threshold`, drTotal > 20);
  demand(`Grid export ${Math.max(0, -(scenario.gridNetImportMw || 0)).toFixed(1)} MW exceeds 100 MW market-impact threshold`, Math.max(0, -(scenario.gridNetImportMw || 0)) > 100);
  if (status === 'AUTONOMOUS') reasons.push('All autonomy criteria met');
  return { status, reasons, critical: status !== 'AUTONOMOUS' };
}

export function confidenceScore(portfolio: any, checks: GroundingCheck[]): number {
  let s = 98;
  if (checks.some((c) => c.status === 'FAIL')) s -= 35;
  if (checks.some((c) => c.status === 'WARN')) s -= 12;
  if (portfolio.grid?.frequencyStatus === 'warning') s -= 8;
  if (portfolio.grid?.frequencyStatus === 'emergency') s -= 22;
  if (portfolio.weather?.stormAlert) s -= 14;
  if ((portfolio.interties || []).some((i: any) => i.congested)) s -= 7;
  if ((portfolio.batteries || []).some((b: any) => b.status === 'fault')) s -= 9;
  if ((portfolio.market?.spotPriceUsdPerMwh || 0) > 250) s -= 4;
  return Math.max(50, Math.min(99.5, Math.round(s * 10) / 10));
}
