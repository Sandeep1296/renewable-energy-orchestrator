import { OrchestrationDecision } from '../types/orchestrator';

export type ProvenanceKind =
  | 'ai-autonomous'
  | 'ai-proposed-human-approved'
  | 'human-override'
  | 'staged-pending'
  | 'degraded-fallback'
  | 'local-engine';

export interface Provenance {
  kind: ProvenanceKind;
  label: string;
  detail: string;
}

function splitModels(modelUsed?: string): { handoff: string; supervisor: string } {
  const [h, s] = String(modelUsed || '').split(' + ');
  return { handoff: (h || 'unknown').trim(), supervisor: (s || 'unknown').trim() };
}

const isFallbackStage = (m: string) => /deterministic|unknown/i.test(m.trim()) || m.trim() === '';

/** Who actually made this decision: AI, human, or the local fallback engine. */
export function provenanceOf(d: OrchestrationDecision): Provenance {
  const anyD = d as any;
  if (typeof d.rationale === 'string' && d.rationale.startsWith('Operator manually selected')) {
    return { kind: 'human-override', label: 'Human override', detail: 'Operator discarded the AI ranking and enforced Conservative Hold.' };
  }
  if (anyD.pendingId && !d.hitlApproved) {
    return { kind: 'staged-pending', label: 'AI staged · awaiting approval', detail: `Plan ${anyD.pendingId} staged by agents; actuator dispatch blocked until HITL approval.` };
  }
  if (d.agenticTrace?.isAgentic) {
    const { handoff, supervisor } = splitModels(d.agenticTrace.modelUsed);
    const degraded = isFallbackStage(handoff) || isFallbackStage(supervisor);
    const by = (d as any).approvedBy ? ` by ${(d as any).approvedBy}` : '';
    if (d.hitlStatus === 'AUTONOMOUS' && d.hitlApproved) {
      if (!degraded) {
        return { kind: 'ai-autonomous', label: 'AI autonomous', detail: `5 sub-agents and the LangChain supervisor both reasoned live. Guardrails passed; dispatched without approval.` };
      }
      return { kind: 'degraded-fallback', label: 'Deterministic fallback', detail: `LLM providers were unreachable, so grounded heuristics decided (handoff: ${handoff}; supervisor: ${supervisor}). Guardrails still enforced; dispatched without approval.` };
    }
    if (d.hitlApproved) {
      if (!degraded) {
        return { kind: 'ai-proposed-human-approved', label: 'AI proposed · human approved', detail: `Agents proposed the plan live; a human operator${by} approved dispatch.` };
      }
      return { kind: 'degraded-fallback', label: 'Fallback · human approved', detail: `Heuristics stood in for unreachable LLMs (handoff: ${handoff}; supervisor: ${supervisor}); a human${by} approved dispatch.` };
    }
  }
  return { kind: 'local-engine', label: 'Local engine', detail: 'Deterministic Pareto scorer (backend unreachable or mock mode) — no LLM involved.' };
}

export const PROVENANCE_STYLE: Record<ProvenanceKind, string> = {
  'ai-autonomous': 'bg-cyan-500/10 text-cy border border-cyan-500/30',
  'ai-proposed-human-approved': 'bg-emerald-500/10 text-em border border-emerald-500/30',
  'human-override': 'bg-amber-500/10 text-am border border-amber-500/30',
  'staged-pending': 'bg-purple-500/10 text-pu border border-purple-500/30',
  'degraded-fallback': 'bg-slate-500/10 text-muted border border-linestrong',
  'local-engine': 'bg-raise text-muted border border-linestrong',
};
