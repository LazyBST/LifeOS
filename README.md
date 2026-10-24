# LifeOS

A single-user, chat-first life manager: goals, projects, tasks, habits, money
and journal on one dashboard, driven mostly by talking to an agent that writes
to the database directly.

Built to the spec in [`docs/SPEC.md`](docs/SPEC.md). File boundaries and shared
signatures are in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase Postgres + Supabase Auth · Vercel AI SDK with the Anthropic provider ·
`@dnd-kit` boards · Recharts · Serwist PWA + Web Push · `pg_cron` scheduling.

Everything that touches Supabase, the LLM, Google or push runs on the server.
The browser talks only to this app's own routes and server actions.

## Run it locally

```bash
cp .env.example .env.local   # fill in the values — see SETUP.md
npm install
npm run dev
```

The app needs a Supabase project with the migrations applied before it will do
anything useful. [`SETUP.md`](SETUP.md) has the exact numbered steps.

## Checks

```bash
npm run typecheck
npm run lint
npm run test      # unit tests + SQL tests against an in-memory Postgres
npm run build
```

## Layout

```
app/
  (app)/            the authenticated shell: dashboard and all subpages
  api/              chat, cron tick, notify actions, push, google oauth
  actions/          server actions the UI calls
lib/
  domain/           the one place business logic lives; UI and agent both call it
  agent/            tool registry, resolver, prompt, undo, chat loop
  time.ts           IST dates and natural-language parsing
components/
  tasks/            TaskViews: Board, List, filter bar
  chat/             the chat panel
supabase/
  migrations/       0001..0005, run in order
  seed.sql          test data
tests/
  unit/             pure logic
  sql/              migrations run against PGlite
```

## Conventions

- Deletes are soft; every query filters `deleted_at is null`.
- Dates are IST (`Asia/Kolkata`); use `lib/time.ts`, never raw `Date` parts.
- Money is `numeric(12,2)` rupees; green positive, red negative.
- The database enforces the hierarchy: a task under a project always carries
  that project's goal and Area, whoever wrote it.
- Text found in notes, calendar events or fetched pages is data, never
  instructions.
