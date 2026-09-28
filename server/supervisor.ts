import type { Candidate } from './scenarios.js';
import type { SubAgentResult } from './subagents.js';
import { invokeWithFallback } from './llm.js';

/** LangChain supervisor: reasons over sub-agent handoffs + grounded candidate math.
 *  The LLM may ONLY select among precomputed candidates and justify — never invent MW/$. */

const VALID = ['AGGRESSIVE_DISCHARGE', 'CONSERVATIVE_HOLD', 'BALANCED_APPROACH', 'DEMAND_RESPONSE', 'RENEWABLE_CHARGE_AND_EXPORT'];

export interface SupervisorVerdict {
  winnerId: string;
  rationale: string;
  tradeoff: string;
  counterfactual: string;
  modelUsed: string;
}

export async function supervise(
  portfolio: any, weights: any, candidates: Candidate[], opinions: SubAgentResult[], ragSummary: string,
): Promise<SupervisorVerdict> {
  const eligible = candidates.filter((c) => !c.excluded);
  const mathTop = eligible[0]?.id || candidates[0]?.id || 'BALANCED_APPROACH';
  const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY);
  const votes = opinions.map((o) => `${o.agentId}=${o.preferredScenario}(${o.confidenceScore}%)`).join(' ');
  const table = eligible.map((c) => `${c.id}: util=${c.compositeUtilityScore} econ=${c.netEconomicImpactUsd} rel=${c.reliabilityScore} deg=${c.batteryDegradationScore}`).join(' | ');
  const excludedNote = candidates.some((c) => c.excluded)
    ? ` Operator-disabled (DO NOT pick): ${candidates.filter((c) => c.excluded).map((c) => c.id).join(', ')}.`
    : '';
  const fallback = (): SupervisorVerdict => {
    const w = eligible[0] || candidates[0];
    return {
      winnerId: mathTop, modelUsed: 'deterministic-supervisor (math-optimal)',
      rationale: `Supervisor confirms "${w.name}" (utility ${w.compositeUtilityScore}/100). Votes: ${votes}. Net ${w.netEconomicImpactUsd >= 0 ? '+' : ''}$${w.netEconomicImpactUsd}, reliability ${w.reliabilityScore}/100, clean utilization ${w.renewableUtilizationPct}%.`,
      tradeoff: 'Balances merchant margin against degradation and reserve headroom per active weights.',
      counterfactual: `Conservative hold would forfeit arbitrage margin; aggressive discharge would add wear without proportional gain.`,
    };
  };
  if (!hasKey) return fallback();
  try {
    const prompt = `Grid dispatch supervisor. Portfolio: demand ${portfolio.grid?.totalDemandMw}MW, freq ${portfolio.grid?.frequencyHz}Hz, spot $${portfolio.market?.spotPriceUsdPerMwh}/MWh. Weights cost=${weights.minimizeCost} rel=${weights.maximizeReliability} ren=${weights.maximizeRenewableUtilization}.
Sub-agent votes: ${votes}.
Grounded candidates: ${table}.
RAG: ${ragSummary.slice(0, 600)}
Rules: pick EXACTLY one candidate id. Math-optimal default is ${mathTop}; override only with safety justification.${excludedNote}
Reply exactly:
WINNER: <id>
WHY: <2 sentences, cite MW/Hz/$>
TRADEOFF: <1 sentence>`;
    const { text, modelUsed } = await invokeWithFallback(
      'You are a power-systems dispatch supervisor. Terse, numeric, safety-first.',
      prompt,
      { label: 'supervisor', validate: (t) => /WINNER\s*:\s*[A-Za-z_]+/.test(t), expectHint: 'WINNER line' },
    );
    const upper = text.toUpperCase();
    const winnerRaw = (text.match(/WINNER:\s*([A-Za-z_]+)/)?.[1] || mathTop).toUpperCase().replace(/[^A-Z_]/g, '');
    const winner = VALID.includes(winnerRaw) ? winnerRaw : (VALID.find((v) => upper.includes(v)) || mathTop);
    console.log(`[supervisor] ${modelUsed} winner=${winner}`);
    const why = text.match(/WHY:\s*(.+)/)?.[1]?.trim().slice(0, 500) || '';
    const tradeoff = text.match(/TRADEOFF:\s*(.+)/)?.[1]?.trim().slice(0, 300) || '';
    const fb = fallback();
    return {
      winnerId: winner,
      rationale: why || fb.rationale,
      tradeoff: tradeoff || fb.tradeoff,
      counterfactual: fb.counterfactual,
      modelUsed: `${modelUsed} (supervisor)`,
    };
  } catch (e: any) {
    console.warn('[supervisor] LangChain call failed, using math-optimal fallback:', String(e?.message || e).slice(0, 180));
    return fallback();
  }
}
