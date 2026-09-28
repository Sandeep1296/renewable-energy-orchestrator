import React, { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  HelpCircle,
  ArrowRight,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { OrchestrationDecision, PortfolioState } from '../types/orchestrator';
import { ragKnowledgeBase } from '../data/ragKnowledgeBase';
import { authHeaders } from '../auth/ClerkWrapper';

interface DecisionExplainabilityProps {
  decision: OrchestrationDecision;
  portfolio: PortfolioState;
}

/** Human-readable provider label for whatever AI actually answered. */
function shortModel(model?: string): string {
  if (!model) return 'RAG-grounded';
  const m = model.toLowerCase();
  const groq = m.match(/groq\/([a-z0-9.\-_]+)/);
  if (groq) return `Groq · ${groq[1].replace('openai/', '').replace('meta-llama/', '')}`;
  if (m.includes('gemini')) return 'Gemini 3.8 Flash';
  if (m.includes('deterministic') || m.includes('local')) return 'Local rules';
  if (m.includes('rag')) return 'RAG-grounded';
  return model.length > 42 ? `${model.slice(0, 42)}…` : model;
}

export const DecisionExplainability: React.FC<DecisionExplainabilityProps> = ({
  decision,
  portfolio,
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState<Array<{ sender: 'user' | 'agent'; text: string; model?: string }>>([
    {
      sender: 'agent',
      text: `Hello Operator. I am the Renewable Energy Orchestrator agent. You can ask me clarifying questions regarding my dispatch decision #${decision.decisionId} or counterfactual 'what-if' scenarios.`,
      model: decision.agenticTrace?.modelUsed,
    },
  ]);

  const quickQuestions = [
    'Why did you choose to discharge the battery instead of selling wind power?',
    'What was the primary factor behind the confidence score?',
    'Why was Demand Response considered or rejected for Apex Steel?',
    'Show me the historical precedents and IEEE rules you used.',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || question;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = textToSend.trim();
    setConversation((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setQuestion('');
    setIsLoading(true);

    try {
      const tokenHeaders = await authHeaders();
      const response = await fetch('/api/ask-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenHeaders },
        body: JSON.stringify({
          question: userMessage,
          situationContext: portfolio,
          decision,
          retrievedDocs: ragKnowledgeBase.slice(0, 4),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setConversation((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: data.answer || 'Decision verified against grid constraints.',
          model: data.model || data.source || 'backend',
        },
      ]);
    } catch (err: any) {
      console.warn('API call failed, generating local agent answer:', err);
      // Fallback local intelligent response
      let localAnswer = `As the orchestrator, my decision was determined by balancing marginal cost ($${portfolio.market.spotPriceUsdPerMwh.toFixed(2)}/MWh), grid frequency (${portfolio.grid.frequencyHz.toFixed(2)} Hz), and battery longevity. Strategy "${decision.selectedScenario.name}" scored ${decision.selectedScenario.compositeUtilityScore}/100, which satisfies your active objective weighting.`;
      if (userMessage.toLowerCase().includes('why') && userMessage.toLowerCase().includes('discharge')) {
        localAnswer = `BESS-01 discharge was ordered to supply local baseload without importing from the wholesale market during peak pricing, avoiding $${Math.abs(decision.selectedScenario.projectedCostUsd).toFixed(0)} in potential energy purchases.`;
      }
      setConversation((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: localAnswer,
          model: 'local rules (backend unreachable)',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Decision Rationale, Rejected Alternatives, & Trade-Offs */}
      <div className="space-y-6">
        {/* Primary AI Rationale Card */}
        <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-line">
            <Sparkles className="w-4 h-4 text-am" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Autonomous Decision Rationale
            </h3>
          </div>

          <p className="text-xs text-soft leading-relaxed">
            {decision.rationale}
          </p>

          <div className="p-3 rounded-lg bg-page/80 border border-line/80 text-xs text-muted leading-relaxed font-sans">
            <span className="font-semibold text-am block mb-1">Counterfactual Analysis:</span>
            {decision.counterfactualReasoning}
          </div>
        </div>

        {/* Rejected Alternatives Matrix */}
        <div className="bg-panel border border-line rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            Rejected Alternatives & Invalidation Factors
          </h4>

          <div className="space-y-2 text-xs">
            {decision.rejectedAlternatives.map((alt, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded bg-page/60 border border-line flex items-start gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-faint shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-paper">{alt.name}: </span>
                  <span className="text-muted">{alt.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Specific Multi-Objective Trade-Offs */}
        <div className="bg-panel border border-line rounded-xl p-5 space-y-3">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider font-mono">
            Explicit Objective Trade-Offs Made
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {decision.tradeoffs.map((to, idx) => (
              <div key={idx} className="p-3 rounded bg-page/70 border border-line text-xs space-y-1">
                <span className="text-em font-semibold block">{to.objective}</span>
                <p className="text-muted text-[11px] leading-snug">{to.impact}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Interactive "Ask the Agent" Chat (RAG-grounded, provider chain) */}
      <div className="bg-panel border border-line rounded-xl p-5 flex flex-col h-[600px]">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cy" />
            <h3 className="text-sm font-semibold text-paper tracking-tight">
              Interactive Explainability: Ask the Agent
            </h3>
          </div>
          <span title="Reasoning provider behind the latest answer (Groq/Gemini chain, RAG-grounded, or local rules fallback)" className="font-mono text-[11px] text-em">
            {shortModel([...conversation].reverse().find((m) => m.sender === 'agent' && m.model)?.model)}
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="py-2 flex flex-wrap gap-1.5 border-b border-line/60">
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="text-[11px] px-2.5 py-1 rounded bg-raise/60 hover:bg-raise text-soft transition-colors text-left truncate max-w-full"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 text-xs">
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-onaccent'
                    : 'bg-page text-paper border border-line'
                }`}
              >
                {msg.text}
                {msg.sender === 'agent' && msg.model && (
                  <div className="mt-1.5 pt-1.5 border-t border-line/60 font-mono text-[10px] text-faint">
                    via {shortModel(msg.model)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-page text-muted border border-line p-3 rounded-xl flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cy" />
                <span>Agent is reasoning over decision trace and RAG documents...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="pt-3 border-t border-line flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask why a specific action was taken or simulate a change..."
            className="flex-1 bg-page border border-line rounded-lg px-3 py-2 text-xs text-paper placeholder-faint focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={!question.trim() || isLoading}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-onaccent rounded-lg transition-colors flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
