import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readJson, writeJsonAtomic } from './store.js';
import { appendAudit } from './hitlStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.resolve(__dirname, 'data', 'grounding_config.json');

export interface GroundingPolicy {
  /** First-law residual tolerance (MW). Bounds keep physics honest. */
  powerBalanceToleranceMw: number;
  /** Inverter headroom above nameplate before FAIL (MW). */
  batteryPowerHeadroomMw: number;
  /** N-1 contingency gate on/off. Off = skipped silently (demo-safe). */
  n1GateEnabled: boolean;
  /** Unserved MW under worst single loss that fails the plan. */
  n1UnservedThresholdMw: number;
}

export const DEFAULT_POLICY: GroundingPolicy = {
  powerBalanceToleranceMw: 1.0,
  batteryPowerHeadroomMw: 0.1,
  n1GateEnabled: true,
  n1UnservedThresholdMw: 25,
};

/** Hard bounds: admin can tune sensitivity, never physical law. */
export const POLICY_BOUNDS: Record<'powerBalanceToleranceMw' | 'batteryPowerHeadroomMw' | 'n1UnservedThresholdMw', [number, number]> = {
  powerBalanceToleranceMw: [0.1, 5.0],
  batteryPowerHeadroomMw: [0.0, 1.0],
  n1UnservedThresholdMw: [0, 200],
};

export const POLICY_DESCRIPTIONS: Record<keyof GroundingPolicy, string> = {
  powerBalanceToleranceMw: 'Max allowed supply/demand residual before the First-Law gate fails a plan.',
  batteryPowerHeadroomMw: 'Measurement headroom above inverter nameplate before a dispatch fails.',
  n1GateEnabled: 'On/off switch for N-1 contingency screening. Off skips it silently — demo-safe.',
  n1UnservedThresholdMw: 'Unserved MW under the worst single asset/intertie loss that fails a plan.',
};

export interface CustomGroundingRule {
  id: string;
  name: string;
  category: 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT' | 'MARKET';
  severity: 'WARN' | 'FAIL';
  conditions: Array<{ metric: string; op: '>' | '>=' | '<' | '<='; value: number }>;
  message: string;
  createdBy?: string;
  createdAt?: string;
}

/** Local check shape (mirrors guardrails.GroundingCheck without the import cycle). */
export interface RuleCheck {
  id: string;
  category: 'PHYSICAL' | 'REGULATORY' | 'BATTERY_SAFETY' | 'GRID_CONSTRAINT' | 'MARKET';
  rule: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

/** Closed metric vocabulary — rules reference these, never arbitrary paths. */
export const RULE_METRICS: Record<string, { label: string; unit: string }> = {
  freq_hz: { label: 'Grid frequency', unit: 'Hz' },
  demand_mw: { label: 'Total demand', unit: 'MW' },
  spot_price: { label: 'Spot price', unit: '$/MWh' },
  clean_gen_mw: { label: 'Clean generation', unit: 'MW' },
  battery_discharge_mw: { label: 'Battery discharge (plan)', unit: 'MW' },
  grid_import_mw: { label: 'Grid import (plan)', unit: 'MW' },
  grid_export_mw: { label: 'Grid export (plan)', unit: 'MW' },
  curtail_mwh: { label: 'Curtailment (plan)', unit: 'MWh' },
  dr_shed_mw: { label: 'DR shed (plan)', unit: 'MW' },
  batt_min_soc: { label: 'Lowest battery SOC', unit: '%' },
  batt_max_temp: { label: 'Hottest battery cell', unit: '°C' },
  intertie_max_load_pct: { label: 'Max intertie loading', unit: '%' },
};

export function metricValue(portfolio: any, scenario: any, metric: string): number | null {
  const batteries: any[] = portfolio.batteries || [];
  const clean = [...(portfolio.solarFarms || []), ...(portfolio.windFarms || [])]
    .reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const dis = Object.values(scenario.batteryDispatchMw || {}).filter((v: any) => v > 0).reduce((s: number, v: any) => s + v, 0);
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
    case 'dr_shed_mw': return Object.values(scenario.demandResponseCurtailMw || {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
    case 'batt_min_soc': return batteries.length ? Math.min(...batteries.map((b: any) => b.currentSocPct)) : 100;
    case 'batt_max_temp': return batteries.length ? Math.max(...batteries.map((b: any) => b.tempC || 0)) : 0;
    case 'intertie_max_load_pct': {
      const ls = (portfolio.interties || []).map((l: any) => (Math.abs(l.currentFlowMw || 0) / (l.limitMw || 1)) * 100);
      return ls.length ? Math.max(...ls) : 0;
    }
    default: return null;
  }
}

function testOp(op: string, left: number, right: number): boolean {
  switch (op) {
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    default: return false;
  }
}

/** Evaluate admin custom rules → grounding checks (breach = all conditions true). */
export function runCustomRules(portfolio: any, scenario: any, rules: CustomGroundingRule[]): RuleCheck[] {
  const out: RuleCheck[] = [];
  for (const rule of rules) {
    if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) continue;
    const parts: string[] = [];
    let breach = true;
    for (const c of rule.conditions) {
      const v = metricValue(portfolio, scenario, c.metric);
      if (v === null || !['>', '>=', '<', '<='].includes(c.op) || !Number.isFinite(Number(c.value))) {
        breach = false;
        break;
      }
      const ok = testOp(c.op, v, Number(c.value));
      parts.push(`${RULE_METRICS[c.metric]?.label || c.metric} ${v} ${c.op} ${c.value}`);
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

export function loadPolicy(): GroundingPolicy {
  try {
    const raw = readJson<Partial<GroundingPolicy>>(CONFIG_FILE, () => DEFAULT_POLICY);
    return {
      powerBalanceToleranceMw: clamp('powerBalanceToleranceMw', Number(raw.powerBalanceToleranceMw ?? DEFAULT_POLICY.powerBalanceToleranceMw)),
      batteryPowerHeadroomMw: clamp('batteryPowerHeadroomMw', Number(raw.batteryPowerHeadroomMw ?? DEFAULT_POLICY.batteryPowerHeadroomMw)),
      n1GateEnabled: raw.n1GateEnabled === undefined ? true : Boolean(raw.n1GateEnabled),
      n1UnservedThresholdMw: clamp('n1UnservedThresholdMw', Number(raw.n1UnservedThresholdMw ?? DEFAULT_POLICY.n1UnservedThresholdMw)),
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

function clamp(key: 'powerBalanceToleranceMw' | 'batteryPowerHeadroomMw' | 'n1UnservedThresholdMw', v: number): number {
  const [lo, hi] = POLICY_BOUNDS[key];
  if (!Number.isFinite(v)) throw new Error(`${key} must be a number`);
  if (v < lo || v > hi) throw new Error(`${key} must stay within [${lo}, ${hi}] (physical safety bounds)`);
  return Math.round(v * 100) / 100;
}

/** Admin-only update. Every change is audit-logged with old→new diff. */
export function updatePolicy(patch: Partial<GroundingPolicy>, by?: string): GroundingPolicy {
  const current = loadPolicy();
  const next: GroundingPolicy = { ...current };
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(patch) as Array<keyof GroundingPolicy>) {
    if (!(key in DEFAULT_POLICY)) throw new Error(`Unknown grounding parameter: ${key}`);
    if (key === 'n1GateEnabled') {
      const v = Boolean((patch as any)[key]);
      if (v !== current[key]) {
        changes[key] = [current[key], v];
        next[key] = v;
      }
      continue;
    }
    const v = clamp(key as 'powerBalanceToleranceMw' | 'batteryPowerHeadroomMw' | 'n1UnservedThresholdMw', Number((patch as any)[key]));
    if (v !== current[key]) {
      changes[key] = [current[key], v];
      next[key] = v;
    }
  }
  if (Object.keys(changes).length === 0) return current;
  if (!fs.existsSync(path.dirname(CONFIG_FILE))) fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  writeJsonAtomic(CONFIG_FILE, next);
  appendAudit({ type: 'GROUNDING_UPDATED', changes, by: by || 'unknown' });
  console.log(`[grounding] policy updated by ${by || 'unknown'}:`, JSON.stringify(changes));
  return next;
}

const RULES_FILE = path.resolve(path.dirname(CONFIG_FILE), 'grounding_rules.json');

/** Admin-created custom rules (persisted separately from tolerances). */
export function loadCustomRules(): CustomGroundingRule[] {
  try {
    const raw = readJson<CustomGroundingRule[]>(RULES_FILE, () => []);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function validateRuleInput(input: any): Omit<CustomGroundingRule, 'id' | 'createdBy' | 'createdAt'> {
  const name = String(input?.name || '').trim().slice(0, 80);
  if (!name) throw new Error('Rule name is required');
  const category = input?.category;
  if (!['PHYSICAL', 'REGULATORY', 'BATTERY_SAFETY', 'GRID_CONSTRAINT', 'MARKET'].includes(category)) {
    throw new Error('category must be PHYSICAL, REGULATORY, BATTERY_SAFETY, GRID_CONSTRAINT, or MARKET');
  }
  const severity = input?.severity;
  if (!['WARN', 'FAIL'].includes(severity)) throw new Error("severity must be 'WARN' or 'FAIL'");
  const conditions = input?.conditions;
  if (!Array.isArray(conditions) || conditions.length === 0 || conditions.length > 5) {
    throw new Error('Provide 1–5 conditions');
  }
  for (const c of conditions) {
    if (!RULE_METRICS[c?.metric]) throw new Error(`Unknown metric: ${c?.metric} (allowed: ${Object.keys(RULE_METRICS).join(', ')})`);
    if (!['>', '>=', '<', '<='].includes(c?.op)) throw new Error(`Bad operator on ${c?.metric}`);
    if (!Number.isFinite(Number(c?.value))) throw new Error(`Non-numeric value on ${c?.metric}`);
  }
  return {
    name,
    category,
    severity,
    conditions: conditions.map((c: any) => ({ metric: c.metric, op: c.op, value: Number(c.value) })),
    message: String(input?.message || 'Custom grounding threshold breached').slice(0, 240),
  };
}

export function createCustomRule(input: any, by?: string): CustomGroundingRule {
  const clean = validateRuleInput(input);
  const rules = loadCustomRules();
  const rule: CustomGroundingRule = {
    ...clean,
    id: `GRD-CUSTOM-${Date.now().toString(36).toUpperCase()}`,
    createdBy: by || 'unknown',
    createdAt: new Date().toISOString(),
  };
  rules.unshift(rule);
  writeJsonAtomic(RULES_FILE, rules.slice(0, 100));
  appendAudit({ type: 'GROUNDING_RULE_CREATED', id: rule.id, rule: { name: rule.name, severity: rule.severity, conditions: rule.conditions }, by: by || 'unknown' });
  console.log(`[grounding] custom rule created by ${by || 'unknown'}:`, rule.id, rule.name);
  return rule;
}

export function deleteCustomRule(id: string, by?: string): boolean {
  if (!id.startsWith('GRD-CUSTOM-')) throw new Error('Only custom rules (GRD-CUSTOM-*) can be deleted — built-ins are code');
  const rules = loadCustomRules();
  const found = rules.find((r) => r.id === id);
  if (!found) return false;
  writeJsonAtomic(RULES_FILE, rules.filter((r) => r.id !== id));
  appendAudit({ type: 'GROUNDING_RULE_DELETED', id, rule: { name: found.name }, by: by || 'unknown' });
  console.log(`[grounding] custom rule deleted by ${by || 'unknown'}:`, id);
  return true;
}
