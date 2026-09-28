import React from 'react';
import {
  Bot,
  Cpu,
  Zap,
  Activity,
  CheckCircle2,
  Clock,
  Terminal,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { AgenticTrace, OrchestrationDecision } from '../types/orchestrator';

interface AgenticFlowPanelProps {
  decisionMode: 'mock' | 'agentic';
  onToggleDecisionMode: (mode: 'mock' | 'agentic') => void;
  decision: OrchestrationDecision;
  isLoadingAgentic: boolean;
  onRunAgenticFlow: () => void;
  canOperate?: boolean;
  strictAI?: boolean;
  onToggleStrictAI?: () => void;
}

export const AgenticFlowPanel: React.FC<AgenticFlowPanelProps> = ({
  decisionMode,
  onToggleDecisionMode,
  decision,
  isLoadingAgentic,
  onRunAgenticFlow,
  canOperate = true,
  strictAI = false,
  onToggleStrictAI,
}) => {
  const trace = decision.agenticTrace;

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-6">
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-cy" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Agentic AI Decision Engine & Backend Execution Pipeline
            </h3>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Switch between fast local mathematical simulation (Mock) and full server-side ReAct agentic reasoning (AI Agent).
          </p>
        </div>

        {/* The Requested UI Mode Switch: Mock Data vs Agentic Decision Flow */}
        <div className="flex items-center gap-3 bg-page p-1.5 rounded-xl border border-line shrink-0">
          <button
            onClick={() => onToggleDecisionMode('mock')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              decisionMode === 'mock'
                ? 'bg-raise text-paper shadow-sm'
                : 'text-muted hover:text-paper'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-am" />
            <span>Mock / Algorithmic Engine</span>
          </button>

          <button
            onClick={() => onToggleDecisionMode('agentic')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              decisionMode === 'agentic'
                ? 'bg-cyan-600 text-onaccent shadow-md'
                : 'text-muted hover:text-paper'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cy" />
            <span>Agentic AI Workflow</span>
          </button>
        </div>
      </div>

      {/* Mode Status Indicator Banner */}
      <div
        className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          decisionMode === 'agentic'
            ? 'bg-cyan-950/20 border-cyan-500/30 text-cy'
            : 'bg-amber-950/20 border-amber-500/30 text-am'
        }`}
      >
        <div className="flex items-center gap-2">
          {decisionMode === 'agentic' ? (
            <Bot className="w-4 h-4 text-cy shrink-0" />
          ) : (
            <Cpu className="w-4 h-4 text-am shrink-0" />
          )}
          <div>
            <span className="font-bold uppercase font-mono tracking-wider">
              Current Mode: {decisionMode === 'agentic' ? 'Backend Agentic AI Pipeline' : 'Deterministic Mock Engine'}
            </span>
            <p className="text-[11px] text-soft mt-0.5">
              {decisionMode === 'agentic'
                ? 'Decisions run on the backend `/api/agentic-orchestrate`: 5 skill agents → LangChain supervisor (Gemini/Groq chain) → guardrails → HITL gate.'
                : 'Decisions are computed locally via Pareto multi-objective optimization algorithms and real-time situational mock feeds.'}
            </p>
          </div>
        </div>

        {decisionMode === 'agentic' && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => onToggleStrictAI && onToggleStrictAI()}
              disabled={!canOperate}
              title={strictAI ? 'Strict AI ON: fallback decisions are held, not recorded' : 'Strict AI OFF: deterministic fallback fills in when LLMs are unreachable'}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 text-xs border ${strictAI ? 'bg-purple-600 text-onaccent border-purple-500 shadow-sm' : 'bg-panel text-muted border-linestrong hover:text-paper'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{strictAI ? 'Strict AI: ON' : 'Strict AI: OFF'}</span>
            </button>
            <button
              onClick={onRunAgenticFlow}
              disabled={isLoadingAgentic || !canOperate}
              title={canOperate ? 'Run dispatch' : 'Requires Operator role or above'}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs text-onaccent rounded-lg font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAgentic ? 'animate-spin' : ''}`} />
              <span>{isLoadingAgentic ? 'Querying Backend Agent...' : 'Trigger Agentic Dispatch'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Agentic Trace & ReAct Loop Display */}
      {trace && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cy" />
              ReAct Autonomous Agent Execution Trace
            </span>
            <div className="flex items-center gap-3">
              <span>Model: <strong className="text-cy">{trace.modelUsed}</strong></span>
              <span>·</span>
              <span>Backend Latency: <strong className="text-em">{trace.serverLatencyMs}ms</strong></span>
            </div>
          </div>

          {/* Tools Invoked Grid */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider font-mono">
              Governed Tools Executed in Sequence:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {trace.toolsInvoked.map((tool, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-page/80 border border-line space-y-1 font-mono"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cy flex items-center gap-1">
                      <Zap className="w-3 h-3 text-cy" />
                      {tool.toolName}
                    </span>
                    <span className="text-[10px] text-faint tabular-nums">
                      {tool.executionTimeMs}ms
                    </span>
                  </div>
                  <div className="text-[11px] text-muted font-sans">{tool.resultSummary}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Step-by-Step Chain of Thought */}
          <div className="p-3.5 rounded-lg bg-page border border-line space-y-2 font-mono text-xs">
            <span className="text-muted font-semibold block text-[11px] uppercase tracking-wider">
              Agent Chain-of-Thought (ReAct Trace):
            </span>
            <div className="space-y-1.5 divide-y divide-line/40">
              {trace.thoughtTrace.map((thought, idx) => {
                const isThink = thought.startsWith('[THINK]');
                const isAct = thought.startsWith('[ACT]');
                const isObserve = thought.startsWith('[OBSERVE]');
                const isGemini = thought.startsWith('[GEMINI');

                return (
                  <div
                    key={idx}
                    className={`pt-1.5 first:pt-0 leading-relaxed ${
                      isThink
                        ? 'text-cy'
                        : isAct
                        ? 'text-am'
                        : isObserve
                        ? 'text-em'
                        : isGemini
                        ? 'text-pu'
                        : 'text-soft'
                    }`}
                  >
                    {thought}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
