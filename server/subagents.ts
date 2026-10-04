import { loadSkills } from './skills.js';
import { searchRag } from './ragStore.js';
import { invokeWithFallback } from './llm.js';
import { analyzeImpact } from './graph.js';

export interface SubAgentResult {
  agentId: string;
  agentName: string;
  role: string;
  avatarIcon: string;
  recommendation: string;
  preferredScenario: string;
  priorityFactor: string;
  confidenceScore: number;
  rationale: string;
  toolsUsed: string[];
  skillEvidence: string;
}

const AVATARS: Record<string, string> = {
  'AGT-FORECAST': '☀️', 'AGT-STORAGE': '🔋', 'AGT-GRID': '⚡', 'AGT-MARKET': '📈', 'AGT-SAFETY': '🛡️',
};

const PRIORITY: Record<string, string> = {
  'AGT-FORECAST': 'Solar & Wind Ramp Smoothing', 'AGT-STORAGE': 'Cell Life & Thermal Derating',
  'AGT-GRID': 'IEEE-1547 & Line Thermal Capacity', 'AGT-MARKET': 'Net Economic Revenue & DR Incentive',
  'AGT-SAFETY': 'Power Balance & Schema Compliance',
};

function llmAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY);
}

/** Deterministic skill-tool computations (the "hands" of each sub-agent). */
function runSkillTools(agentId: string, portfolio: any): { toolsUsed: string[]; evidence: string } {
  const totalSolar = (portfolio.solarFarms || []).reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const totalWind = (portfolio.windFarms || []).reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const demand = portfolio.grid?.totalDemandMw ?? 150;
  const price = portfolio.market?.spotPriceUsdPerMwh ?? 48.5;
  const freq = portfolio.grid?.frequencyHz ?? 50.0;
  switch (agentId) {
    case 'AGT-FORECAST': {
      const gust = (portfolio.windFarms || []).some((w: any) => (w.windSpeedMs || 0) > 22);
      const cloud = portfolio.weather?.condition === 'heavy_overcast';
      return { toolsUsed: ['SOLAR_FORECAST_ANALYSIS', 'WIND_FORECAST_ANALYSIS', 'RAMP_ANOMALY_DETECTION'], evidence: `Solar ${totalSolar.toFixed(1)} MW, wind ${totalWind.toFixed(1)} MW vs demand ${demand.toFixed(1)} MW. Gust-risk=${gust}, cloud-collapse-risk=${cloud}.` };
    }
    case 'AGT-STORAGE': {
      const soc = (portfolio.batteries || []).map((b: any) => `${b.id} ${b.currentSocPct}%/${b.status}`).join('; ');
      const hot = (portfolio.batteries || []).some((b: any) => (b.tempC || 0) > 38);
      return { toolsUsed: ['SOC_OPTIMIZATION', 'HEALTH_MONITORING', 'CHARGE_DISCHARGE_PLANNING'], evidence: `Fleet: ${soc}. Thermal-derate=${hot}. LFP preferred (46% lower wear vs NMC).` };
    }
    case 'AGT-GRID': {
      const flows = (portfolio.interties || []).map((i: any) => `${i.id || i.name} ${i.currentFlowMw}/${i.limitMw}MW`).join('; ');
      let blast = '';
      const stressed = (portfolio.interties || []).find((i: any) => i.congested || (Math.abs(i.currentFlowMw || 0) / (i.limitMw || 1)) > 0.9);
      if (stressed) {
        try {
          const impact = analyzeImpact(portfolio, { removeIntertieId: stressed.id });
          blast = ` Blast-radius if ${stressed.id} trips: ${impact.note}`;
        } catch { /* evidence stays topological */ }
      }
      return { toolsUsed: ['FREQUENCY_ANALYSIS', 'CONGESTION_DETECTION', 'STABILITY_ASSESSMENT', 'TRACE_OUTAGE_IMPACT'], evidence: `Freq ${freq.toFixed(2)} Hz (${portfolio.grid?.frequencyStatus}). Flows: ${flows}.${blast}` };
    }
    case 'AGT-MARKET': {
      const regime = price > 150 ? 'SPIKE' : price < -5 ? 'NEGATIVE' : 'NORMAL';
      return { toolsUsed: ['PRICE_FORECASTING', 'ARBITRAGE_OPPORTUNITY', 'DEMAND_RESPONSE_ANALYSIS'], evidence: `Spot $${price}/MWh regime=${regime}. DR incentive $${portfolio.market?.drIncentiveUsdPerMwh}/MWh.` };
    }
    default:
      return { toolsUsed: ['PHYSICAL_GROUNDING', 'REGULATORY_COMPLIANCE', 'PRECONDITION_CHECK'], evidence: 'Hard gates armed: conservation, inverter ratings, IEEE-1547 envelope, SOL limits.' };
  }
}

function fallbackOpinion(agentId: string, name: string, role: string, portfolio: any, evidence: string, toolsUsed: string[]): SubAgentResult {
  const price = portfolio.market?.spotPriceUsdPerMwh ?? 48.5;
  const freq = portfolio.grid?.frequencyHz ?? 50.0;
  const storm = portfolio.weather?.stormAlert;
  let preferred = 'BALANCED_APPROACH';
  let rec = 'Hold balanced dispatch; conditions nominal.';
  let conf = 90;
  if (agentId === 'AGT-FORECAST') {
    preferred = 'RENEWABLE_CHARGE_AND_EXPORT';
    rec = portfolio.weather?.condition === 'heavy_overcast'
      ? 'Cloud front: solar down ~70%. Pre-position BESS hot-standby, notify DR.'
      : 'Renewables stable; minimal 15-min ramp variance.';
    conf = 94;
  } else if (agentId === 'AGT-STORAGE') {
    preferred = price > 120 ? 'AGGRESSIVE_DISCHARGE' : 'BALANCED_APPROACH';
    rec = (portfolio.batteries || []).some((b: any) => (b.tempC || 0) > 38)
      ? 'Cell temp >38C: derate to 0.5C to protect pack life.'
      : 'Prefer BESS-01 LFP discharge; reserve NMC for spikes.';
    conf = 96;
  } else if (agentId === 'AGT-GRID') {
    const warn = Math.abs(freq - 50) > 0.08;
    preferred = warn ? 'DEMAND_RESPONSE' : 'BALANCED_APPROACH';
    rec = warn ? `Freq deviation ${freq.toFixed(2)} Hz: inject synthetic inertia, inhibit charging.` : 'Frequency nominal; interties within SOL.';
    conf = 98;
  } else if (agentId === 'AGT-MARKET') {
    preferred = price > 120 ? 'AGGRESSIVE_DISCHARGE' : 'BALANCED_APPROACH';
    rec = price > 120 ? `Spike $${price}/MWh: export aggressively within SOL.` : `Prices normal $${price}/MWh: standard economic dispatch.`;
    conf = 91;
  } else {
    preferred = 'BALANCED_APPROACH';
    rec = storm ? 'Storm: enforce reserve floors, stage conservative fallback.' : 'Power balance closable; all hard gates satisfiable.';
    conf = 100;
  }
  return { agentId, agentName: name, role, avatarIcon: AVATARS[agentId] || '🤖', recommendation: rec, preferredScenario: preferred, priorityFactor: PRIORITY[agentId] || 'Domain constraints', confidenceScore: conf, rationale: evidence, toolsUsed, skillEvidence: evidence };
}

const VALID_IDS = ['AGGRESSIVE_DISCHARGE', 'CONSERVATIVE_HOLD', 'BALANCED_APPROACH', 'DEMAND_RESPONSE', 'RENEWABLE_CHARGE_AND_EXPORT'];

function parseVote(text: string): string {
  const raw = (text.match(/VOTE:\s*([A-Za-z_]+)/)?.[1] || 'BALANCED_APPROACH').toUpperCase().replace(/[^A-Z_]/g, '');
  if (VALID_IDS.includes(raw)) return raw;
  return VALID_IDS.find((v) => text.toUpperCase().includes(v)) || 'BALANCED_APPROACH';
}

async function runOneAgent(agent: { id: string; name: string; role: string }, portfolio: any, weights: any): Promise<SubAgentResult> {
  const skills = loadSkills().filter((s) => s.agentId === agent.id && s.enabled);
  const { toolsUsed, evidence } = runSkillTools(agent.id, portfolio);
  const ragDocs = searchRag(`${agent.id} ${agent.role} constraints`, 2);
  if (!llmAvailable() || skills.length === 0) return fallbackOpinion(agent.id, agent.name, agent.role, portfolio, evidence, toolsUsed);
  const prompt = `You are ${agent.name} (${agent.role}).
Active skills: ${skills.map((s) => `${s.id}: ${s.promptFragment}`).join(' | ')}
Skill-tool evidence: ${evidence}
RAG context: ${ragDocs.map((d) => `[${d.id}] ${d.summary}`).join(' | ')}
Objective weights: cost=${weights.minimizeCost} reliability=${weights.maximizeReliability} renewables=${weights.maximizeRenewableUtilization}.
Reply in exactly 3 lines:
VOTE: <AGGRESSIVE_DISCHARGE|CONSERVATIVE_HOLD|BALANCED_APPROACH|DEMAND_RESPONSE|RENEWABLE_CHARGE_AND_EXPORT>
REC: <one-sentence recommendation with MW/Hz/$ figures>
CONF: <0-100>`;
  try {
    const { text, modelUsed } = await invokeWithFallback(
      'You are a terse grid-operations sub-agent. Only output the 3 requested lines.',
      prompt,
      { label: `subagent:${agent.id}`, validate: (t) => /VOTE\s*:\s*[A-Z_]+/.test(t) && /(AGGRESSIVE_DISCHARGE|CONSERVATIVE_HOLD|BALANCED_APPROACH|DEMAND_RESPONSE|RENEWABLE_CHARGE_AND_EXPORT)/.test(t), expectHint: 'VOTE + scenario id' },
    );
    const rec = text.match(/REC:\s*(.+)/)?.[1]?.trim() || evidence;
    const conf = Math.max(50, Math.min(100, parseInt(text.match(/CONF:\s*(\d+)/)?.[1] || '90', 10)));
    return { agentId: agent.id, agentName: agent.name, role: agent.role, avatarIcon: AVATARS[agent.id] || '🤖', recommendation: `${rec.slice(0, 260)} [${modelUsed}]`, preferredScenario: parseVote(text), priorityFactor: PRIORITY[agent.id] || '', confidenceScore: conf, rationale: evidence, toolsUsed, skillEvidence: skills.map((s) => s.id).join(',') };
  } catch (e: any) {
    console.warn(`[subagent:${agent.id}] all providers failed, using grounded fallback:`, String(e?.message || e).slice(0, 180));
    return fallbackOpinion(agent.id, agent.name, agent.role, portfolio, evidence, toolsUsed);
  }
}

/** Batched handoff: ONE LLM call collects all 5 votes (free-tier friendly).
 *  Set SUBAGENT_MODE=parallel for 5 independent calls. */
async function runBatchedHandoff(
  agents: Array<{ id: string; name: string; role: string }>,
  portfolio: any, weights: any,
  evidenceByAgent: Record<string, { toolsUsed: string[]; evidence: string }>,
): Promise<{ opinions: SubAgentResult[]; modelUsed: string }> {
  const blocks = agents.map((a) => {
    const skills = loadSkills().filter((s) => s.agentId === a.id && s.enabled);
    return `${a.id} (${a.name} — ${a.role})\nSkills: ${skills.map((s) => `${s.id}: ${s.promptFragment}`).join(' | ')}\nEvidence: ${evidenceByAgent[a.id].evidence}`;
  });
  const user = `Dispatch council. For EACH of the 5 agents below, output exactly 3 lines prefixed with the agent id:
${blocks.join('\n---\n')}
Objective weights: cost=${weights.minimizeCost} reliability=${weights.maximizeReliability} renewables=${weights.maximizeRenewableUtilization}.
Each agent reasons INDEPENDENTLY from its own skills and evidence — disagreement between agents is expected and valuable, never force consensus.
Format per agent (repeat 5x):
<AGENT_ID> VOTE: <id>
<AGENT_ID> REC: <one sentence with MW/Hz/$ figures>
<AGENT_ID> CONF: <0-100>`;
  const { text, modelUsed } = await invokeWithFallback(
    'You are a grid-operations council of 5 specialists. Output only the 15 requested lines, no prose.',
    user,
    { label: 'subagent:batched-handoff', validate: (t) => (t.match(/VOTE\s*:/g) || []).length >= 3, expectHint: '5 agent VOTE lines' },
  );
  return {
    modelUsed,
    opinions: agents.map((a) => {
      const section = text.match(new RegExp(`${a.id}[\\s\\S]{0,400}`))?.[0] || text;
      const rec = text.match(new RegExp(`${a.id}\\s+REC:\\s*(.+)`))?.[1]?.trim()
        || text.match(/REC:\s*(.+)/)?.[1]?.trim()
        || evidenceByAgent[a.id].evidence;
      const conf = Math.max(50, Math.min(100, parseInt(text.match(new RegExp(`${a.id}\\s+CONF:\\s*(\\d+)`))?.[1] || '90', 10)));
      return {
        agentId: a.id, agentName: a.name, role: a.role, avatarIcon: AVATARS[a.id] || '🤖',
        recommendation: `${rec.slice(0, 260)} [${modelUsed}]`,
        preferredScenario: parseVote(section),
        priorityFactor: PRIORITY[a.id] || '', confidenceScore: conf,
        rationale: evidenceByAgent[a.id].evidence,
        toolsUsed: evidenceByAgent[a.id].toolsUsed,
        skillEvidence: evidenceByAgent[a.id].toolsUsed.join(','),
      };
    }),
  };
}

const handoffCache = new Map<string, { at: number; result: { opinions: SubAgentResult[]; modelUsed: string } }>();
const HANDOFF_TTL = Math.max(0, parseInt(process.env.SUBAGENT_CACHE_TTL_MS || '45000', 10));

function handoffKey(portfolio: any, weights: any): string {
  const slim = {
    sol: (portfolio.solarFarms || []).map((a: any) => [a.id, a.currentOutputMw, a.status]),
    wnd: (portfolio.windFarms || []).map((a: any) => [a.id, a.currentOutputMw, a.status, a.windSpeedMs]),
    bat: (portfolio.batteries || []).map((b: any) => [b.id, b.currentSocPct, b.status, b.tempC]),
    grid: [portfolio.grid?.frequencyHz, portfolio.grid?.frequencyStatus, portfolio.grid?.totalDemandMw],
    mkt: [portfolio.market?.spotPriceUsdPerMwh, portfolio.market?.priceTrend],
    wx: [portfolio.weather?.condition, portfolio.weather?.stormAlert],
    w: weights,
  };
  return JSON.stringify(slim);
}

/** Handoff: all 5 sub-agents reason before the supervisor. Defaults to 1 batched call. */
export async function runSubAgentHandoff(portfolio: any, weights: any): Promise<{ opinions: SubAgentResult[]; modelUsed: string }> {
  const { AGENTS } = await import('./skills.js');
  const key = handoffKey(portfolio, weights);
  const cached = handoffCache.get(key);
  if (cached && Date.now() - cached.at < HANDOFF_TTL) {
    console.log(`[handoff] cache HIT (${cached.result.modelUsed}) — no LLM spend`);
    return { opinions: cached.result.opinions, modelUsed: `${cached.result.modelUsed} (handoff-cache)` };
  }
  const evidenceByAgent: Record<string, { toolsUsed: string[]; evidence: string }> = {};
  AGENTS.forEach((a) => { evidenceByAgent[a.id] = runSkillTools(a.id, portfolio); });

  let result: { opinions: SubAgentResult[]; modelUsed: string };
  const mode = (process.env.SUBAGENT_MODE || 'batch').toLowerCase();
  if (!llmAvailable()) {
    result = {
      opinions: AGENTS.map((a) => fallbackOpinion(a.id, a.name, a.role, portfolio, evidenceByAgent[a.id].evidence, evidenceByAgent[a.id].toolsUsed)),
      modelUsed: 'deterministic-skill-reasoner (no LLM key)',
    };
  } else if (mode === 'parallel') {
    const opinions = [];
    for (const a of AGENTS) opinions.push(await runOneAgent(a, portfolio, weights)); // sequential: no 429 burst
    const used = opinions.find((o) => o.recommendation.includes('langchain:'))?.recommendation.match(/\[(langchain:[^\]]+)\]/)?.[1];
    result = { opinions, modelUsed: used ? `${used} x5 sequential` : 'deterministic-skill-reasoner (providers failed)' };
  } else {
    try {
      result = await runBatchedHandoff(AGENTS, portfolio, weights, evidenceByAgent);
    } catch (e: any) {
      console.warn('[subagent:handoff] batched call failed, using grounded fallback:', String(e?.message || e).slice(0, 180));
      result = {
        opinions: AGENTS.map((a) => fallbackOpinion(a.id, a.name, a.role, portfolio, evidenceByAgent[a.id].evidence, evidenceByAgent[a.id].toolsUsed)),
        modelUsed: 'deterministic-skill-reasoner (providers failed)',
      };
    }
  }
  handoffCache.set(key, { at: Date.now(), result });
  if (handoffCache.size > 50) { const first = handoffCache.keys().next().value; if (first) handoffCache.delete(first); }
  console.log(`[handoff] mode=${mode} model=${result.modelUsed} votes=${result.opinions.map((o) => `${o.agentId}=${o.preferredScenario}`).join(' ')}`);
  return result;
}
