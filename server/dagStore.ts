import fs from 'fs';
import path from 'path';
import { readJson, writeJsonAtomic } from './store.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const DAG_FILE = path.join(DATA_DIR, 'dag_definition.json');

export interface DagDefNode {
  id: string;
  name: string;
  phase: 'INGESTION' | 'ANALYSIS' | 'SCENARIO_MODELING' | 'OPTIMIZATION' | 'DECISION' | 'GROUNDING' | 'EXPLAINABILITY' | 'EXECUTION';
  enabled: boolean;
  dependsOn: string[];
  skillIds: string[];
  description: string;
}

export interface DagTraceNode {
  id: string;
  name: string;
  phase: DagDefNode['phase'];
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  inputsSummary: string;
  outputsSummary: string;
  dependsOn: string[];
}

const DEFAULT_DAG: DagDefNode[] = [
  { id: 'DAG-01', name: 'Data Ingestion & SCADA Telemetry', phase: 'INGESTION', enabled: true, dependsOn: [], skillIds: [], description: 'Ingest solar, wind, BESS, consumer, intertie, market feeds' },
  { id: 'DAG-02', name: 'Data Aggregation & Normalization', phase: 'INGESTION', enabled: true, dependsOn: ['DAG-01'], skillIds: [], description: 'Align to 15-min dispatch interval' },
  { id: 'DAG-03', name: 'Generation & Weather Forecast Analysis', phase: 'ANALYSIS', enabled: true, dependsOn: ['DAG-02'], skillIds: ['SOLAR_FORECAST_ANALYSIS', 'WIND_FORECAST_ANALYSIS', 'RAMP_ANOMALY_DETECTION'], description: 'Forecast agent handoff' },
  { id: 'DAG-04', name: 'Battery State & Health Optimization', phase: 'ANALYSIS', enabled: true, dependsOn: ['DAG-02'], skillIds: ['SOC_OPTIMIZATION', 'HEALTH_MONITORING'], description: 'Storage agent handoff' },
  { id: 'DAG-05', name: 'Grid Frequency & Congestion Analysis', phase: 'ANALYSIS', enabled: true, dependsOn: ['DAG-02'], skillIds: ['FREQUENCY_ANALYSIS', 'CONGESTION_DETECTION', 'STABILITY_ASSESSMENT'], description: 'Grid agent handoff' },
  { id: 'DAG-05M', name: 'Market Price & DR Analysis', phase: 'ANALYSIS', enabled: true, dependsOn: ['DAG-02'], skillIds: ['PRICE_FORECASTING', 'ARBITRAGE_OPPORTUNITY', 'DEMAND_RESPONSE_ANALYSIS'], description: 'Market agent handoff' },
  { id: 'DAG-06', name: 'Multi-Scenario Simulation', phase: 'SCENARIO_MODELING', enabled: true, dependsOn: ['DAG-03', 'DAG-04', 'DAG-05', 'DAG-05M'], skillIds: ['CHARGE_DISCHARGE_PLANNING'], description: 'Project 5 dispatch candidates' },
  { id: 'DAG-07', name: 'LangChain Supervisor Reasoning', phase: 'OPTIMIZATION', enabled: true, dependsOn: ['DAG-06'], skillIds: [], description: 'Supervisor selects winner from sub-agent handoffs' },
  { id: 'DAG-08', name: 'Grounding & Physical Validation', phase: 'GROUNDING', enabled: true, dependsOn: ['DAG-07'], skillIds: ['PHYSICAL_GROUNDING', 'REGULATORY_COMPLIANCE'], description: 'Non-bypassable hard gates' },
  { id: 'DAG-08S', name: 'Supervisor Safety Screening (prompt-guard)', phase: 'GROUNDING', enabled: true, dependsOn: ['DAG-07'], skillIds: [], description: 'Classify supervisor rationale for prompt injection; malicious vetoes execution' },
  { id: 'DAG-09', name: 'Explainability & Counterfactuals', phase: 'EXPLAINABILITY', enabled: true, dependsOn: ['DAG-08'], skillIds: [], description: 'Rationale, alternatives, trade-offs' },
  { id: 'DAG-10', name: 'Execution Planning & Preconditions', phase: 'EXECUTION', enabled: true, dependsOn: ['DAG-08'], skillIds: ['PRECONDITION_CHECK'], description: 'Stage actuator commands (no dispatch until HITL clears)' },
  { id: 'DAG-11', name: 'Command Execution (gated by HITL)', phase: 'EXECUTION', enabled: true, dependsOn: ['DAG-10'], skillIds: [], description: 'Dispatch only if AUTONOMOUS or HITL-approved' },
  { id: 'DAG-12', name: 'Audit Logging & Hash Stamp', phase: 'EXECUTION', enabled: true, dependsOn: ['DAG-11'], skillIds: [], description: 'Append-only audit trail' },
];

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadDagDefinition(): DagDefNode[] {
  ensure();
  const loaded = readJson<DagDefNode[] | null>(DAG_FILE, () => null);
  if (loaded && loaded.length > 0) {
    // Migrate persisted definitions: append nodes added in newer versions
    const known = new Set(loaded.map((n) => n.id));
    const missing = DEFAULT_DAG.filter((n) => !known.has(n.id));
    if (missing.length > 0) {
      const merged = [...loaded, ...missing];
      try {
        saveDagDefinition(merged);
      } catch { /* keep in-memory merged */ }
      return merged;
    }
    return loaded;
  }
  writeJsonAtomic(DAG_FILE, DEFAULT_DAG);
  return DEFAULT_DAG;
}

export function saveDagDefinition(def: DagDefNode[]) {
  // Validate acyclic + known deps
  const ids = new Set(def.map((n) => n.id));
  for (const n of def) {
    for (const dep of n.dependsOn) {
      if (!ids.has(dep)) throw new Error(`Unknown dependency ${dep} on node ${n.id}`);
      if (dep === n.id) throw new Error(`Self-dependency on ${n.id}`);
    }
  }
  // Cycle check (Kahn)
  const indeg = new Map<string, number>(def.map((n) => [n.id, 0]));
  def.forEach((n) => n.dependsOn.forEach((d) => indeg.set(n.id, (indeg.get(n.id) || 0) + 1)));
  const q = def.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  let visited = 0;
  const adj = new Map<string, string[]>();
  def.forEach((n) => n.dependsOn.forEach((d) => adj.set(d, [...(adj.get(d) || []), n.id])));
  while (q.length) {
    const cur = q.shift()!;
    visited++;
    for (const nxt of adj.get(cur) || []) {
      indeg.set(nxt, indeg.get(nxt)! - 1);
      if (indeg.get(nxt) === 0) q.push(nxt);
    }
  }
  if (visited !== def.length) throw new Error('DAG contains a cycle — rejected');
  // Safety nodes cannot be disabled
  const grounding = def.find((n) => n.id === 'DAG-08');
  if (grounding && !grounding.enabled) throw new Error('DAG-08 grounding gate cannot be disabled');
  ensure();
  writeJsonAtomic(DAG_FILE, def);
}

/** Execute DAG in topological order, running each node's handler. Returns timed trace. */
export async function executeDag(
  handlers: Record<string, (node: DagDefNode) => Promise<{ inputsSummary: string; outputsSummary: string }>>,
  inputSummary: (node: DagDefNode) => string = () => '',
  onProgress?: (nodeId: string, status: 'running' | 'completed' | 'failed' | 'skipped') => void,
  reportIds?: Set<string> | null,
): Promise<DagTraceNode[]> {
  const def = loadDagDefinition();
  const trace: DagTraceNode[] = [];
  const done = new Set<string>();
  const pending = [...def];
  let guard = 0;
  while (pending.length && guard++ < 100) {
    const ready = pending.filter((n) => n.dependsOn.every((d) => done.has(d)));
    if (!ready.length) throw new Error('DAG deadlock: unsatisfiable dependencies');
    for (const node of ready) {
      const idx = pending.indexOf(node);
      pending.splice(idx, 1);
      const report = !reportIds || reportIds.has(node.id);
      if (!node.enabled) {
        if (report) onProgress?.(node.id, 'skipped');
        trace.push({ id: node.id, name: node.name, phase: node.phase, status: 'skipped', durationMs: 0, inputsSummary: inputSummary(node), outputsSummary: 'Skipped by operator config', dependsOn: node.dependsOn });
        done.add(node.id);
        continue;
      }
      const t0 = Date.now();
      try {
        if (report) onProgress?.(node.id, 'running');
        const handler = handlers[node.id];
        const out = handler
          ? await handler(node)
          : { inputsSummary: inputSummary(node), outputsSummary: node.description };
        if (report) onProgress?.(node.id, 'completed');
        trace.push({ id: node.id, name: node.name, phase: node.phase, status: 'completed', durationMs: Math.max(1, Date.now() - t0), inputsSummary: out.inputsSummary, outputsSummary: out.outputsSummary, dependsOn: node.dependsOn });
      } catch (e: any) {
        if (report) onProgress?.(node.id, 'failed');
        trace.push({ id: node.id, name: node.name, phase: node.phase, status: 'failed', durationMs: Math.max(1, Date.now() - t0), inputsSummary: inputSummary(node), outputsSummary: `FAILED: ${e?.message || e}`, dependsOn: node.dependsOn });
        throw e;
      }
      done.add(node.id);
    }
  }
  return trace;
}
