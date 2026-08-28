# Tracewell

An AI-powered observability agent for order-sync pipelines. It watches a
database of orders for the kind of failure that's easy to miss by eye —
one stuck record silently blocking every record behind it — and when it
finds one, an LLM agent investigates the root cause the way an on-call
engineer would: by querying the data, forming a hypothesis, and checking it.

## Why this exists

E-commerce sourcing/sales pipelines that pull orders from a third-party API
often process them in a strict sequence, and only advance once each order
reaches a terminal state (e.g. settlement confirmed). If a single order gets
stuck, the whole downstream queue backs up — new orders keep arriving and
getting discovered, they just never make it through. Nothing crashes,
nothing alerts, and by the time someone notices, they're manually tracing
timestamps across days of logs.

Tracewell scans for that class of failure automatically and, instead of
just paging someone with "backlog detected," hands the incident to an agent
that traces it end-to-end and writes up what it found.

## Architecture

```
apps/
  server/    Express + TypeScript API: anomaly scanner + Claude tool-use
             investigation agent + REST endpoints
  web/       React + TypeScript dashboard (pipeline health, incidents,
             orders)
packages/
  db/        Prisma schema, migrations, and the seed script that generates
             the mock stuck-order scenario
```

**Scanner** (`apps/server/src/scanner`) runs on an interval and checks for:
stuck orders (`detectStuckOrders`), a backlog piling up behind a stuck order
(`detectBlockedBacklog`), a burst of sync failures (`detectSyncFailureSpike`),
and a gap in new orders arriving at all (`detectDataFlowGaps`). Each finding
becomes an `Incident` row (deduped so it doesn't re-fire every cycle).

**Agent** (`apps/server/src/agent`) is a tool-use loop against the Claude
API, not a chat wrapper: it's given a fixed set of read-only database tools
(`get_order`, `get_order_sync_history`, `search_sync_events`, etc., defined
in `agent/tools.ts`) and a system prompt telling it to investigate like an
engineer would. It calls tools iteratively, and finishes by calling a
`submit_incident_report` tool whose schema forces a structured result
(root cause, confidence, affected orders, an evidence trail, recommended
actions) — no fragile parsing of prose.

**Dashboard** (`apps/web`) polls the API for live pipeline stats, lists
incidents with severity/status, and renders each incident's report
including the agent's investigation trail.

## The mock scenario

`packages/db/prisma/seed.ts` generates:

- 300 healthy orders synced over the last ~20 days (with one already-resolved
  transient failure spike mixed in, so the dashboard isn't empty on first load)
- **order #301**: reaches `AWAITING_SETTLEMENT` and never confirms — it's
  the one order in the dataset priced in a different currency (MXN) than
  everything else, which the agent has to notice by comparing it against
  its neighbors, not because it's told
- **orders #302–#351**: a 50-order backlog discovered normally over the
  following 3 days but never synced, because the pipeline won't advance
  its cursor past #301

Nothing pre-labels the currency mismatch as the cause — that's for the
agent to find.

## Running locally (without Docker)

Requires Node 20+, npm, and a Postgres instance.

```bash
cp .env.example .env
# edit .env: set DATABASE_URL and ANTHROPIC_API_KEY

npm install
npm run db:migrate
npm run db:seed

npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

Without `ANTHROPIC_API_KEY` set, the scanner still detects and lists
incidents — it just skips the automatic investigation step.

## Running with Docker

```bash
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build -d postgres server web
docker compose --profile seed run --rm --build seed
```

Then open http://localhost:5173. The scanner starts polling as soon as
`server` is up (default every 30s — see `SCANNER_INTERVAL_SECONDS`), so the
backlog incident and its agent-generated report should appear within a
minute of seeding.

## Configuration

See `.env.example` for all variables: connection string, Anthropic model
and API key, scanner interval, and the thresholds each detector uses.

## Resetting the demo

```bash
npm run db:reset   # drops and re-migrates, then re-seeds
```
