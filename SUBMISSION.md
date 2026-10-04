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
- **User-editable agent brain**: skills registry, RAG codex, DAG definition,
  grounding tolerances, and custom grounding rules are all operator-editable at
  runtime and take effect on the next cycle — every change audit-logged with who/when.
- **Deny-by-default RBAC** (`org:admin/operator/member/viewer` + custom JWT permissions).
- **Prompt-guard safety screen**: a native-format classifier vets every supervisor
  rationale for prompt injection; `malicious` vetoes execution like any hard gate.
- **Operator-constrainable strategy space**: strategies can be disabled from ranking
  (supervisor cannot pick them); approvers can stage any ranked alternative with
  live per-option grounding validation.
- **Topology graph reasoning**: outage blast-radius (lost export, forced curtailment,
  at-risk loads) computed over a collector-bus graph, mirrored to Neo4j Aura.

## 3. Effective Use of AI

AI is the decision core, not a chatbot layer:
- Sub-agent reasoning (LangChain, `server/subagents.ts`): batched handoff, 1 call,
  skill-prompted, RAG-grounded, structured VOTE/REC/CONF output.
- Supervisor reasoning (`server/supervisor.ts`): selects winner with WHY/TRADEOFF
  justification over grounded math.
- Provider chain with free-tier failover: `gemini-3.8-flash` → ordered Groq chain
  (`gpt-oss-120b → 20b → safeguard-20b → qwen`, `server/llm.ts`) with output-format
  validation (non-conforming models auto-skipped), per-model 1h hard-skip, adaptive
  pacing (2s healthy / 15s under pressure), circuit breaker, prompt + handoff caches.
- Live telemetry blend: real Open-Meteo wind/cloud/temperature per site
  (`LIVE_WEATHER`, UI switchable live/simulated), shock states always win.
- Deterministic physics (scenario builders, scoring, guardrails) stays *outside* the
  LLM so numbers are never hallucinated. Ask-agent answers are RAG-cited.

## 4. Technical Complexity & Execution

- **Backend** (`server.ts` + `server/`): Express + TypeScript; zod-validated inputs;
  DAG executor with topological scheduling, cycle rejection, per-node timing, and
  live progress streaming (`server/dagStore.ts`, `server/dagProgress.ts`); crash-safe
  atomic JSON stores with `.bak` recovery (`server/store.ts`); audit ledger
  (append-only, 500-entry cap, identity-stamped actors).
- **Pipelines**: live weather blend → ingest → RAG retrieve → 5-agent handoff →
  5-scenario simulation → 7-objective weighted scoring → LangChain supervision →
  prompt-guard safety screen → guardrails (+ admin custom rules) → HITL gate →
  staged/dispatched actions → audit hash.
- **Frontend**: React + Tailwind v4 semantic theme tokens (dark/light/system),
  6 role-gated views, cycle progress widget, live DAG transfer strip, collapsible
  governance panels, provenance-labeled audit (paginated, filtered), HITL modal with
  full-field comparison + alternate-strategy picker, toasts, mobile nav, boot-beacon
  diagnostics.

## 5. Agentic / Autonomous Capability

- Agents use tools (skill-tool evidence functions), produce structured opinions with
  confidence, and the supervisor reconciles dissent (e.g. stress test: storage/market
  vote AGGRESSIVE while grid votes DEMAND_RESPONSE — observed live).
- Autonomy is graduated: AUTONOMOUS (dispatch), SUPERVISED (approve within 300s or
  safe fallback), ADVISORY (blocked until review). Guardrail FAIL vetoes everything.
- Error recovery: provider failover → per-model skip → circuit breaker →
  deterministic fallback (with Strict-AI hold mode that refuses fallback rows for
  demo purity); corrupt stores reseed; failed LLM calls degrade to grounded
  heuristics with honest per-stage `modelUsed` labeling and provenance badges.

## 6. Business / User Impact

- **Cost**: arbitrage discharge on spikes, negative-price charging, DR instead of
  peaker imports — every decision shows net $ impact.
- **Assets**: LFP-preferred cycling (46% lower wear vs NMC), SOC floors, thermal derating.
- **Risk**: IEEE-1547/SOL enforcement, reserve floors, human approval on >20 MW DR
  sheds, >100 MW exports, emergencies.
- **Sustainability**: carbon ledger per cycle (incurred vs avoided tons, intensity
  gCO₂/kWh, cumulative trees/car-miles equivalents).
- **Measured in testing** (dev machine, free-tier quotas): supervisor reasoning
  ~1.5–2.9s, safety screen ~0.2s, fresh agentic cycle ~4–6s healthy (~20–25s with
  pacing under pressure); 30/30 grounding PASS across 6 shock states; 4/4 RAG
  probes rank the correct doc first; corrupt-store recovery without crash.
- Telemetry blends **live Open-Meteo wind/cloud/temperature per site** (UI-switchable
  live/simulated) with simulated fallback; operator shock injections always win.
  (Economics engine fully computed; weather is the only live external input.)

## 7. Prototype Quality & Usability

Working end-to-end today: event shocks → live re-dispatch (cycle widget narrates
Forecast → deliberation → review with live timers) → staged HITL modal with
full-field comparison and alternate-strategy picker → role-gated approve →
provenance-labeled audit (incl. approver identity). Role-wise UI (viewer read-only
→ admin full control), grounding policy + custom-rule editors, graph DB panel with
seeding verification, theme switcher, guided login gate, toasts on every action.
Verified: `tsc` clean, production build passes, live Groq + safety-screen passes observed.

## 8. Scalability, Responsible AI & Robustness

- **Hallucination control**: LLM selects, never computes; format-validated outputs;
  RAG-cited answers; ask-agent forbidden from inventing figures (codex-only rule
  with `retrievedDocs` shown); math-optimal fallback.
- **Human oversight**: plan-then-execute, RBAC, audit with AI-vs-human provenance.
- **Reliability**: adaptive pacing (2s healthy / 15s under pressure), per-minute
  budget, 429-aware failover, per-model 1h hard-skip, circuit breaker, caches,
  atomic persistence, crash logging, boot beacons.
- **Privacy/security**: Clerk JWT verification, optional enforcement (demo mode
  without keys), identity-stamped audit actors, secrets never committed
  (`.env.example` only).
- **Scale path**: stateless compute swaps to queue/workers; JSON stores → SQLite/
  Postgres + pgvector; steady state is ~2 LLM calls per 15-min cycle.

---

## Detailed Structural Architecture

```
              ┌──────────── 15-MINUTE DISPATCH CYCLE ────────────┐
              │                                                  │
  TELEMETRY ──▶ blend live Open-Meteo (or forced SIM) + shocks   │
              │                                                  │
              ├──▶ DAG-01/02 ingest+normalize (user DAG definition) │
              │                                                  │
  RAG CODEX ──▶ query_rag_knowledge (TF-IDF + uploads)           │
              │                                                  │
              ├──▶ AGT-FORECAST ─┐                               │
              ├──▶ AGT-STORAGE ─┤  parallel handoff (1 batched   │
              ├──▶ AGT-GRID ────┤  LangChain call w/ dissent,    │
              ├──▶ AGT-MARKET ──┤  skill prompts + tool evidence │
              ├──▶ AGT-SAFETY ──┘  (+ TRACE_OUTAGE_IMPACT)       │
              │              votes + confidence                  │
              ▼                                                  │
  CANDIDATES ─▶ simulate enabled strategies (deterministic,      │
              │   First-Law-closed) · 7 objectives × weights      │
              ▼                                                  │
  SUPERVISOR ─▶ LangChain selects winner + WHY/TRADEOFF         │
              │   (may only pick precomputed candidates)         │
              ▼                                                  │
  SAFETY ─────▶ prompt-guard screens rationale (malicious=veto) │
              ▼                                                  │
  GUARDRAILS ─▶ battery/SOC/SOL/IEEE-1547/conservation gates    │
              │   + admin custom rules · FAIL = block            │
              ▼                                                  │
  HITL GATE ──▶ AUTONOMOUS→dispatch │ SUPERVISED/ADVISORY→stage  │
              │   (pendingId, stagedOnly, approve/reject/pick)   │
              ▼                                                  │
  COMMIT ────▶ actions + carbon ledger + audit hash → history   │
              └──────────────────────────────────────────────────┘
```

| Layer | Files | Model / mechanism |
|---|---|---|
| Agent skills (16, user-editable) | `server/skills.ts` | prompt fragments + tool evidence fns (incl. TRACE_OUTAGE_IMPACT) |
| RAG codex (10 docs, CRUD) | `server/ragStore.ts`, `src/data/ragKnowledgeBase.ts` (fallback mirror) | TF-IDF cosine retrieval + admin file upload (.md/.txt/.json/.csv); ask-agent constrained to codex figures only |
| DAG (14 nodes, editable) | `server/dagStore.ts`, `server/dagProgress.ts` | topological executor, cycle-rejecting validation, live progress stream + transfer strip |
| Live weather | `server/weather.ts` | Open-Meteo blend per site, shock-preserving, UI live/sim switch |
| Sub-agents (5) | `server/subagents.ts` | batched LangChain call → VOTE/REC/CONF each, dissent instruction |
| Scenario physics | `server/scenarios.ts` | First-Law-closed deterministic builders + weighted scoring, operator-disablable strategies |
| Supervisor | `server/supervisor.ts` | LangChain WINNER/WHY/TRADEOFF over enabled candidates only |
| Safety screen | `server/llm.ts` `classifySafety` | prompt-guard native-format classifier; malicious vetoes, outage fails open with note |
| LLM router | `server/llm.ts` | gemini-3.8-flash → ordered Groq chain (120b → 20b → safeguard-20b → qwen) with output validation, per-model 1h skip, adaptive pacing, circuit breaker |
| Grid blast tool | `server/graph.ts`, `POST /api/graph/impact` | in-memory topology (collector-bus convention) + optional Neo4j Aura mirror w/ seed verification + staleness badge |
| Guardrails + HITL | `server/guardrails.ts`, `server/groundingConfig.ts`, `server/hitlStore.ts` | zod, hard gates, **admin-tunable tolerances + custom rules + N-1 contingency screen (all audited)**, criticality classifier, approval queue with approver identity |
| Auth/RBAC | `server/auth.ts`, `src/auth/ClerkWrapper.tsx` | Clerk JWT, org roles, permission matrix, UI gates, Strict-AI demo mode |
| Persistence | `server/store.ts`, `server/data/*.json` | atomic writes, .bak recovery, reseed |
| UI | `src/` (6 views, theme tokens, toasts, audit provenance) | React + Tailwind v4 |

**Demo-to-claim mapping:** price-spike shock → agent votes + supervisor pick (claims 3, 5);
staged modal + viewer lockout + audit badges (claims 5, 8); RAG/DAG/skill live edits
(claim 2); Groq failover + fallback labels in server log (claims 4, 8); carbon panel
+ net-$ figures (claim 6).

**Known limits (honest):** free-tier LLM quotas force fallback under burst load
(mitigated: failover chain, Strict-AI hold mode for demo purity); JSON stores are
single-process (SQLite/Postgres path documented); RAG retrieval is TF-IDF
(embeddings scoped in D3 plan); telemetry beyond weather (demand/prices) is still
simulated drift (EIA adapter scoped); no online learning yet — the audit +
provenance ledger is the substrate, weight adaptation scoped post-submission.

---

## Solution Structure — 3×3 Grid Positioning

**Claimed coverage: F3 (features) × D2 (depth).**

### Features axis → F3 (all three levels demonstrated)

- **F1 — optimal cluster of actions.** Every 15-min cycle outputs an atomic,
  precondition-checked action set — BESS charge/discharge/hold, solar + wind
  curtailment (solar first per merit order), DR triggers, off-peak load shifts
  (rebound +1 cycle), and maintenance actions (schedule / delay / inspection) —
  via builders + `buildActions` (`server/scenarios.ts`), staged or dispatched
  through the HITL gate.
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
  format-validated outputs (VOTE/WINNER markers enforced, non-conforming models
  skipped); (iii) graduated autonomy with staged-not-executed critical plans; (iv) provider failover → circuit breaker → deterministic
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

### Formal 9-blocker self-declaration

We declare **F3 × D2**. Cell-by-cell coverage, with evidence location:

|  | D1: structured in, acceptable out | D2: structured in, high reliability | D3: multimodal in, high reliability |
|---|---|---|---|
| **F1: action cluster** | ✅ CLAIMED — nominal dispatch, action commands + all-PASS grounding (§F1×D1 above) | ✅ CLAIMED — BESS-trip lockout, staged execution, guardrail FAIL-veto (§F1×D2) | ❌ NOT CLAIMED — no multimodal input exists |
| **F2: criteria + uncertainty** | ✅ CLAIMED — live weight retuning re-ranks (§F2×D1) | ✅ CLAIMED — confidence escalator, 30 MW impact gate at 98%, approve-to-badge-flip (§F2×D2) | ❌ NOT CLAIMED |
| **F3: simulate over time** | ✅ CLAIMED — gauntlet variations + multi-cycle playback (§F3×D1) | ✅ CLAIMED — quota-loss failover, corrupt recovery, hysteresis-held alerts (§F3×D2) | ❌ NOT CLAIMED — D3 plan (§D3 below) is proposal only |

Against over/under-estimation penalties: F3 is earned by the supporting-features
spine (observability: traces, live DAG, `/api/llm/status`, beacons; fault
tolerance: failover, per-model skip, adaptive pacing, atomic stores; auditability:
hash ledger, provenance, identity-stamped actors; alert hysteresis + solar/deficit
families) — not by feature count alone. D2 is earned by reliability demonstrated
*under induced failure*. D3 is declined despite a written plan, because claiming
inputs we cannot demo would be overestimation. No cell is claimed without a live
moment above; no live moment above is unclickable today.

---

## D3 Multimodal Extension — Feature Plan (PROPOSED, not executed)

Goal: earn a scoped D3 claim — heterogeneous inputs (imagery + raw noisy streams)
with the same reliability guarantees — without touching the decision core.

### M1 · Sky imagery → solar nowcast (image input)
- **What**: operator uploads a sky photo (or still frame); vision model estimates
  cloud-cover % + cloud type; result feeds `cloudCoverPct` and the solar derate
  factor exactly like Open-Meteo does today.
- **Mechanism**: new `POST /api/vision/sky` (Admin/Operator) → Groq vision model
  (`meta-llama/llama-4-scout-17b-16e-instruct`, single image + constrained JSON
  prompt: `{"cloudCoverPct": n, "type": "cumulus|stratus|clear", "confidence": n}`)
  → validated range 0–100 → blended with live weather (operator shock still wins).
- **Reliability**: JSON-schema validation, range clamps, confidence < 60 falls back
  to Open-Meteo; every estimate stored with image hash in audit.
- **Demo moment**: upload overcast photo → solar output drops live → agents re-plan.

### M2 · Raw/noisy SCADA stream adapter (stream input)
- **What**: replace direct state reads with a stream adapter that tolerates sensor
  reality: dropouts (hold-last-good + staleness flag), spikes (median filter +
  rate-of-change clamp), jitter (deadband).
- **Mechanism**: `server/streams.ts` — ring buffer per channel, quality flags
  (`OK/STALE/HELD`) surfaced in the ingestion trace and Data Grounding modal;
  STALE channels force conservative planning (hold reserves) via a HITL reason.
- **Demo moment**: inject dropout storm → watch quality flags flip, confidence dip,
  plan stage for approval instead of deciding on garbage.

### M3 · Acoustic anomaly (audio input, stretch)
- Transformer/inverter hum recordings classified (normal vs arcing/bearing fault
  signatures) → feeds the anomaly RAG + thermal alert family. Same single-purpose
  classifier pattern as the prompt-guard safety screen.

### Shared foundation (required by M1–M3)
1. **RAG ingestion interface**: extend `/api/rag/upload` to PDF + images
   (pdfjs text extract; images stored with captions/embeddings), chunk + tag as today.
2. **Embeddings upgrade**: TF-IDF → `llama-text-embed-v2` (Pinecone inference free
   tier) or Gemini `text-embedding-004`, cosine in-process; retrieval interface
   (`searchRag`) unchanged so agents are unaffected.
3. **Guardrails**: every multimodal output is range/type-validated and confidence-
   gated exactly like LLM text today; classifiers never vote, only annotate.

### Phasing & cost
- **Phase 1 (demo-sized, ~1 session): M1 only** — one endpoint, one UI upload in
  Command weather box, blended derate, audit entry. No core changes.
- **Phase 2: M2 adapter** — touches ingestion path; needs regression pass over the
  6 shock states.
- **Phase 3 (post-submission): M3 + embeddings** — needs quota headroom and a
  bigger test matrix.

### Risks
- Vision/confidence calibration on atypical skies → mitigated by fallback + clamps.
- Extra LLM calls per cycle (M1 is operator-triggered, not per-cycle, so ~zero).
- Free-tier quota: M1 uses Groq vision on demand only; embeddings batched at ingest.

---

## EIA Backtest Roadmap (PROPOSED, not executed)

Goal: replace simulated demand/price drift with real history and turn P6
"potential" into measured deltas — replaying past weeks through the engine and
scoring decisions against do-nothing and conservative baselines.

### Data (all free, verified live at eia.gov/open-data)
- **Hourly operating data by balancing authority** (demand, net generation,
  interchange — the real load curves our drift simulation apes).
- **Wholesale electricity prices** (the real spikes our $340 shock imitates).
- **Bulk files** for offline replay without API dependence during judging.
- Access: free API key after registration; bulk downloads need no key.

### Harness design (`server/backtest.ts`, new; engine untouched)
1. **Adapter**: fetch chosen BA window (e.g. one heatwave week + one normal week)
   → normalize to portfolio telemetry shape → cache to `server/data/backtest/`.
2. **Replay driver**: step the frozen engine (mock path, deterministic — no LLM
   spend, no quota risk) across each 15-min interval of the window, recording
   per-cycle cost, emissions, reliability, autonomy tier.
3. **Baselines**: (a) do-nothing (meet all demand from market), (b) conservative
   hold; report deltas: $ saved, tons avoided, autonomy %, guardrail violations
   (must be zero), worst-cycle analysis.
4. **Output**: scorecard JSON + a Knowledge-tab panel rendering the replay table
   (already have table components to reuse).

### Phases
- **Phase 1 (~1 session)**: EIA adapter + one cached week + manual replay button.
  Delivers real load/price curves in-app.
- **Phase 2**: baseline comparison + scorecard panel → the measured P6 numbers
  judges asked for.
- **Phase 3 (post-submission)**: nightly scheduled replay as a regression gate
  (any code change must not regress the scorecard); NREL wind/solar years for
  weather-side backtests.

### Risks & mitigations
- EIA granularity (hourly/BA-level) vs our 15-min site model → interpolate with
  documented method; label interpolated stretches in the scorecard.
- API key/quota on judging day → Phase 1 caches the week to disk; demo runs offline.
- Scope discipline: replay uses the deterministic engine only — LLM behavior is
  evaluated separately via the existing trace/provenance review.
