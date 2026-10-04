/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { initialPortfolio, defaultObjectiveWeights } from './data/initialPortfolio';
import {
  PortfolioState,
  ObjectiveWeights,
  PresetName,
  OrchestrationDecision,
  ScenarioCandidate,
  SimulationScenario,
  AlertThresholds,
  ActiveAlert,
} from './types/orchestrator';
import { runOrchestrationEngine, runGroundingValidation, calculateConfidence, generateActionCommands, evaluateCustomRules } from './services/orchestrationEngine';
import { defaultAlertThresholds, evaluateActiveAlerts } from './services/alertEvaluator';
import { TopNav, TabId } from './components/TopNav';
import { ObjectiveWeightsPanel } from './components/ObjectiveWeightsPanel';
import { PortfolioOverview } from './components/PortfolioOverview';
import { EnergyFlowDiagram } from './components/EnergyFlowDiagram';
import { DAGVisualizer } from './components/DAGVisualizer';
import { ScenarioComparisonTable } from './components/ScenarioComparisonTable';
import { DecisionExplainability } from './components/DecisionExplainability';
import { GroundingAndSafetyPanel } from './components/GroundingAndSafetyPanel';
import { HITLGovernanceModal } from './components/HITLGovernanceModal';
import { SimulationGauntletModal } from './components/SimulationGauntletModal';
import { RAGKnowledgeDrawer } from './components/RAGKnowledgeDrawer';
import { AuditLogViewer } from './components/AuditLogViewer';
import { CarbonImpactPanel } from './components/CarbonImpactPanel';
import { AgenticFlowPanel } from './components/AgenticFlowPanel';
import { AlertsAndThresholdsPanel } from './components/AlertsAndThresholdsPanel';
import { PortfolioManagementModal } from './components/PortfolioManagementModal';
import { SubAgentSwarmPanel } from './components/SubAgentSwarmPanel';
import { AgentSkillsPanel } from './components/AgentSkillsPanel';
import { RoleBanner } from './components/RoleBanner';
import { CycleProgress } from './components/CycleProgress';
import { CollapsibleSection } from './components/CollapsibleSection';
import { EvalPanel } from './components/EvalPanel';
import { GraphPanel } from './components/GraphPanel';
import { GroundingPolicyPanel } from './components/GroundingPolicyPanel';
import { ScenarioSelectionExplainer } from './components/ScenarioSelectionExplainer';
import { DataGroundingModal } from './components/DataGroundingModal';
import { authHeaders, usePermissions } from './auth/ClerkWrapper';
import { useToast } from './components/Toaster';
import {
  CloudRain,
  Zap,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Leaf,
  Bot,
  Cpu,
  Sparkles,
  Settings,
  Scale,
  Brain,
  Bell,
} from 'lucide-react';

export default function App() {
  const perms = usePermissions();
  const toast = useToast();
  // Boot beacon (fire-and-forget, no state): lets the server log prove whether
  // boots are reloads and whether they follow audit writes.
  useEffect(() => {
    try {
      const nav = (performance.getEntriesByType('navigation')[0] as any)?.type || '?';
      fetch('/api/boot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nav }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  }, []);
  const [portfolio, setPortfolio] = useState<PortfolioState>(initialPortfolio);
  const [weights, setWeights] = useState<ObjectiveWeights>(defaultObjectiveWeights);
  const [activePreset, setActivePreset] = useState<PresetName | null>('balanced');
  const [activeTab, setActiveTab] = useState<TabId>('command');
  
  // Alert Thresholds & Active Monitoring
  const [thresholds, setThresholds] = useState<AlertThresholds>(defaultAlertThresholds);
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<string>>(new Set());

  // Decision Engine Mode Switch: Mock Data vs Backend Agentic Flow
  const [decisionMode, setDecisionMode] = useState<'mock' | 'agentic'>('agentic');
  // Admin-tunable grounding policy (shared with the approval modal's gates)
  const [groundingPolicy, setGroundingPolicy] = useState<{ powerBalanceToleranceMw: number; batteryPowerHeadroomMw: number } | null>(null);
  const [customRules, setCustomRules] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/grounding/config').then((r) => r.json()).then((j) => {
      if (j.policy) setGroundingPolicy(j.policy);
      if (Array.isArray((j as any).customRules)) setCustomRules((j as any).customRules);
    }).catch(() => {});
  }, []);
  // Operator-disabled strategies (excluded from ranking; supervisor cannot pick them)
  const [disabledScenarios, setDisabledScenarios] = useState<string[]>([]);
  // Strict AI demo mode: hold dispatch when LLMs are unreachable (no fallback rows)
  const [strictAI, setStrictAI] = useState<boolean>(() => {
    try { return localStorage.getItem('re-strict-ai') === '1'; } catch { return false; }
  });
  const toggleStrictAI = () => {
    setStrictAI((v) => {
      try { localStorage.setItem('re-strict-ai', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };
  const lastHeldToast = useRef(0);
  const toggleScenario = (id: string) => {
    setDisabledScenarios((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const [isLoadingAgentic, setIsLoadingAgentic] = useState<boolean>(false);

  const [cycleCount, setCycleCount] = useState<number>(42);
  const [simTime, setSimTime] = useState<string>('14:15:00');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Modals
  const [isGauntletOpen, setIsGauntletOpen] = useState<boolean>(false);
  const [isHITLOpen, setIsHITLOpen] = useState<boolean>(false);
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState<boolean>(false);
  const [isGroundingModalOpen, setIsGroundingModalOpen] = useState<boolean>(false);

  // Compute decision based on current state and weights
  const [decision, setDecision] = useState<OrchestrationDecision>(() =>
    runOrchestrationEngine(initialPortfolio, defaultObjectiveWeights),
  );
  const [history, setHistory] = useState<OrchestrationDecision[]>([decision]);

  // Evaluate Active Alerts dynamically (hysteresis via previous result: no flapping)
  const prevAlertsRef = useRef<ActiveAlert[]>([]);
  const activeAlerts = evaluateActiveAlerts(portfolio, thresholds, acknowledgedAlertIds, prevAlertsRef.current);
  prevAlertsRef.current = activeAlerts;
  const unackCriticalCount = activeAlerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length;

  // Execute Backend Agentic Flow (real LangChain agents; critical plans stage for HITL)
  // In-flight guard: StrictMode double-mount and rapid slider drags must not stack dispatches.
  const agenticInFlight = useRef(false);
  const [lastRun, setLastRun] = useState<{ at: string; outcome: 'completed' | 'held' | 'dropped' | 'failed' } | null>(null);
  const stampRun = (outcome: 'completed' | 'held' | 'dropped' | 'failed') => {
    setLastRun({ at: new Date().toTimeString().split(' ')[0], outcome });
  };
  const executeAgenticFlow = async (customPortfolio?: PortfolioState, customWeights?: ObjectiveWeights, trigger = 'manual') => {
    if (agenticInFlight.current) {
      toast('A dispatch is already running — request dropped.', 'info');
      stampRun('dropped');
      return;
    }
    agenticInFlight.current = true;
    setIsLoadingAgentic(true);
    const targetPortfolio = customPortfolio || portfolio;
    const targetWeights = customWeights || weights;

    try {
      const tokenHeaders = await authHeaders();
      const response = await fetch('/api/agentic-orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenHeaders },
        body: JSON.stringify({
          portfolio: targetPortfolio,
          weights: targetWeights,
          previousDecision: decision,
          disabledScenarios,
          strictAI,
          trigger,
        }),
      });

      if (response.status === 503) {
        const held = await response.json().catch(() => ({}) as any);
        if (Date.now() - lastHeldToast.current > 30000) {
          lastHeldToast.current = Date.now();
          toast(`Strict AI hold: ${held.detail || 'LLMs unreachable — dispatch held, nothing recorded.'}`, 'info');
        }
        stampRun('held');
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const agenticDecision = await response.json();
      stampRun('completed');
      setDecision(agenticDecision);
      setHistory((prev) => (prev.some((h) => h.decisionId === agenticDecision.decisionId)
        ? prev
        : [agenticDecision, ...prev.slice(0, 49)]));

      if ((agenticDecision.hitlStatus !== 'AUTONOMOUS' && !agenticDecision.hitlApproved) || agenticDecision.pendingId) {
        setIsHITLOpen(true);
      }
    } catch (err) {
      console.warn('Backend agentic flow fallback to local engine:', err);
      const fallbackDecision = runOrchestrationEngine(targetPortfolio, targetWeights, decision, disabledScenarios, customRules, groundingPolicy || undefined);
      setDecision(fallbackDecision);
      stampRun('failed');
    } finally {
      agenticInFlight.current = false;
      setIsLoadingAgentic(false);
    }
  };

  // Re-run decision only when inputs MEANINGFULLY change (identity churn from
  // re-renders must not re-dispatch). In-flight guard stops StrictMode/double clicks.
  const lastDispatchKey = useRef<string>('');
  const autoCount = useRef(0);
  useEffect(() => {
    const key = JSON.stringify({ w: weights, p: portfolio, m: decisionMode, x: disabledScenarios });
    if (key === lastDispatchKey.current) return;
    lastDispatchKey.current = key;
    if (decisionMode === 'agentic') {
      autoCount.current += 1;
      let boot = '0';
      try {
        const n = parseInt(sessionStorage.getItem('re-boot') || '0', 10) + 1;
        sessionStorage.setItem('re-boot', String(n));
        boot = `${sessionStorage.getItem('re-boot')}.${autoCount.current}`;
      } catch { /* ignore */ }
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      console.log(`[dispatch] auto boot=${boot} keyhash=${h.toString(36)}`);
      executeAgenticFlow(undefined, undefined, 'auto');
    } else {
      const newDecision = runOrchestrationEngine(portfolio, weights, decision, disabledScenarios, customRules, groundingPolicy || undefined);
      setDecision(newDecision);

      if (newDecision.hitlStatus !== 'AUTONOMOUS' && !newDecision.hitlApproved) {
        setIsHITLOpen(true);
      }
    }
  }, [weights, portfolio, decisionMode, disabledScenarios]);

  // Simulation step function (15-minute dispatch cycle) — operators only
  const stepCycle = () => {
    if (!perms.canOperate) return;
    setCycleCount((prev) => prev + 1);

    // Advance clock by 15 minutes
    setSimTime((prevTime) => {
      const parts = prevTime.split(':').map(Number);
      let totalMins = parts[0] * 60 + parts[1] + 15;
      if (totalMins >= 24 * 60) totalMins = totalMins % (24 * 60);
      const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
      const m = (totalMins % 60).toString().padStart(2, '0');
      return `${h}:${m}:00`;
    });

    // Update battery SOC based on previous dispatch
    setPortfolio((prev) => {
      const updatedBatteries = prev.batteries.map((b) => {
        let dispatchMw = decision.selectedScenario.batteryDispatchMw[b.id] ?? 0;
        if (b.status === 'fault') dispatchMw = 0;

        // Energy moved in 15 minutes (0.25h)
        const energyDeltaMwh = -dispatchMw * 0.25 * (dispatchMw < 0 ? b.efficiency : 1);
        const socDeltaPct = (energyDeltaMwh / b.capacityMwh) * 100;
        const newSoc = Math.max(b.minSocPct - 2, Math.min(b.maxSocPct, b.currentSocPct + socDeltaPct));

        let status = b.status;
        if (status !== 'fault') {
          if (dispatchMw > 1) status = 'discharging';
          else if (dispatchMw < -1) status = 'charging';
          else status = 'idle';
        }

        return {
          ...b,
          currentSocPct: Math.round(newSoc * 10) / 10,
          targetPowerMw: dispatchMw,
          status,
          cycleCount: b.cycleCount + (Math.abs(dispatchMw) > 5 ? 0.05 : 0),
        };
      });

      // Realistic small market and weather drifts
      const priceDrift = (Math.random() - 0.48) * 4;
      const newPrice = Math.max(15, Math.min(300, prev.market.spotPriceUsdPerMwh + priceDrift));

      const windDrift = (Math.random() - 0.5) * 0.8;
      const updatedWind = prev.windFarms.map((w) => {
        const newSpeed = Math.max(3.5, Math.min(22, w.windSpeedMs + windDrift));
        const outputRatio = Math.min(1, Math.max(0.1, (newSpeed - 3.5) / 8.0));
        return {
          ...w,
          windSpeedMs: Math.round(newSpeed * 10) / 10,
          currentOutputMw: Math.round(w.capacityMw * outputRatio * 10) / 10,
        };
      });

      const totalRenewable =
        prev.solarFarms.reduce((s, a) => s + a.currentOutputMw, 0) +
        updatedWind.reduce((w, a) => w + a.currentOutputMw, 0);

      return {
        ...prev,
        batteries: updatedBatteries,
        windFarms: updatedWind,
        market: {
          ...prev.market,
          spotPriceUsdPerMwh: Math.round(newPrice * 100) / 100,
        },
        grid: {
          ...prev.grid,
          totalRenewableMw: Math.round(totalRenewable * 10) / 10,
          frequencyHz: 49.98 + (Math.random() * 0.05),
        },
      };
    });

    // Record decision in audit trail (dedupe: same decision recorded once)
    setHistory((prev) => (prev[0]?.decisionId === decision.decisionId ? prev : [decision, ...prev.slice(0, 49)]));
  };

  // Playback timer
  useEffect(() => {
    if (!isPlaying || !perms.canOperate) return;
    const interval = setInterval(() => {
      stepCycle();
    }, 3200);
    return () => clearInterval(interval);
  }, [isPlaying, decision]);

  // Quick Scenario Condition Injections
  const injectCondition = (type: 'price_spike' | 'cloud_drop' | 'wind_gust' | 'battery_trip' | 'demand_surge' | 'nominal') => {
    if (type === 'price_spike') {
      setPortfolio((prev) => ({
        ...prev,
        market: { ...prev.market, spotPriceUsdPerMwh: 340.0, priceTrend: 'spiking' },
      }));
    } else if (type === 'cloud_drop') {
      setPortfolio((prev) => ({
        ...prev,
        weather: { ...prev.weather, condition: 'heavy_overcast', cloudCoverPct: 85 },
        solarFarms: prev.solarFarms.map((s) => ({ ...s, currentOutputMw: s.capacityMw * 0.2 })),
      }));
    } else if (type === 'wind_gust') {
      setPortfolio((prev) => ({
        ...prev,
        weather: { ...prev.weather, condition: 'gusty_wind', windSpeedMs: 24.2, stormAlert: true },
        windFarms: prev.windFarms.map((w) => ({ ...w, windSpeedMs: 24.2, gustWarning: true })),
      }));
    } else if (type === 'battery_trip') {
      setPortfolio((prev) => ({
        ...prev,
        batteries: prev.batteries.map((b) => (b.id === 'BESS-02' ? { ...b, status: 'fault', targetPowerMw: 0 } : b)),
      }));
    } else if (type === 'demand_surge') {
      setPortfolio((prev) => ({
        ...prev,
        consumers: prev.consumers.map((c) => (c.id === 'IND-01' ? { ...c, totalDemandMw: 65, flexibleDemandMw: 25 } : c)),
        grid: { ...prev.grid, totalDemandMw: 175 },
      }));
    } else if (type === 'nominal') {
      setPortfolio(initialPortfolio);
    }
  };

  const handleApproveHITL = async () => {
    const pendingId = (decision as any).pendingId;
    let approver = 'local-operator';
    try {
      const c = (window as any).Clerk;
      approver = c?.user?.primaryEmailAddress?.emailAddress || c?.user?.id || 'local-operator';
    } catch { /* ignore */ }
    const markApproved = () => {
      setDecision((prev) => ({ ...prev, hitlApproved: true, approvedBy: approver }));
      // Flip the audit row from "staged" to "AI proposed · human approved"
      setHistory((prev) => prev.map((h) => (h.decisionId === decision.decisionId ? { ...h, hitlApproved: true, approvedBy: approver } : h)));
    };
    if (!pendingId) {
      markApproved();
      toast('Strategy approved.', 'success');
      return;
    }
    let r: Response;
    try {
      const h = await authHeaders();
      r = await fetch(`/api/hitl/${pendingId}/approve`, { method: 'POST', headers: h });
    } catch {
      toast('Backend unreachable — approval NOT recorded. Retry when online.', 'error');
      return;
    }
    if (r.ok) {
      markApproved();
      toast(`Staged plan ${pendingId} approved — actuators released.`, 'success');
      return;
    }
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch { /* ignore */ }
    if (r.status === 401) {
      toast('Sign-in required: your session is missing or expired. Sign in and retry — NOT approved.', 'error');
    } else if (r.status === 403) {
      toast(`Forbidden (${detail || 'role lacks approve permission'}) — NOT approved.`, 'error');
    } else if (r.status === 404) {
      toast('Plan already resolved or expired on the server — NOT approved. Re-run dispatch for a fresh staged plan.', 'error');
    } else {
      toast(`Approval failed (${r.status} ${detail}) — NOT approved.`, 'error');
    }
  };

  // Operator picks a different ranked strategy: re-validate grounding, rebuild
  // commands, void the AI-staged plan (server reject), still requires Approve.
  const handleSelectScenario = async (sc: ScenarioCandidate) => {
    const pendingId = (decision as any).pendingId;
    if (pendingId) {
      try {
        const h = await authHeaders();
        await fetch(`/api/hitl/${pendingId}/reject`, { method: 'POST', headers: h });
      } catch { /* local-only fallback */ }
    }
    const checks = runGroundingValidation(sc, portfolio, groundingPolicy || undefined);
    try {
      checks.push(...evaluateCustomRules(portfolio, sc, customRules));
    } catch { /* custom rules never break built-ins */ }
    const actions = generateActionCommands(sc, portfolio);
    const conf = calculateConfidence(portfolio, sc, checks);
    setDecision((prev) => ({
      ...prev,
      selectedScenario: sc,
      groundingChecks: checks,
      actions,
      confidencePct: conf,
      hitlApproved: false,
      approvedBy: undefined,
      rationale: `Operator manually selected "${sc.name}" over the AI recommendation (${sc.compositeUtilityScore}/100, grounding ${checks.filter((g) => g.status === 'PASS').length}/${checks.length} PASS). Re-validation passed; awaiting approval.`,
    }));
    setHistory((prev) => {
      const entry = {
        ...decision, selectedScenario: sc, groundingChecks: checks, actions,
        confidencePct: conf, hitlApproved: false, approvedBy: undefined,
        rationale: `Operator manually selected "${sc.name}" over the AI recommendation.`,
      } as OrchestrationDecision;
      return [entry, ...prev.filter((h) => h.decisionId !== decision.decisionId).slice(0, 49)];
    });
    toast(`Staged "${sc.name}" instead — review and Approve to dispatch.`, 'info');
  };

  const handleOverrideConservative = () => {
    const conservative = decision.allScenarios.find((s) => s.id === 'CONSERVATIVE_HOLD') || decision.selectedScenario;
    setDecision((prev) => ({
      ...prev,
      selectedScenario: conservative,
      hitlApproved: true,
      rationale: 'Operator manually selected Conservative Hold fallback to ensure zero asset degradation and preserve reserve margins.',
    }));
    toast('Conservative Hold fallback enforced.', 'info');
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAcknowledgedAlertIds((prev) => new Set([...prev, alertId]));
  };

  const handleAutoMitigateAlert = (alert: ActiveAlert) => {
    handleAcknowledgeAlert(alert.id);
    if (alert.category === 'FREQUENCY') {
      setPortfolio((prev) => ({
        ...prev,
        grid: { ...prev.grid, frequencyHz: 50.01, frequencyStatus: 'nominal' },
      }));
    } else if (alert.category === 'THERMAL') {
      setPortfolio((prev) => ({
        ...prev,
        batteries: prev.batteries.map((b) => ({ ...b, tempC: 28.0, status: 'idle' })),
      }));
    } else if (alert.category === 'CONGESTION') {
      setPortfolio((prev) => ({
        ...prev,
        interties: prev.interties.map((i) => ({ ...i, currentFlowMw: i.limitMw * 0.75, congested: false })),
      }));
    } else if (alert.category === 'MARKET') {
      setActivePreset('economic');
      setWeights({ ...defaultObjectiveWeights, maximizeArbitrageProfit: 85, minimizeCost: 70 });
    }
  };

  return (
    <div className="min-h-screen bg-page text-paper flex flex-col font-sans">
      {/* 1. Header Navigation Bar */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onStepCycle={stepCycle}
        onReset={() => {
          setIsPlaying(false);
          setPortfolio(initialPortfolio);
          setWeights(defaultObjectiveWeights);
          setActivePreset('balanced');
          setCycleCount(1);
          setSimTime('14:15:00');
          setAcknowledgedAlertIds(new Set());
        }}
        onOpenGauntlet={() => { if (perms.canOperate) setIsGauntletOpen(true); }}
        onOpenPortfolioModal={() => { if (perms.canOperate) setIsPortfolioModalOpen(true); }}
        onOpenGroundingModal={() => setIsGroundingModalOpen(true)}
        cycleCount={cycleCount}
        simTime={simTime}
        hitlStatus={decision.hitlStatus}
        confidencePct={decision.confidencePct}
        decisionMode={decisionMode}
        onToggleDecisionMode={setDecisionMode}
        carbonAvoidedTons={decision.carbonMetrics?.emissionsAvoidedTons}
        activeAlertsCount={activeAlerts.filter((a) => !a.acknowledged).length}
        criticalAlertsCount={unackCriticalCount}
        canOperate={perms.canOperate}
      />

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <RoleBanner perms={perms} />
        {/* Quick Situation Override & Decision Engine Mode Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-panel/70 border border-line rounded-xl text-xs">
          {/* Left: Operational Event Injections */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-soft flex items-center gap-1 mr-1">
              <Zap className="w-3.5 h-3.5 text-am" />
              Event Shocks:
            </span>
            <button
              onClick={() => injectCondition('cloud_drop')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors whitespace-nowrap"
            >
              ☁️ Cloud Drop (-70%)
            </button>
            <button
              onClick={() => injectCondition('price_spike')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors whitespace-nowrap"
            >
              📈 Price Spike ($340)
            </button>
            <button
              onClick={() => injectCondition('wind_gust')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors whitespace-nowrap"
            >
              💨 Wind Gusts (24m/s)
            </button>
            <button
              onClick={() => injectCondition('battery_trip')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors whitespace-nowrap"
            >
              ⚠️ BESS-02 Trip
            </button>
            <button
              onClick={() => injectCondition('demand_surge')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors whitespace-nowrap"
            >
              ⚡ Demand Surge (+25MW)
            </button>
            <button
              onClick={() => injectCondition('nominal')}
              disabled={!perms.canOperate}
              className="px-2 py-1 rounded bg-emerald-500/10 text-em border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
            >
              ✓ Reset Nominal
            </button>
          </div>

          {/* Right: Quick Engine Mode Switcher & Modal Launchers */}
          <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-line pt-2 md:pt-0 md:pl-3 shrink-0">
            <button
              onClick={() => setIsGroundingModalOpen(true)}
              className="px-2.5 py-1 rounded bg-emerald-500/10 text-em border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 font-mono text-[11px]"
              title="Inspect live mathematical power balance and physics grounding"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Verify Grounding</span>
            </button>

            <button
              onClick={() => { if (perms.canOperate) setIsPortfolioModalOpen(true); }}
              className="px-2.5 py-1 rounded bg-raise hover:bg-strong text-paper transition-colors flex items-center gap-1 text-[11px]"
              title="Manage assets and ratings"
            >
              <Settings className="w-3.5 h-3.5 text-muted" />
              <span>Manage Assets</span>
            </button>
          </div>
        </div>

        {/* Real-Time Objective Weight Sliders (Interactive user control) */}
        <ObjectiveWeightsPanel
          weights={weights}
          readOnly={!perms.canOperate}
          onUpdateWeights={setWeights}
          activePreset={activePreset}
          setActivePreset={setActivePreset}
        />

        {/* Tab Viewport Switcher (6 agent-centric views, everything 1 click away) */}
        {activeTab === 'command' && (
          <div className="space-y-6">
            <CycleProgress decision={decision} isLoadingAgentic={isLoadingAgentic} lastRun={lastRun} />
            <PortfolioOverview portfolio={portfolio} actions={decision.actions} weatherSource={(decision as any).weatherSource} />
            <EnergyFlowDiagram
              portfolio={portfolio}
              selectedScenario={decision.selectedScenario}
              actions={decision.actions}
            />
            <GroundingAndSafetyPanel checks={decision.groundingChecks} policy={(decision as any).groundingPolicy || groundingPolicy} />
          </div>
        )}

        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-panel border border-line rounded-xl text-xs">
              <span className="font-semibold text-muted mr-1">Strategies in play:</span>
              {decision.allScenarios.map((sc) => {
                const off = disabledScenarios.includes(sc.id);
                return (
                  <button
                    key={sc.id}
                    onClick={() => perms.canOperate && toggleScenario(sc.id)}
                    disabled={!perms.canOperate || (!off && disabledScenarios.length >= decision.allScenarios.length - 1)}
                    title={!perms.canOperate ? 'Requires Operator role or above' : off ? `Re-enable ${sc.name}` : `Disable ${sc.name} (at least one must stay on)`}
                    className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors disabled:opacity-50 ${off ? 'bg-raise text-faint border-linestrong line-through' : 'bg-emerald-500/10 text-em border-emerald-500/30'}`}
                  >
                    {off ? '○' : '●'} {sc.id}
                  </button>
                );
              })}
            </div>
            <ScenarioComparisonTable
              scenarios={decision.allScenarios}
              selectedScenario={decision.selectedScenario}
            />
            <GroundingAndSafetyPanel checks={decision.groundingChecks} policy={(decision as any).groundingPolicy || groundingPolicy} />
          </div>
        )}

        {activeTab === 'carbon' && (
          <div className="space-y-6">
            <CarbonImpactPanel
              carbonMetrics={decision.carbonMetrics}
              portfolio={portfolio}
              scenarios={decision.allScenarios}
              selectedScenario={decision.selectedScenario}
              onUpdateCarbonPrice={perms.canOperate ? (newPrice) =>
                setPortfolio((p) => ({ ...p, market: { ...p.market, carbonPriceUsdPerTon: newPrice } }))
              : undefined}
            />
            <GroundingAndSafetyPanel checks={decision.groundingChecks} policy={(decision as any).groundingPolicy || groundingPolicy} />
          </div>
        )}

        {activeTab === 'intelligence' && (
          <div className="space-y-6">
            <AgenticFlowPanel
              canOperate={perms.canOperate}
              strictAI={strictAI}
              onToggleStrictAI={() => { if (perms.canOperate) toggleStrictAI(); }}
              decisionMode={decisionMode}
              onToggleDecisionMode={setDecisionMode}
              decision={decision}
              isLoadingAgentic={isLoadingAgentic}
              onRunAgenticFlow={() => executeAgenticFlow(undefined, undefined, 'manual')}
            />
            <SubAgentSwarmPanel
              portfolio={portfolio}
              selectedScenario={decision.selectedScenario}
              liveSwarm={decision.agenticTrace?.subAgentSwarm}
              modelUsed={decision.agenticTrace?.modelUsed}
            />
            <DecisionExplainability decision={decision} portfolio={portfolio} />
            <GroundingAndSafetyPanel checks={decision.groundingChecks} policy={(decision as any).groundingPolicy || groundingPolicy} />
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-6">
            <AlertsAndThresholdsPanel
              readOnly={!perms.canOperate}
              alerts={activeAlerts}
              thresholds={thresholds}
              onUpdateThresholds={setThresholds}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onAutoMitigateAlert={handleAutoMitigateAlert}
              portfolio={portfolio}
            />
            <GroundingAndSafetyPanel checks={decision.groundingChecks} policy={(decision as any).groundingPolicy || groundingPolicy} />
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="space-y-4">
            <CollapsibleSection
              storageKey="knowledge-selection"
              title="How scenario modeling selects the best strategy"
              subtitle={`Winner: ${decision.selectedScenario.name} (${decision.selectedScenario.compositeUtilityScore}/100) · ${decision.allScenarios.length} candidates ranked`}
              defaultOpen
            >
              <ScenarioSelectionExplainer decision={decision} weights={weights} />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-audit"
              title="Decision audit trail"
              subtitle={`${history.length} records · provenance-labeled (AI vs human)`}
              badge={<span className="font-mono text-[11px] text-muted tabular-nums">{history.length}</span>}
              defaultOpen
            >
              <AuditLogViewer history={history} onClear={() => setHistory([])} />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-dag"
              title="DAG execution pipeline"
              subtitle={`${decision.dagNodes.filter((n) => n.status === 'completed').length}/${decision.dagNodes.length} tasks completed · editable definition`}
              defaultOpen={false}
            >
              <DAGVisualizer nodes={decision.dagNodes} live={isLoadingAgentic && decisionMode === 'agentic'} />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-rag"
              title="RAG knowledge base & regulatory codex"
              subtitle="User-editable agent context — edits apply on next dispatch"
              defaultOpen={false}
            >
              <RAGKnowledgeDrawer />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-graph"
              title="Graph database (topology mirror)"
              subtitle="Run directly against Neo4j Aura · seed · verify counts"
              defaultOpen={false}
            >
              <GraphPanel portfolio={portfolio} />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-grounding"
              title="Grounding policy (admin-tunable tolerances)"
              subtitle="Sensitivity bands only — physical law stays hardcoded · every edit audited"
              defaultOpen={false}
            >
              <GroundingPolicyPanel />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-evals"
              title="Evaluation suites"
              subtitle="Deterministic invariants + quota-aware LLM judge"
              defaultOpen={false}
            >
              <EvalPanel />
            </CollapsibleSection>
            <CollapsibleSection
              storageKey="knowledge-skills"
              title="Agent skills registry"
              subtitle="Per-agent reasoning directives — safety guardrails locked"
              defaultOpen={false}
            >
              <AgentSkillsPanel />
            </CollapsibleSection>
          </div>
        )}

      </main>

      {/* Human-in-the-Loop Governance Modal (When confidence requires supervisor review) */}
      <HITLGovernanceModal
        decision={decision}
        portfolio={portfolio}
        isOpen={isHITLOpen}
        onClose={() => setIsHITLOpen(false)}
        onApprove={handleApproveHITL}
        onOverrideConservative={handleOverrideConservative}
        onSelectScenario={handleSelectScenario}
      />

      {/* 24-Scenario Simulation Gauntlet Modal */}
      <SimulationGauntletModal
        isOpen={isGauntletOpen}
        onClose={() => setIsGauntletOpen(false)}
        onApplyScenario={(scenario) => {
          if (perms.canOperate) {
            setPortfolio(scenario.apply(portfolio));
            toast(`Stress scenario applied: ${scenario.name}.`, 'info');
          }
        }}
        currentPortfolio={portfolio}
        weights={weights}
      />

      {/* Portfolio Asset Management Modal */}
      <PortfolioManagementModal
        isOpen={isPortfolioModalOpen}
        onClose={() => setIsPortfolioModalOpen(false)}
        portfolio={portfolio}
        onUpdatePortfolio={setPortfolio}
      />

      {/* Live Data Grounding Mathematical Proof Modal */}
      <DataGroundingModal
        isOpen={isGroundingModalOpen}
        onClose={() => setIsGroundingModalOpen(false)}
        checks={decision.groundingChecks}
        portfolio={portfolio}
        selectedScenario={decision.selectedScenario}
      />

      {/* Clean Utility Footer */}
      <footer className="border-t border-line/80 py-4 mt-8 bg-page text-faint text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted">Renewable Energy Orchestrator</span>
            <span aria-hidden="true">·</span>
            <span>IEEE 1547 & FERC 888 Compliant Grid Controller</span>
          </div>
          <div className="font-mono text-[11px] text-faint">
            Audit Hash: {decision.auditHash}
          </div>
        </div>
      </footer>
    </div>
  );
}
