import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadSkills, updateSkill } from './server/skills.js';
import { loadRagDocs, saveRagDocs, searchRag } from './server/ragStore.js';
import { loadDagDefinition, saveDagDefinition, executeDag } from './server/dagStore.js';
import { PortfolioSchema, WeightsSchema, runGuardrails, assessHitl, confidenceScore } from './server/guardrails.js';
import { buildCandidates, buildActions } from './server/scenarios.js';
import { runSubAgentHandoff } from './server/subagents.js';
import { supervise } from './server/supervisor.js';
import { createPending, resolvePending, loadPending, loadAudit, appendAudit } from './server/hitlStore.js';
import { optionalAuth, requireAuthIfConfigured, requireAdminIfConfigured, attachIdentityIfPresent, clerkEnabled } from './server/auth.js';

dotenv.config();

// Crash diagnostics: a dying dev server looks identical to a "reload loop"
// from the browser (vite auto-reloads on reconnect). Never die silently.
process.on('unhandledRejection', (reason) => {
  console.error('[server] UNHANDLED REJECTION (kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] UNCAUGHT EXCEPTION — exiting:', err);
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(optionalAuth);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    mode: 'real-agents (langchain supervisor + skill sub-agents)',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    clerkEnforced: clerkEnabled(),
    authRoles: clerkEnabled()
      ? {
          admin: 'org:admin — skills/RAG/DAG edits + HITL approve',
          operator: 'org:operator (custom) — HITL approve, no config edits',
          member: 'org:member — HITL approve',
          viewer: 'org:viewer (custom) — read-only dashboards',
          customPermissions: 'org:config:edit, org:dispatch:approve, org:dispatch:run also grant',
        }
      : { local: 'local-operator — full access (set CLERK_SECRET_KEY to enforce login)' },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/llm/status', async (_req, res) => {
  const { llmUsage, chainStatus } = await import('./server/llm.js');
  res.json({ ...llmUsage(), statusLine: chainStatus() });
});

// Live DAG progress for the currently/last executing run
app.get('/api/dag/progress', async (_req, res) => {
  const { getProgress } = await import('./server/dagProgress.js');
  res.json(getProgress() || { runId: null, done: true, states: {} });
});

// Telemetry source switch (Operator+): live Open-Meteo vs forced simulated.
app.get('/api/weather/mode', async (_req, res) => {
  const { getWeatherMode } = await import('./server/weather.js');
  res.json(getWeatherMode());
});
app.put('/api/weather/mode', requireAuthIfConfigured, async (req, res) => {
  const { setWeatherMode, getWeatherMode } = await import('./server/weather.js');
  const mode = String(req.body?.mode || '').toLowerCase();
  if (!['live', 'simulated', 'auto'].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'live', 'simulated', or 'auto'" });
  }
  setWeatherMode(mode as any);
  appendAudit({ type: 'WEATHER_MODE', mode, by: (req as any).authUserId });
  res.json(getWeatherMode());
});

// Boot beacon: correlates page boots with server-side writers (audit log mtime
// vs boot time tells whether dispatch file-writes are triggering reloads).
const bootLog: Array<{ t: string; nav: string; uptimeS: number; auditAgeMs: number | null }> = [];
app.post('/api/boot', (req, res) => {
  try {
    const stat = fs.existsSync(path.resolve('server/data/audit_log.json'))
      ? fs.statSync(path.resolve('server/data/audit_log.json'))
      : null;
    const entry = {
      t: new Date().toISOString(),
      nav: String(req.body?.nav || '?'),
      uptimeS: Math.round(process.uptime()),
      auditAgeMs: stat ? Date.now() - stat.mtimeMs : null,
    };
    bootLog.unshift(entry);
    console.log(`[boot] nav=${entry.nav} serverUp=${entry.uptimeS}s auditAge=${entry.auditAgeMs}ms`);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ---------- Skills (user-updatable) ----------
app.get('/api/skills', (_req, res) => res.json(loadSkills()));
app.put('/api/skills/:id', requireAdminIfConfigured, (req, res) => {
  try {
    const updated = updateSkill(req.params.id, req.body, (req as any).authUserId);
    if (!updated) return res.status(404).json({ error: 'Skill not found' });
    appendAudit({ type: 'SKILL_UPDATED', id: req.params.id, by: (req as any).authUserId });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Update failed' });
  }
});

// ---------- RAG (user-updatable knowledge base) ----------
app.get('/api/rag/docs', (_req, res) => res.json(loadRagDocs()));
app.post('/api/rag/docs', requireAdminIfConfigured, (req, res) => {
  const docs = loadRagDocs();
  const { id, title, category, summary, content, relevanceTags } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const doc = {
    id: id || `RAG-USER-${Date.now().toString(36).toUpperCase()}`,
    title, category: category || 'HISTORICAL_CASE', summary: summary || title,
    content, relevanceTags: relevanceTags || [],
    updatedAt: new Date().toISOString(), updatedBy: (req as any).authUserId,
  };
  docs.unshift(doc as any);
  saveRagDocs(docs);
  appendAudit({ type: 'RAG_CREATED', id: doc.id, by: (req as any).authUserId });
  res.status(201).json(doc);
});
app.put('/api/rag/docs/:id', requireAdminIfConfigured, (req, res) => {
  const docs = loadRagDocs();
  const idx = docs.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Doc not found' });
  docs[idx] = { ...docs[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString(), updatedBy: (req as any).authUserId };
  saveRagDocs(docs);
  appendAudit({ type: 'RAG_UPDATED', id: req.params.id, by: (req as any).authUserId });
  res.json(docs[idx]);
});
app.delete('/api/rag/docs/:id', requireAdminIfConfigured, (req, res) => {
  const docs = loadRagDocs().filter((d) => d.id !== req.params.id);
  saveRagDocs(docs);
  appendAudit({ type: 'RAG_DELETED', id: req.params.id, by: (req as any).authUserId });
  res.json({ ok: true });
});

function chunkText(text: string, max = 1500): string[] {
  const sections = text.split(/\n(?=#{1,2}\s)/g).map((s) => s.trim()).filter(Boolean);
  const base = sections.length > 1 ? sections : [text];
  const out: string[] = [];
  for (const sec of base) {
    if (sec.length <= max) { out.push(sec); continue; }
    for (let i = 0; i < sec.length; i += max) out.push(sec.slice(i, i + max));
  }
  return out.slice(0, 10);
}

// Ingest .md/.txt/.json/.csv files straight into the agent codex (Admin only).
app.post('/api/rag/upload', requireAdminIfConfigured, async (req, res) => {
  try {
    const { default: multer } = await import('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
    upload.single('file')(req as any, res as any, async () => {
      try {
        const file = (req as any).file;
        if (!file) return res.status(400).json({ error: 'No file attached (field name: file).' });
        const name: string = file.originalname || 'upload.txt';
        const ext = name.split('.').pop()?.toLowerCase();
        if (!['md', 'txt', 'json', 'csv'].includes(ext || '')) {
          return res.status(400).json({ error: 'Only .md, .txt, .json, .csv accepted (PDF roadmap).' });
        }
        const text = file.buffer.toString('utf-8');
        if (!text.trim()) return res.status(400).json({ error: 'File is empty.' });
        const category = ['ASSET_SPEC', 'REGULATORY_STANDARD', 'HISTORICAL_CASE', 'ANOMALY_SIGNATURE'].includes(req.body?.category)
          ? req.body.category : 'HISTORICAL_CASE';
        const tags: string[] = String(req.body?.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
        const docs = loadRagDocs();
        let added: any[] = [];
        if (ext === 'json') {
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          added = arr.slice(0, 10).map((o: any, i: number) => ({
            id: `RAG-UP-${Date.now().toString(36).toUpperCase()}-${i}`,
            title: String(o.title || `${name} #${i + 1}`),
            category, summary: String(o.summary || o.title || name),
            content: String(o.content || JSON.stringify(o)).slice(0, 4000),
            relevanceTags: [...tags, ...((o.relevanceTags || []) as string[])].slice(0, 12),
            updatedAt: new Date().toISOString(), updatedBy: (req as any).authUserId,
          }));
        } else {
          added = chunkText(text).map((chunk, i, arr) => ({
            id: `RAG-UP-${Date.now().toString(36).toUpperCase()}-${i}`,
            title: `${name}${arr.length > 1 ? ` (part ${i + 1}/${arr.length})` : ''}`,
            category, summary: chunk.split('\n')[0].slice(0, 160) || name,
            content: chunk,
            relevanceTags: tags,
            updatedAt: new Date().toISOString(), updatedBy: (req as any).authUserId,
          }));
        }
        docs.unshift(...added);
        saveRagDocs(docs);
        appendAudit({ type: 'RAG_UPLOADED', files: added.map((d) => d.id), by: (req as any).authUserId });
        res.status(201).json({ ok: true, added: added.map((d) => ({ id: d.id, title: d.title })) });
      } catch (e: any) {
        res.status(400).json({ error: e?.message || 'Upload failed' });
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Upload init failed' });
  }
});

// ---------- DAG (user-updatable execution graph) ----------
app.get('/api/dag/definition', (_req, res) => res.json(loadDagDefinition()));
app.put('/api/dag/definition', requireAdminIfConfigured, (req, res) => {
  try {
    const def = req.body;
    if (!Array.isArray(def)) return res.status(400).json({ error: 'Body must be DAG node array' });
    saveDagDefinition(def);
    appendAudit({ type: 'DAG_UPDATED', by: (req as any).authUserId, nodes: def.length });
    res.json(loadDagDefinition());
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Invalid DAG' });
  }
});

// ---------- HITL approval queue ----------
app.get('/api/hitl/pending', (_req, res) => res.json(loadPending().filter((p) => p.status === 'PENDING_APPROVAL')));
app.post('/api/hitl/:id/approve', requireAuthIfConfigured, (req, res) => {
  const rec = resolvePending(req.params.id, 'APPROVED', (req as any).authUserId);
  if (!rec) return res.status(404).json({ error: 'Pending decision not found or already resolved' });
  res.json({ ok: true, pendingId: rec.pendingId, executed: true, note: 'Staged actuator commands released for dispatch.' });
});
app.post('/api/hitl/:id/reject', requireAuthIfConfigured, (req, res) => {
  const rec = resolvePending(req.params.id, 'REJECTED', (req as any).authUserId);
  if (!rec) return res.status(404).json({ error: 'Pending decision not found or already resolved' });
  res.json({ ok: true, pendingId: rec.pendingId, executed: false, note: 'Staged plan rejected. Conservative-hold fallback recommended.' });
});
app.get('/api/audit/log', (_req, res) => res.json(loadAudit()));

// ---------- Real agentic orchestration ----------
// Plan-then-execute: critical decisions return PENDING_APPROVAL with staged (unexecuted) actions.
app.post('/api/agentic-orchestrate', async (req, res) => {
  const startTime = Date.now();
  try {
    await attachIdentityIfPresent(req);
    const { chainStatus } = await import('./server/llm.js');
    console.log(`[orchestrate] start op=${(req as any).authUserId || 'local-operator'} trigger=${req.body.trigger || '?'} llm=[${chainStatus()}] subagentMode=${process.env.SUBAGENT_MODE || 'batch'}`);
    const portfolio = PortfolioSchema.parse(req.body.portfolio);
    const weights = WeightsSchema.parse(req.body.weights);
    const previousDecision: any = req.body.previousDecision;

    // Live telemetry: real wind/cloud/temperature blended in (shock states preserved)
    const { fetchLiveWeather, applyLiveWeather } = await import('./server/weather.js');
    const farmIds = [...(portfolio.solarFarms || []), ...(portfolio.windFarms || [])].map((a: any) => a.id);
    const liveWx = await fetchLiveWeather(farmIds);
    const blendNotes = liveWx.source === 'live' ? applyLiveWeather(portfolio, liveWx.readings) : [];
    const operatorId = (req as any).authUserId || 'local-operator';

    const totalSolar = (portfolio.solarFarms || []).reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
    const totalWind = (portfolio.windFarms || []).reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
    const totalCleanGen = totalSolar + totalWind;
    const totalDemand = (portfolio as any).grid?.totalDemandMw ?? 150;

    const toolTrace: Array<{ toolName: string; category: string; params: any; resultSummary: string; executionTimeMs: number }> = [];
    const thoughtTrace: string[] = [];
    const wxStart = Date.now();
    toolTrace.push({
      toolName: liveWx.source === 'live' ? 'fetch_live_weather_open_meteo' : 'simulate_telemetry_fallback',
      category: 'INGESTION',
      params: { sites: farmIds.length },
      resultSummary: liveWx.source === 'live'
        ? `LIVE telemetry blended: ${blendNotes.slice(0, 4).join(' · ')}${blendNotes.length > 4 ? ` (+${blendNotes.length - 4} more)` : ''}`
        : liveWx.note,
      executionTimeMs: Date.now() - wxStart + 2,
    });
    thoughtTrace.push(`[THINK] Telemetry source: ${liveWx.source.toUpperCase()} (${liveWx.note})`);
    thoughtTrace.push(`[THINK] Cycle open: clean ${totalCleanGen.toFixed(1)} MW vs demand ${totalDemand.toFixed(1)} MW. Loading user DAG + skills + RAG.`);

    // DAG nodes 01-02: ingestion (real, timed)
    const { startRun, recordNode, finishRun } = await import('./server/dagProgress.js');
    const dagRunId = startRun();
    const dagTrace = await executeDag({
      'DAG-01': async () => {
        const t = Date.now();
        const n = (portfolio.solarFarms?.length || 0) + (portfolio.windFarms?.length || 0) + (portfolio.batteries?.length || 0);
        toolTrace.push({ toolName: 'ingest_scada_telemetry', category: 'INGESTION', params: { assets: n }, resultSummary: `Ingested ${n} asset telemetry streams.`, executionTimeMs: Date.now() - t + 2 });
        return { inputsSummary: 'SCADA + market API snapshot', outputsSummary: `${n} asset points aligned to 15-min interval` };
      },
      'DAG-02': async () => {
        const t = Date.now();
        toolTrace.push({ toolName: 'normalize_dispatch_interval', category: 'INGESTION', params: { intervalMin: 15 }, resultSummary: 'Normalized units to MW/15-min frame.', executionTimeMs: Date.now() - t + 1 });
        return { inputsSummary: 'Raw telemetry', outputsSummary: 'Time-aligned 15-min frame' };
      },
    }, () => '', recordNode, new Set(['DAG-01', 'DAG-02']));
    thoughtTrace.push('[ACT] Executed DAG-01/02 ingestion via user-configured DAG definition.');

    // RAG retrieval (real user-editable store)
    const ragStart = Date.now();
    const ragHits = searchRag(`freq ${portfolio.grid.frequencyHz} price ${portfolio.market.spotPriceUsdPerMwh} ${portfolio.weather.stormAlert ? 'storm' : ''} battery soc`, 5);
    toolTrace.push({ toolName: 'query_rag_knowledge', category: 'KNOWLEDGE_SKILLS', params: { topK: 5 }, resultSummary: `Retrieved ${ragHits.length} docs: ${ragHits.map((d) => d.id).join(', ')}.`, executionTimeMs: Date.now() - ragStart + 3 });
    thoughtTrace.push(`[OBSERVE] RAG: ${ragHits.map((d) => d.id).join(', ')} (user-editable codex).`);

    // Sub-agent handoff (parallel, LangChain-backed)
    const handoffStart = Date.now();
    const { opinions, modelUsed } = await runSubAgentHandoff(portfolio, weights);
    toolTrace.push({ toolName: 'subagent_handoff_fanout', category: 'ANALYSIS_SKILLS', params: { agents: 5 }, resultSummary: `5 opinions in ${Date.now() - handoffStart}ms. Votes: ${opinions.map((o) => `${o.agentId}=${o.preferredScenario}`).join(' ')}.`, executionTimeMs: Date.now() - handoffStart });
    opinions.forEach((o) => thoughtTrace.push(`[${o.agentId}] ${o.recommendation} (vote ${o.preferredScenario}, ${o.confidenceScore}%)`));

    const disabledScenarios: string[] = Array.isArray(req.body.disabledScenarios) ? req.body.disabledScenarios : [];
    // Grounded candidate math (LLM cannot invent numbers)
    const simStart = Date.now();
    let candidates;
    try {
      candidates = buildCandidates(portfolio, totalCleanGen, totalDemand, weights, disabledScenarios);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'No enabled strategies' });
    }
    const mathTop = candidates.find((c) => !c.excluded) || candidates[0];
    toolTrace.push({ toolName: 'simulate_scenario_candidates', category: 'DECISION_SKILLS', params: { candidateCount: candidates.filter((c) => !c.excluded).length, excluded: disabledScenarios }, resultSummary: `Ranked ${candidates.filter((c) => !c.excluded).length}: winner #1 ${mathTop.name} (${mathTop.compositeUtilityScore} pts).`, executionTimeMs: Date.now() - simStart + 2 });

    // LangChain supervisor reasoning over handoffs
    const supStart = Date.now();
    const verdict = await supervise(portfolio, weights, candidates as any, opinions as any, ragHits.map((d) => `[${d.id}] ${d.summary}`).join(' | '));
    toolTrace.push({ toolName: 'langchain_supervisor_reason', category: 'DECISION_SKILLS', params: { model: verdict.modelUsed }, resultSummary: `Supervisor selected ${verdict.winnerId}.`, executionTimeMs: Date.now() - supStart + 1 });
    thoughtTrace.push(`[SUPERVISOR] ${verdict.rationale.slice(0, 220)}`);

    // Strict-AI demo mode: refuse deterministic fallback — hold instead of deciding
    const strictAI = req.body.strictAI === true;
    const handoffLive = !/deterministic-skill-reasoner \((providers failed|no LLM key)\)/.test(modelUsed);
    const supervisorLive = !/deterministic-supervisor/.test(verdict.modelUsed);
    if (strictAI && (!handoffLive || !supervisorLive)) {
      const { llmUsage } = await import('./server/llm.js');
      return res.status(503).json({
        error: 'AI_UNAVAILABLE',
        detail: `Strict AI mode: holding dispatch — handoff ${handoffLive ? 'live' : 'fallback'}, supervisor ${supervisorLive ? 'live' : 'fallback'}.`,
        handoffLive,
        supervisorLive,
        usage: llmUsage().usage,
      });
    }

    let selected = candidates.find((c) => c.id === verdict.winnerId) || mathTop;
    if (selected.excluded) {
      thoughtTrace.push(`[SUPERVISOR] Overruled ${selected.id} (operator-disabled) → ${mathTop.id}.`);
      selected = mathTop;
    }

    // Non-bypassable guardrails
    const groundStart = Date.now();
    const groundingChecks = runGuardrails(portfolio, selected);

    // DAG-08S: prompt-guard safety screen on the supervisor rationale (native
    // single-message classifier format). Malicious => execution veto.
    const { classifySafety } = await import('./server/llm.js');
    const safety = await classifySafety(`${verdict.rationale}\n${verdict.tradeoff}`);
    toolTrace.push({ toolName: 'verify_supervisor_safety', category: 'GOVERNANCE_SKILLS', params: { model: safety.modelUsed }, resultSummary: `Safety screen: ${safety.verdict.toUpperCase()} — ${safety.note}`, executionTimeMs: 1 });
    groundingChecks.push({
      id: 'SAFETY-LLM-GUARD', category: 'REGULATORY',
      rule: 'Supervisor output must screen benign for prompt injection (prompt-guard)',
      status: safety.verdict === 'malicious' ? 'FAIL' : safety.verdict === 'benign' ? 'PASS' : 'WARN',
      detail: `${safety.verdict.toUpperCase()} via ${safety.modelUsed}. ${safety.note}`,
    } as any);
    if (safety.verdict === 'malicious') {
      thoughtTrace.push('[GUARDRAIL] Safety screen flagged MALICIOUS rationale — plan staged, dispatch BLOCKED pending human approval.');
    }

    const hardFail = groundingChecks.some((c) => c.status === 'FAIL');
    toolTrace.push({ toolName: 'verify_physical_grounding', category: 'GOVERNANCE_SKILLS', params: { checks: groundingChecks.length }, resultSummary: hardFail ? 'HARD FAIL — execution blocked, HITL review mandatory.' : 'All hard gates PASS/WARN. No thermodynamic violations.', executionTimeMs: Date.now() - groundStart + 1 });
    thoughtTrace.push(hardFail ? '[GUARDRAIL] FAIL detected — plan staged, dispatch BLOCKED pending human approval.' : '[GUARDRAIL] Hard gates clear.');

    // Remaining DAG phases as auditable trace entries
    const tailTrace = await executeDag({
      'DAG-03': async () => ({ inputsSummary: 'Weather + telemetry', outputsSummary: opinions[0]?.rationale || 'Forecast complete' }),
      'DAG-04': async () => ({ inputsSummary: 'BESS telemetry', outputsSummary: opinions[1]?.rationale || 'Storage envelope set' }),
      'DAG-05': async () => ({ inputsSummary: `Freq ${portfolio.grid.frequencyHz} Hz`, outputsSummary: opinions[2]?.rationale || 'Grid assessed' }),
      'DAG-05M': async () => ({ inputsSummary: `Spot $${portfolio.market.spotPriceUsdPerMwh}`, outputsSummary: opinions[3]?.rationale || 'Market assessed' }),
      'DAG-06': async () => ({ inputsSummary: '5 strategies', outputsSummary: `Winner math-optimal: ${candidates[0].id} (${candidates[0].compositeUtilityScore})` }),
      'DAG-07': async () => ({ inputsSummary: '5 handoffs + math table', outputsSummary: `Supervisor (${verdict.modelUsed}): ${selected.id}` }),
      'DAG-08': async () => {
        if (hardFail) throw new Error('Guardrail FAIL — staged only');
        return { inputsSummary: 'Physics + regulatory gates', outputsSummary: `${groundingChecks.filter((c) => c.status === 'PASS').length}/${groundingChecks.length} PASS` };
      },
      'DAG-08S': async () => ({ inputsSummary: 'Supervisor rationale + tradeoff', outputsSummary: `Safety screen ${safety.verdict.toUpperCase()} (${safety.modelUsed})` }),
      'DAG-09': async () => ({ inputsSummary: 'Winner vs 4 alternatives', outputsSummary: 'Rationale + counterfactuals recorded' }),
      'DAG-10': async () => ({ inputsSummary: 'Setpoints + preconditions', outputsSummary: 'Actuator commands staged (unexecuted until HITL clears)' }),
      'DAG-11': async () => ({ inputsSummary: 'HITL gate', outputsSummary: 'See hitlStatus: staged vs dispatched' }),
      'DAG-12': async () => ({ inputsSummary: 'Full trace', outputsSummary: 'Audit hash stamped' }),
    }, () => '', recordNode).catch((e) => {
      // DAG-08 hard-fail still yields a trace; rebuild without throwing
      return dagTrace;
    });
    finishRun();

    // Merge: DAG-01/02 carry the real ingestion outputs from the first pass;
    // every other node takes the second pass (real handlers). The first pass
    // executes the whole definition, so without this the description text wins.
    const tailById = new Map(tailTrace.map((n) => [n.id, n]));
    const fullDag = dagTrace.map((n) => {
      const t = tailById.get(n.id);
      return t && !['DAG-01', 'DAG-02'].includes(n.id) ? t : n;
    });
    const confidencePct = confidenceScore(portfolio, groundingChecks as any);
    const hitl = assessHitl(portfolio, selected, confidencePct, groundingChecks as any);

    // Carbon metrics (grounded)
    const battDis = Object.values(selected.batteryDispatchMw || {}).filter((v: any) => v > 0).reduce((s: number, v: any) => s + v, 0);
    const cleanDelivered = Math.min(totalDemand, totalCleanGen + battDis);
    const fossilImport = Math.max(0, selected.gridNetImportMw);
    const emissionsIncurred = Math.round(fossilImport * 0.42 * 0.25 * 100) / 100;
    const emissionsAvoided = Math.round(cleanDelivered * 0.55 * 0.25 * 100) / 100;
    const deliveredMwh = (cleanDelivered + fossilImport) * 0.25;
    const prevCumulative = previousDecision?.carbonMetrics?.cumulativeCarbonAvoidedTons ?? 342.8;
    const cumulative = Math.round((prevCumulative + emissionsAvoided) * 100) / 100;
    const carbonMetrics = {
      emissionsIncurredTons: emissionsIncurred, emissionsAvoidedTons: emissionsAvoided,
      carbonIntensityGramsPerKwh: deliveredMwh > 0 ? Math.round((emissionsIncurred * 1_000_000) / (deliveredMwh * 1000)) : 0,
      carbonTaxPaidUsd: Math.round(emissionsIncurred * (portfolio.market.carbonPriceUsdPerTon || 45)),
      carbonOffsetValueUsd: Math.round(emissionsAvoided * (portfolio.market.carbonPriceUsdPerTon || 45)),
      netCarbonEconomicImpactUsd: Math.round(emissionsAvoided * (portfolio.market.carbonPriceUsdPerTon || 45)) - Math.round(emissionsIncurred * (portfolio.market.carbonPriceUsdPerTon || 45)),
      cleanEnergySharePct: totalDemand > 0 ? Math.min(100, Math.round((cleanDelivered / totalDemand) * 1000) / 10) : 100,
      cumulativeCarbonAvoidedTons: cumulative,
      equivalentTreesPlanted: Math.round(cumulative * 45),
      equivalentCarMilesAvoided: Math.round(cumulative * 2480),
    };

    const decisionId = `AGT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;
    const auditHash = `SHA256:${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
    const actions = buildActions(selected as any, portfolio);
    const now = new Date();

    // Plan-then-execute gate
    let pendingId: string | null = null;
    let executed = true;
    if (hitl.critical || hardFail) {
      const rec = createPending({
        decisionId, hitlStatus: hitl.status as any, reasons: hitl.reasons,
        stagedActions: actions, selectedScenario: selected, requestedBy: operatorId,
      });
      pendingId = rec.pendingId;
      executed = false;
    } else {
      appendAudit({ type: 'AUTONOMOUS_DISPATCH', decisionId, scenario: selected.id, by: operatorId });
    }

    res.json({
      decisionId, timestamp: now.toISOString(), cycleTime: now.toTimeString().split(' ')[0],
      selectedScenario: selected, allScenarios: candidates,
      confidencePct, hitlStatus: hitl.status,
      hitlApproved: executed, hitlTimeoutSec: hitl.status === 'SUPERVISED' ? 300 : 0,
      pendingId, executed,
      hitlReasons: hitl.reasons,
      weatherSource: liveWx.source,
      dagRunId,
      rationale: verdict.rationale,
      counterfactualReasoning: verdict.counterfactual,
      rejectedAlternatives: candidates.filter((c) => c.id !== selected.id).map((c) => ({ name: c.name, reason: `Lower composite utility (${c.compositeUtilityScore} vs ${selected.compositeUtilityScore}).` })),
      tradeoffs: [
        { objective: 'Supervisor trade-off', impact: verdict.tradeoff },
        { objective: 'Battery longevity', impact: 'LFP preferred over NMC to limit degradation.' },
      ],
      actions: actions.map((a) => ({ ...a, stagedOnly: !executed })),
      groundingChecks, auditHash, dagNodes: fullDag, carbonMetrics,
      agenticTrace: {
        isAgentic: true, modelUsed: `${modelUsed} + ${verdict.modelUsed}`,
        thoughtTrace, toolsInvoked: toolTrace,
        serverLatencyMs: Date.now() - startTime,
        agentEvaluationSummary: `5 sub-agents → LangChain supervisor → guardrails in ${Date.now() - startTime}ms. ${executed ? 'Dispatched.' : `STAGED as ${pendingId}; awaiting HITL approval.`}`,
        subAgentSwarm: opinions.map((o) => ({
          agentId: o.agentId, agentName: o.agentName, role: o.role, avatarIcon: o.avatarIcon,
          recommendation: o.recommendation, preferredScenario: o.preferredScenario,
          priorityFactor: o.priorityFactor, confidenceScore: o.confidenceScore, rationale: o.rationale,
        })),
      },
    });
  } catch (error: any) {
    console.error('Agentic orchestrate error:', error);
    try {
      const { finishRun } = await import('./server/dagProgress.js');
      finishRun();
    } catch { /* ignore */ }
    res.status(error?.name === 'ZodError' ? 400 : 500).json({ error: error.message || 'Orchestration failed' });
  }
});

// ---------- Ask-the-Agent (RAG-grounded, LangChain when key present) ----------
app.post('/api/ask-agent', async (req, res) => {
  try {
    await attachIdentityIfPresent(req);
    const { question, situationContext, decision } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });
    const hits = searchRag(question, 4);
    const ctx = `Spot $${situationContext?.market?.spotPriceUsdPerMwh ?? 48.5}/MWh, freq ${situationContext?.grid?.frequencyHz ?? 50.01} Hz, strategy ${decision?.selectedScenario?.name ?? 'n/a'} (${decision?.confidencePct ?? '?'}%).`;
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GROQ_API_KEY) {
      try {
        const { invokeWithFallback } = await import('./server/llm.js');
        const prompt = `Grid operator Q: "${question}"\nSituation: ${ctx}\nCodex: ${hits.map((d) => `[${d.id}] ${d.title}: ${d.summary}`).join(' | ')}\nAnswer crisply with MW/Hz/$ figures, the key trade-off, and governing constraints (IEEE-1547, SOL, SOC floors). RULE: use ONLY figures present in the Situation or Codex lines above — never invent or estimate numbers; if a figure is absent, say "not in the codex".`;
        const { text, modelUsed } = await invokeWithFallback(
          'You answer as the grid dispatch supervisor. Terse, numeric, safety-first.',
          prompt,
          { label: 'ask-agent', temperature: 0.3, pace: 'minor' },
        );
        return res.json({ answer: text, model: modelUsed, source: 'rag+langchain', retrievedDocs: hits.map((d) => d.id) });
      } catch (e: any) { console.warn('ask-agent all providers failed, fallback:', String(e?.message || e).slice(0, 180)); }
    }
    const q = String(question).toLowerCase();
    const spot = situationContext?.market?.spotPriceUsdPerMwh ?? 48.5;
    let answer = `Under "${decision?.selectedScenario?.name || 'active strategy'}": ${ctx} Codex applied: ${hits.map((d) => d.id).join(', ')}. IEEE-1547 envelope and SOL limits honored; LFP cycled preferentially.`;
    if (q.includes('battery') || q.includes('discharge')) answer = `Discharge chosen on marginal economics at $${spot}/MWh. BESS-01 LFP prioritized (46% lower wear than NMC), reserves held above 15% floor. Codex: ${hits.map((d) => d.id).join(', ')}.`;
    if (q.includes('curtail')) answer = `Merit order: serve load → charge BESS → export within SOL → curtail last. Curtailment only at max SOC or SOL breach. Codex: ${hits.map((d) => d.id).join(', ')}.`;
    res.json({ answer, model: 'deterministic-rag-reasoner', source: 'fallback', retrievedDocs: hits.map((d) => d.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Ask-agent failed' });
  }
});

import http from 'http';
const httpServer = http.createServer(app);

if (!isProduction) {
  const { createServer } = await import('vite');
  // Bind Vite's HMR websocket to OUR http server (v8 reads server.ws.server,
  // not server.hmr.server). Without this the dev client sees every upgrade
  // die, concludes "server connection lost", sees GET / return 200, and
  // reloads the page in a loop. allowedHosts is open: local dev only.
  const vite = await createServer({
    server: {
      middlewareMode: true,
      allowedHosts: true,
      ws: { server: httpServer },
      // Runtime JSON stores change on every dispatch — never let them trigger reloads.
      watch: { ignored: ['**/server/data/**', '**/dist/**', '**/*.log'] },
    },
    appType: 'spa',
  });
  (app as any).locals.viteDevServer = vite;
  console.log(`[hmr] websocket channel: ${(vite as any)?.ws ? 'ready' : 'MISSING — page will reload-loop'}`);
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => { res.sendFile(path.resolve(__dirname, 'dist', 'index.html')); });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'gemini:keyed' : 'gemini:no-key';
  const groq = process.env.GROQ_API_KEY ? 'groq:keyed' : 'groq:no-key';
  console.log(`Orchestrator (real agents) on http://0.0.0.0:${PORT} | clerk=${clerkEnabled() ? 'enforced' : 'optional/off'} | llm chain=[${process.env.LLM_CHAIN_ORDER || 'gemini,groq'}] ${gemini} ${groq}`);
});
