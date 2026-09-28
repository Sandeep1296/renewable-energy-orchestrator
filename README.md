# Renewable Energy Orchestrator

Agentic AI dispatcher for utility-scale renewables: 5 specialist sub-agents →
LangChain supervisor → non-bypassable guardrails → human approval on critical
plans. Solar + wind + dual-BESS storage + industrial demand response, re-planned
every 15-minute cycle.

## Demo in 60 seconds (for judges)

1. `npm install && cp .env.example .env && npm run dev` → open `http://localhost:3000`
2. No keys? It runs in **local-operator demo mode** (full access, deterministic engine).
3. Click **Price Spike ($340)** → watch agents vote → critical plan **stages** → open the
   HITL modal → **Approve & Dispatch** → check the audit row flip to *AI proposed · human approved*.
4. Try a Viewer login (see [Login & Roles](#login--roles)) to see the read-only dashboard.

## Installation

Prerequisites: Node.js 20+, npm 9+.

```bash
npm install
cp .env.example .env
# edit .env — see Environment below (all optional; app runs without keys)
npm run dev        # dev: http://localhost:3000
npm run build      # production bundle → dist/
npm start          # serve production build (needs tsx: npm install -S tsx)
npm run lint       # typecheck (tsc --noEmit)
```

## Dependencies (runtime)

| Package | Why |
|---|---|
| `express` | API server + static hosting |
| `langchain`, `@langchain/google-genai`, `@langchain/groq` | sub-agent handoff + supervisor reasoning + Groq model chain |
| `@google/genai` | legacy direct SDK (retained compat) |
| `@clerk/express`, `@clerk/react`, `@clerk/clerk-js` | email login, org roles, JWT verification |
| `zod` | request + guardrail validation |
| `multer` | RAG file uploads (.md/.txt/.json/.csv) |
| `dotenv` | env config |
| `react`, `react-dom`, `vite`, `tailwindcss`, `lucide-react`, `motion` | frontend |

## Environment

| Variable | Required? | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | No | Gemini reasoning (`gemini-3.8-flash`) |
| `GROQ_API_KEY` | No | Groq chain ([console.groq.com/keys](https://console.groq.com/keys)) |
| `GROQ_MODEL_CHAIN` | No | Ordered fallback (default: `openai/gpt-oss-120b,openai/gpt-oss-20b,openai/gpt-oss-safeguard-20b,qwen/qwen3.8-27b`) |
| `GROQ_GUARD_MODEL` | No | Safety-screen classifier (default `meta-llama/llama-prompt-guard-2-22m`) |
| `LLM_CHAIN_ORDER` | No | Provider order (default `gemini,groq`) |
| `LLM_CALL_SPACING_MS` | No | Min gap between LLM calls, ms (default `15000`) |
| `SUBAGENT_MODE` | No | `batch` (1 call, default) or `parallel` |
| `LIVE_WEATHER` | No | Real Open-Meteo telemetry (default `true`; UI switch overrides per session) |
| `VITE_CLERK_PUBLISHABLE_KEY` | No | Frontend login (`pk_test_…`; needs Vite restart after adding) |
| `CLERK_SECRET_KEY` | No | Backend enforcement (`sk_test_…`). **Without both keys: local-operator demo mode.** |
| `PORT` | No | Default `3000` |

Without LLM keys the engine runs the grounded deterministic fallback (labeled honestly
in every trace as `deterministic-*`, never as AI).

## Architecture overview

```
telemetry ─▶ ingest (live Open-Meteo blend) ─▶ RAG retrieve ─▶ 5-agent handoff
  ─▶ 5-scenario physics sim ─▶ 7-objective weighted rank ─▶ LangChain supervisor
  ─▶ guardrails + prompt-guard safety screen ─▶ HITL gate (autonomous/staged)
  ─▶ actions + carbon ledger + hash-stamped audit
```

6 views: **Command** (portfolio+flow) · **Scenarios** (rank table + strategy toggles) ·
**Carbon** · **Intelligence** (trace+swarm+ask-agent) · **Alerts** (hysteresis-held) ·
**Knowledge** (selection explainer, audit, DAG editor, RAG codex, skills).
Full breakdown with judging-criteria mapping: [`SUBMISSION.md`](./SUBMISSION.md).

## API documentation

Base: same origin. Auth: `Authorization: Bearer <Clerk session JWT>` where noted.

| Method & path | Auth | Body / purpose |
|---|---|---|
| `GET /api/health` | open | liveness + mode/keys/roles summary |
| `POST /api/agentic-orchestrate` | open (identity attached if token sent) | `{portfolio, weights, disabledScenarios?, strictAI?, trigger?}` → full decision; `503 AI_UNAVAILABLE` in strict mode without LLMs |
| `POST /api/ask-agent` | open | `{question, situationContext, decision}` → RAG-cited answer + `retrievedDocs` |
| `GET /api/skills` | open | 15-skill registry |
| `PUT /api/skills/:id` | **admin** | `{enabled, promptFragment, …}` (safety skills locked on) |
| `GET /api/rag/docs` | open | codex list |
| `POST /api/rag/docs` | **admin** | `{title, content, category, summary?, relevanceTags?}` |
| `PUT /api/rag/docs/:id` | **admin** | partial update |
| `DELETE /api/rag/docs/:id` | **admin** | remove |
| `POST /api/rag/upload` | **admin** | multipart `file` (.md/.txt/.json/.csv ≤2MB) + optional `category`, `tags` |
| `GET /api/dag/definition` | open | 14-node DAG (cycle-validated on write) |
| `PUT /api/dag/definition` | **admin** | full node array (DAG-08 grounding locked on) |
| `GET /api/hitl/pending` | open | staged plans awaiting approval |
| `POST /api/hitl/:id/approve` | member+ | release staged actuators |
| `POST /api/hitl/:id/reject` | member+ | discard staged plan |
| `GET /api/audit/log` | open | server ledger (append-only, 500 cap) |
| `GET /api/llm/status` | open | provider usage, per-model stats, circuit + skip state |
| `GET /api/weather/mode` | open | `{configured, effective}` telemetry source |
| `PUT /api/weather/mode` | member+ | `{mode: live\|simulated\|auto}` |
| `POST /api/boot` | open | boot beacon (reload diagnostics) |

Role model: `org:admin` = config edits + approve · `org:operator`/`org:member` =
operate + approve · `org:viewer`/other = read-only (deny-by-default). Custom JWT
permissions `org:config:edit`, `org:dispatch:approve`, `org:dispatch:run` also grant.

## Login & roles

1. Clerk Dashboard → Authentication → **Email + verification code**; enable **Organizations**.
2. Roles & Permissions → keep `org:admin`/`org:member`; optionally add `org:operator`, `org:viewer` (custom roles free in dev).
3. Create org → invite users → assign roles. API Keys → set both Clerk vars → restart dev.
4. Users sign in on `/`, pick org in the `ORG` dropdown (activates `org_role`), role badge appears. Role changes need sign-out/in.

## Project structure

```
server.ts                  Express + Vite middleware, route wiring
server/                    agents (subagents, supervisor, skills), ragStore,
                           dagStore, guardrails, scenarios, weather (Open-Meteo),
                           llm router (chain, throttle, circuit), auth (RBAC),
                           hitlStore, store (atomic JSON), data/*.json (runtime)
src/                       React app: 6 views, 20 components, theme tokens,
                           role gates, audit provenance, toasts
SUBMISSION.md              judging-criteria mapping + architecture + grid position
```

## Deployment (free)

- **Render**: build `npm install && npm run build`, start `npm start`, add env vars. Sleeps when idle; disk ephemeral (stores reseed).
- **Cloudflare Tunnel** (best demo): `npm run build && npm start`, then `cloudflared tunnel --url http://localhost:3000` → public URL, persistent disk, no sleep.

## License

Apache-2.0
