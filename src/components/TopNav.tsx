import React from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Zap,
  ShieldCheck,
  Activity,
  Layers,
  FileText,
  Sliders,
  Sparkles,
  Leaf,
  Bot,
  Cpu,
  Brain,
  Bell,
  Settings,
  Scale,
} from 'lucide-react';
import { HITLStatus } from '../types/orchestrator';
import { AuthSlot } from '../auth/ClerkWrapper';
import { ThemeToggle } from '../theme/Theme';

export type TabId = 'command' | 'scenarios' | 'carbon' | 'intelligence' | 'alerts' | 'knowledge';

interface TopNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  onStepCycle: () => void;
  onReset: () => void;
  onOpenGauntlet: () => void;
  onOpenPortfolioModal: () => void;
  onOpenGroundingModal: () => void;
  cycleCount: number;
  simTime: string;
  hitlStatus: HITLStatus;
  confidencePct: number;
  decisionMode: 'mock' | 'agentic';
  onToggleDecisionMode: (mode: 'mock' | 'agentic') => void;
  carbonAvoidedTons?: number;
  activeAlertsCount?: number;
  criticalAlertsCount?: number;
  canOperate?: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  isPlaying,
  setIsPlaying,
  onStepCycle,
  onReset,
  onOpenGauntlet,
  onOpenPortfolioModal,
  onOpenGroundingModal,
  cycleCount,
  simTime,
  hitlStatus,
  confidencePct,
  decisionMode,
  onToggleDecisionMode,
  carbonAvoidedTons = 18.5,
  activeAlertsCount = 0,
  criticalAlertsCount = 0,
  canOperate = true,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-page/95 backdrop-blur border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Row 1: brand + identity */}
        <div className="flex items-center justify-between h-14">
          {/* Zone 1: Single text element Brand Title wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-em">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base font-semibold text-paper tracking-tight">
                Renewable Energy Orchestrator
              </span>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="text-em font-mono">15m Dispatch</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{simTime}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Cycle #{cycleCount}</span>
                <span aria-hidden="true">·</span>
                <span className="text-em font-mono flex items-center gap-0.5">
                  <Leaf className="w-3 h-3" />+{carbonAvoidedTons.toFixed(1)}t
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums px-1.5 py-px rounded border ${
                    hitlStatus === 'AUTONOMOUS'
                      ? 'text-em border-emerald-500/30 bg-emerald-500/10'
                      : hitlStatus === 'SUPERVISED'
                        ? 'text-am border-amber-500/30 bg-amber-500/10'
                        : 'text-ro border-rose-500/30 bg-rose-500/10'
                  }`}
                  title={`Governance tier: ${hitlStatus} — decision confidence ${confidencePct}%`}
                >
                  {hitlStatus} · {confidencePct}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <AuthSlot />
          </div>
        </div>

        {/* Row 2: views (left) + demo controls (right) — scrolls instead of crowding */}
        <div className="flex items-center justify-between gap-3 py-2 border-t border-line/60">
          {/* Zone 2: Navigation Links (Clean text links with hover states) */}
          <nav className="flex items-center gap-1 bg-panel/60 p-1 rounded-lg border border-line overflow-x-auto flex-nowrap w-full [&>button]:shrink-0">
            <button
              onClick={() => setActiveTab('command')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'command'
                  ? 'bg-raise text-paper shadow-sm'
                  : 'text-muted hover:text-paper'}`}
            >
              <Zap className="w-3.5 h-3.5 text-em" />
              <span>Command</span>
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${activeTab === 'scenarios'
                  ? 'bg-raise text-paper shadow-sm'
                  : 'text-muted hover:text-paper'}`}
            >
              Scenarios
            </button>
            <button
              onClick={() => setActiveTab('carbon')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'carbon'
                  ? 'bg-emerald-950/60 text-em border border-emerald-500/40 shadow-sm'
                  : 'text-em hover:text-em'
              }`}
            >
              <Leaf className="w-3.5 h-3.5 text-em" />
              <span>Carbon</span>
            </button>
            <button
              onClick={() => setActiveTab('intelligence')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'intelligence'
                  ? 'bg-cyan-950/60 text-cy border border-cyan-500/40 shadow-sm'
                  : 'text-cy hover:text-cy'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-cy" />
              <span>Intelligence</span>
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'alerts'
                  ? 'bg-amber-950/60 text-am border border-amber-500/40 shadow-sm'
                  : 'text-am hover:text-am'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-am" />
              <span>Alerts</span>
              {activeAlertsCount > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 rounded-full font-bold ${
                    criticalAlertsCount > 0 ? 'bg-rose-500 text-onaccent' : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {activeAlertsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'knowledge'
                  ? 'bg-purple-950/60 text-pu border border-purple-500/40 shadow-sm'
                  : 'text-pu hover:text-pu'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-pu" />
              <span>Knowledge</span>
            </button>
          </nav>

        </div>

        {/* Row 3: demo controls on their own level */}
        <div className="flex items-center gap-2 overflow-x-auto flex-nowrap py-2 border-t border-line/60 [&>button]:shrink-0 [&>div]:shrink-0">
          {/* Zone 3: Primary operational controls + Quick Modals */}
            {/* Quick Engine Mode Switch */}
            <div className="hidden sm:flex items-center bg-panel border border-line rounded-lg p-0.5 text-[11px]">
              <button
                onClick={() => onToggleDecisionMode('mock')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  decisionMode === 'mock'
                    ? 'bg-raise text-paper font-semibold shadow-xs'
                    : 'text-muted hover:text-paper'
                }`}
                title="Use fast local mock simulation engine"
              >
                Mock
              </button>
              <button
                onClick={() => onToggleDecisionMode('agentic')}
                className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                  decisionMode === 'agentic'
                    ? 'bg-cyan-600 text-onaccent font-semibold shadow-xs'
                    : 'text-muted hover:text-paper'
                }`}
                title="Backend LangChain agent workflow (Gemini/Groq) with guardrails + HITL"
              >
                <Sparkles className="w-2.5 h-2.5 text-cy" />
                <span>Agentic</span>
              </button>
            </div>

            {/* Portfolio Management Modal Trigger */}
            <button
              onClick={onOpenPortfolioModal}
              disabled={!canOperate}
              className="p-1.5 text-soft hover:text-paper bg-panel border border-line rounded-lg hover:bg-raise transition-colors flex items-center gap-1 text-xs disabled:opacity-40"
              title="Manage portfolio assets, statuses, and ratings"
            >
              <Settings className="w-3.5 h-3.5 text-muted" />
              <span className="hidden md:inline">Portfolio</span>
            </button>

            {/* Live Data Grounding Modal Trigger */}
            <button
              onClick={onOpenGroundingModal}
              className="p-1.5 text-em hover:text-em bg-emerald-500/10 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors flex items-center gap-1 text-xs font-mono font-medium"
              title="Inspect live mathematical power balance and physics grounding"
            >
              <Scale className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Grounding</span>
            </button>

            {/* Play/Pause Button */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!canOperate}
              className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-40 ${
                isPlaying
                  ? 'bg-amber-500/10 text-am border border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-emerald-600 text-onaccent hover:bg-emerald-500'
              }`}
              title={isPlaying ? 'Pause Autonomous Dispatch' : 'Run Autonomous 15m Dispatch'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Dispatch'}</span>
            </button>

            {/* Step +15m Button */}
            <button
              onClick={onStepCycle}
              disabled={!canOperate}
              className="px-3 py-1.5 text-xs font-medium text-paper bg-panel border border-line rounded hover:bg-raise transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
              title="Advance exactly one 15-minute dispatch cycle"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Step 15m</span>
            </button>

            {/* Gauntlet Simulation Button */}
            <button
              onClick={onOpenGauntlet}
              disabled={!canOperate}
              className="px-3 py-1.5 text-xs font-medium text-cy bg-cyan-950/40 border border-cyan-800/40 rounded hover:bg-cyan-900/40 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cy" />
              <span className="hidden sm:inline">Gauntlet (24)</span>
            </button>

            {/* Reset */}
            <button
              onClick={onReset}
              disabled={!canOperate}
              className="p-1.5 text-muted hover:text-paper bg-panel border border-line rounded transition-colors disabled:opacity-40"
              title="Reset portfolio to baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
      </div>
    </header>
  );
};
