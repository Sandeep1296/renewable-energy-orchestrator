# Renewable Energy Orchestrator — Final Submission

**One-liner:** An agentic AI dispatcher that balances solar, wind, battery storage,
grid stability, and market price every 15 minutes — with guardrailed autonomy and
human approval on critical plans.

---

## 1. Significance & Relevance

Grid operators must commit dispatch decisions every 15 minutes across volatile
renewables, degrading batteries, frequency mandates (IEEE 1547), transmission
limits, and spiking wholesale prices. Mistakes cost money (peak imports),
accelerate asset wear, and risk grid instability. This orchestrator automates the
routine 95% while forcing human judgment exactly where stakes are highest —
a genuine control-room need, not a toy dashboard.

## 2. Innovation & Originality

- **Council-of-agents + supervisor**: 5 domain sub-agents (forecast, storage, grid,
  market, safety) vote independently; a LangChain supervisor reasons over the
  handoff — it may only *select among physics-grounded candidates*, never invent MW/$.
- **Plan-then-execute HITL**: critical plans are *staged, not executed* (`pendingId`,
  `stagedOnly` actions) until a human approves. Most "AI dispatch" demos auto-execute.
- **User-editable agent brain**: skills registry, RAG codex, and DAG definition are
  all operator-editable at runtime and take effect on the next cycle.
- **Deny-by-default RBAC** (`org:admin/operator/member/viewer` + custom JWT permissions).

## 3. Effective Use of AI

AI is the decision core, not a chatbot layer:
- Sub-agent reasoning (LangChain, `server/subagents.ts`): batched handoff, 1 call,
  skill-prompted, RAG-grounded, structured VOTE/REC/CONF output.
- Supervisor reasoning (`server/supervisor.ts`): selects winner with WHY/TRADEOFF
  justification over grounded math.
- Provider chain with free-tier failover: `gemini-3.8-flash` → `groq/openai-gpt-oss-20b`
  (`server/llm.ts`), circuit breaker, prompt + handoff caches (6 calls/cycle → 2).
- Deterministic physics (scenario builders, scoring, guardrails) stays *outside* the
  LLM so numbers are never hallucinated. Ask-agent answers are RAG-cited.

## 4. Technical Complexity & Execution

- **Backend** (`server.ts` + `server/`): Express + TypeScript; zod-validated inputs;
  DAG executor with topological scheduling, cycle rejection, per-node timing
  (`server/dagStore.ts`); crash-safe atomic JSON stores with `.bak` recovery
  (`server/store.ts`); audit ledger (append-only, 500-entry cap).
- **Pipelines**: ingest → RAG retrieve → 5-agent handoff → 5-scenario simulation →
  7-objective weighted scoring → LangChain supervision → guardrail gates →
  HITL gate → staged/dispatched actions → audit hash.
- **Frontend**: React + Tailwind v4 semantic theme tokens (dark/light/system),
  6 role-gated views, collapsible governance panels, provenance-labeled audit
  (paginated, filtered), toasts, mobile nav, boot-beacon diagnostics.

## 5. Agentic / Autonomous Capability

- Agents use tools (skill-tool evidence functions), produce structured opinions with
  confidence, and the supervisor reconciles dissent (e.g. stress test: storage/market
  vote AGGRESSIVE while grid votes DEMAND_RESPONSE — observed live).
- Autonomy is graduated: AUTONOMOUS (dispatch), SUPERVISED (approve within 300s or
  safe fallback), ADVISORY (blocked until review). Guardrail FAIL vetoes everything.
- Error recovery: provider failover → circuit breaker → deterministic fallback;
  corrupt stores reseed; failed LLM calls degrade to grounded heuristics with honest
  `modelUsed` labeling.

## 6. Business / User Impact

- **Cost**: arbitrage discharge on spikes, negative-price charging, DR instead of
  peaker imports — every decision shows net $ impact.
- **Assets**: LFP-preferred cycling (46% lower wear vs NMC), SOC floors, thermal derating.
- **Risk**: IEEE-1547/SOL enforcement, reserve floors, human approval on >20 MW DR
  sheds, >100 MW exports, emergencies.
- **Sustainability**: carbon ledger per cycle (incurred vs avoided tons, intensity
  gCO₂/kWh, cumulative trees/car-miles equivalents).
- (Figures shown are simulated telemetry for demo; the economics engine is real.)
- Telemetry blends **live Open-Meteo wind/cloud/temperature per site** (`LIVE_WEATHER`,
  no key, 5-min cache) with simulated fallback; operator shock injections always win.

## 7. Prototype Quality & Usability

Working end-to-end today: event shocks (price spike, cloud drop, gust, BESS trip,
demand surge) → live re-dispatch → staged HITL modal → role-gated approve →
provenance-labeled audit. Role-wise UI (viewer read-only → admin full control),
theme switcher, guided login gate, toasts on every action. Verified: `tsc` clean,
production build passes, live Groq dispatches observed.

## 8. Scalability, Responsible AI & Robustness

- **Hallucination control**: LLM selects, never computes; JSON-validated outputs;
  RAG-cited answers; math-optimal fallback.
- **Human oversight**: plan-then-execute, RBAC, audit with AI-vs-human provenance.
- **Reliability**: throttle + per-minute budget, 429-aware failover, circuit breaker,
  caches, atomic persistence, crash logging, boot beacons.
- **Privacy/security**: Clerk JWT verification, optional enforcement (demo mode
  without keys), secrets never committed (`.env.example` only).
- **Scale path**: stateless compute Swaps to queue/workers; JSON stores → SQLite/
  Postgres + pgvector; current load is 2 LLM calls per 15-min cycle — trivially scalable.

---

## Detailed Structural Architecture

```
              ┌──────────── 15-MINUTE DISPATCH CYCLE ────────────┐
              │                                                  │
  TELEMETRY ──▶ DAG-01/02 ingest+normalize (user DAG definition) │
              │                                                  │
  RAG CODEX ──▶ query_rag_knowledge (user-editable docs)         │
              │                                                  │
              ├──▶ AGT-FORECAST ─┐                               │
              ├──▶ AGT-STORAGE ─┤  parallel handoff (1 batched   │
              ├──▶ AGT-GRID ────┤  LangChain call, skill prompts │
              ├──▶ AGT-MARKET ──┤  + tool evidence + RAG ctx)    │
              ├──▶ AGT-SAFETY ──┘                               │
              │              votes + confidence                  │
              ▼                                                  │
  CANDIDATES ─▶ simulate 5 physics scenarios (deterministic)     │
              │   score 7 objectives × user weights → rank       │
              ▼                                                  │
  SUPERVISOR ─▶ LangChain selects winner + WHY/TRADEOFF         │
              │   (may only pick precomputed candidates)         │
              ▼                                                  │
  GUARDRAILS ─▶ battery/SOC/SOL/IEEE-1547/conservation gates    │
              │   FAIL = block · WARN = confidence penalty       │
              ▼                                                  │
  HITL GATE ──▶ AUTONOMOUS→dispatch │ SUPERVISED/ADVISORY→stage  │
              │   (pendingId, stagedOnly, approve/reject API)    │
              ▼                                                  │
  COMMIT ────▶ actions + carbon ledger + audit hash → history   │
              └──────────────────────────────────────────────────┘
```

| Layer | Files | Model / mechanism |
|---|---|---|
| Agent skills (15, user-editable) | `server/skills.ts` | prompt fragments + tool evidence fns |
| RAG codex (10 docs, CRUD) | `server/ragStore.ts`, `src/data/ragKnowledgeBase.ts` (fallback mirror) | TF-IDF cosine retrieval + admin file upload (.md/.txt/.json/.csv); ask-agent constrained to codex figures only |
| DAG (13 nodes, editable) | `server/dagStore.ts` | topological executor, cycle-rejecting validation |
| Sub-agents (5) | `server/subagents.ts` | batched LangChain call → VOTE/REC/CONF each |
| Scenario physics | `server/scenarios.ts` | deterministic builders + weighted scoring |
| Supervisor | `server/supervisor.ts` | LangChain WINNER/WHY/TRADEOFF |
| LLM router | `server/llm.ts` | gemini-3.8-flash → ordered Groq chain (prompt-guard-2-22m → 86m → gpt-oss-120b → 20b → safeguard-20b → qwen3.8-27b) with output-format validation (non-conforming models auto-skipped), throttle, budget, caches, circuit breaker |
| Guardrails + HITL | `server/guardrails.ts`, `server/hitlStore.ts` | zod, hard gates, criticality classifier, approval queue |
| Auth/RBAC | `server/auth.ts`, `src/auth/ClerkWrapper.tsx` | Clerk JWT, org roles, permission matrix, UI gates |
| Persistence | `server/store.ts`, `server/data/*.json` | atomic writes, .bak recovery, reseed |
| UI | `src/` (6 views, theme tokens, toasts, audit provenance) | React + Tailwind v4 |

**Demo-to-claim mapping:** price-spike shock → agent votes + supervisor pick (claims 3, 5);
staged modal + viewer lockout + audit badges (claims 5, 8); RAG/DAG/skill live edits
(claim 2); Groq failover + fallback labels in server log (claims 4, 8); carbon panel
+ net-$ figures (claim 6).

**Known limits (honest):** telemetry is simulated; RAG retrieval is keyword-based
(embedding upgrade scoped); free-tier LLM quotas force fallback under burst load;
JSON stores are single-process (SQLite/Postgres path documented).

---

## Solution Structure — 3×3 Grid Positioning

**Claimed coverage: F3 (features) × D2 (depth).**

### Features axis → F3 (all three levels demonstrated)

- **F1 — optimal cluster of actions.** Every 15-min cycle outputs an atomic,
  precondition-checked action set (BESS charge/discharge/hold per pack, DR triggers,
  grid import/export, wind curtailment) via `buildActions` (`server/scenarios.ts`),
  staged or dispatched through the HITL gate.
- **F2 — optimality criteria per situation, adjusted for uncertainty.** The 7
  objective weights *are* the optimality criteria, retunable live per situation
  (presets: balanced/green/economic/grid-emergency/battery-preservation).
  Uncertainty adjustment is explicit: forecast quality, model certainty, and
  historical precedent feed a confidence score (`assessHitl`), which escalates
  AUTONOMOUS → SUPERVISED → ADVISORY and can veto execution.
- **F3 — simulate over time with input variations.** Five strategies are projected
  forward (economics, emissions, degradation, reliability per candidate); the
  24-scenario gauntlet varies input conditions (spikes, cloud collapse, gusts,
  trips, surges, congestion, frequency events); playback stepping evolves SOC,
  cycle count, prices, and wind over successive 15-min cycles. Demo: apply a
  shock, step 3 cycles, watch the ranking and reserves adapt.

### Depth axis → D2 (D3 explicitly out of scope)

- **D1 — met trivially.** Structured telemetry + textual RAG/operator input produce
  acceptable dispatches in nominal conditions (BALANCED, high-confidence path).
- **D2 — claimed: structured + textual input with HIGH demonstrable reliability.**
  Reliability is the demo's backbone and is shown under induced failure, not just
  sunshine: (i) non-bypassable guardrails (ratings, SOC floors, SOL, IEEE-1547,
  conservation) with FAIL-veto; (ii) LLM-may-only-select, never compute, with
  JSON-validated outputs; (iii) graduated autonomy with staged-not-executed
  critical plans; (iv) provider failover → circuit breaker → deterministic
  fallback, all honestly labeled in `modelUsed`; (v) atomic crash-safe stores
  with backup recovery; (vi) deny-by-default RBAC; (vii) provenance-labeled audit.
- **D3 — not claimed.** Highly heterogeneous *multimodal* input (imagery, audio,
  video, raw SCADA noise) is absent by design for this prototype. The two seams
  where D3 attaches later: the RAG ingestion interface (currently seeded text;
  scoped for PDF/SCADA/image docs + embeddings) and the telemetry adapter
  (currently structured state; scoped for streaming/noisy feeds).

### Demo-to-cell mapping

| Cell | Live moment |
|---|---|
| F1×D1 | nominal cycle → action commands + grounding panel all-PASS |
| F2×D1 | retune weights live → ranking re-orders, trade-offs re-explained |
| F3×D1 | gauntlet shock → 5 candidates re-projected, winner changes |
| F1×D2 | BESS-02 trip → faulted pack locked out, reserves held |
| F2×D2 | 30 MW DR shed at 98% confidence → still SUPERVISED (impact gate) → approve → badge flips |
| F3×D2 | quota exhaustion mid-demo → Groq failover → fallback, all labeled; corrupt-store recovery |

Bottom row (D3 inputs) is out of scope; everything above it is clickable today.
