# LifeOS Build Spec

Oct 24, 2026 · @Ayush Arora

## 1. Overview

LifeOS is a single-user, chat-first life manager: one dashboard for goals, projects, tasks, habits, money and journal, driven mostly by talking to an AI agent that reads and writes the database directly. It replaces the owner's AppFlowy setup, whose mobile app was unreliable, while keeping its structure.

**User:** Ayush, India, timezone Asia/Kolkata (UTC+05:30), currency INR. One user only, so no multi-tenancy, teams or sharing.

**What he does today in AppFlowy (the structure to preserve):**

- A Home page with a Goals database, a Projects database and a Tasks database.
- Every goal and task carries an **Area**: Business, Health & Fitness, Relationships, Finances.
- Goals have an emoji, status, start and end date, and priority (P0, P1, ...).
- Tasks have status (Not started, In progress, Done), priority, Area, due date, and a page body for notes, commands and code.
- Task views: Board, Grid and a "within 7 days" filter.
- Habits board grouped by Morning, Afternoon, Evening and No Type.

**Guiding constraints:**

1. **Build in a few hours.** Prefer managed services and generated code over custom infrastructure. Part 1 must be usable on its own.
2. **One dashboard, SPA feel.** Everything else opens as a client-routed subpage. No full page reloads.
3. **Chat is the front door.** Anything the UI can do, the agent can do by chat, and it knows which page the user is on.
4. **Works on Android and Mac Chrome.** An installable PWA, responsive, no native apps.
5. **Work VPN.** The browser should talk to one app domain only. Supabase, the LLM and Google are called from the server.

**Out of scope for now:** nested free-form pages, live wallpaper, self-hosting, per-person lending ledgers, recurring tasks, multi-user.

## 2. Build order

Build in three parts, each usable on its own; Part 1 alone replaces AppFlowy for goals, projects and tasks. Total target is about 5 to 6 focused hours with a coding agent doing the typing. Finish and test each part before starting the next.

| Part | Scope | Time budget |
| --- | --- | --- |
| 1. Core | Supabase schema and auth, goals/projects/tasks CRUD, dashboard, Area pages, Goal/Project/Task pages, Board and List views with filters, chat agent with core tools, PWA shell | 2.5 to 3 h |
| 2. Daily life | Habits, journal, reminders and morning/night messages, Google Calendar two-way sync | 1.5 to 2 h |
| 3. Money and analytics | Expenses with owed amount, wallet, month-end settle reminder, analytics page and goal forecasts | 1.5 h |

**Order inside Part 1** (do exactly this):

1. Create the Supabase project, run the migration in section 4, seed Areas.
2. Next.js app with Supabase Auth (Google sign-in, allowlisted to one email) and an auth guard.
3. Data layer: typed queries and server actions for goals, projects, tasks.
4. Dashboard and the Goal, Project and Task pages (section 6).
5. Chat route and tools (section 7), then wire the chat panel with page context.
6. PWA manifest and deploy to Vercel. Test on the phone before moving on.

**Cut line if time runs short:** drop in this order: Google Calendar sync, analytics charts (keep progress numbers), web push notifications (keep in-app notices), habits history views. Never cut the database constraints, the Goal/Project/Task pages, or chat.

## 3. Tech stack and architecture

Use Next.js on Vercel for UI, API and agent in one codebase, and Supabase Postgres for data, because it is the fastest path to a hosted database with real constraints and scheduling. No separate backend server.

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui | Client-side navigation between routes gives the SPA feel. |
| Database and auth | Supabase Postgres with Supabase Auth (Google sign-in) | Allow exactly one email; sign out anyone else. RLS on every table with an `is_owner()` policy. |
| Data access | `supabase-js` on the server with the service-role key; user session for dashboard reads | The service-role key never reaches the browser. |
| Agent | Vercel AI SDK (`ai`) with the Anthropic provider (Claude), tool calling | The SDK keeps the model swappable, so Gemini can replace Claude by changing one provider line. Use a Sonnet-class model for chat; a cheaper model for scheduled summaries. |
| Chat channels | Web chat panel inside the app (Part 1); Web Push notifications to the installed PWA (Part 2) | Chat replies and scheduled messages share one conversation table and one agent core. |
| Board and drag-drop | `@dnd-kit` | Drag cards between status columns. |
| Charts | Recharts (via shadcn charts) | Enough for every chart in section 10. |
| PWA | `@serwist/next`, `manifest.webmanifest` | Installable on Android Chrome and Mac Chrome; also receives Web Push through the web-push library with VAPID keys. |
| Scheduling | Supabase `pg_cron` + `pg_net` calling `POST /api/cron/tick` every minute with a secret header | Vercel Hobby cron is daily only, so do not use it. |
| Hosting | Vercel Hobby plus Supabase Free | Add a plain custom domain if `*.vercel.app` is blocked. |

**Rules for the codebase:**

- Server-only modules for Supabase, LLM, Google and push calls. The browser calls only the app's own `/api/*` routes and server actions.
- One **tool registry** (`lib/agent/tools.ts`): each tool is `{name, description, zod schema, handler}`. The web chat and scheduled jobs use the same registry. Do not duplicate logic between UI actions and agent tools; both call the same functions in `lib/domain/*`.
- Money and dates: store amounts as `numeric(12,2)` rupees; dates as `date` in IST; instants as `timestamptz`.
- Secrets in Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OWNER_EMAIL`.

**VPN check (do first, 5 minutes):** from the work laptop on VPN, open the deployed app URL, a Supabase project URL, `fcm.googleapis.com` and `accounts.google.com`. Because the browser only talks to the app domain, only the app domain must load for the dashboard to work; Google and push notifications only affect optional features.

## 4. Data model

The database enforces the hierarchy, so a task created under a project is always linked to that project's goal and Area, whoever creates it (UI, chat or SQL). Put this in `supabase/migrations/0001_core.sql`; the money tables are in section 5 and the calendar tables in section 9.

```sql
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- one row of settings
create table app_config (
  id boolean primary key default true check (id),
  owner_user_id uuid,
  timezone text not null default 'Asia/Kolkata',
  morning_time time not null default '07:30',
  night_time time not null default '21:30',
  push_enabled boolean not null default true,
  default_estimate_min int not null default 30
);
insert into app_config default values;

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  sort_order int not null default 0
);
insert into areas (name, sort_order) values
  ('Business',1), ('Health & Fitness',2), ('Relationships',3), ('Finances',4);

create table goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text,
  description text,
  area_id uuid references areas(id),
  status text not null default 'active' check (status in ('active','paused','done','dropped')),
  priority text not null default 'P1' check (priority in ('P0','P1','P2','P3')),
  start_date date,
  target_date date,
  notes_md text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  emoji text,
  description text,
  area_id uuid references areas(id),
  status text not null default 'active' check (status in ('active','paused','done','dropped')),
  priority text not null default 'P1' check (priority in ('P0','P1','P2','P3')),
  start_date date,
  target_date date,
  notes_md text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, goal_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal_id uuid references goals(id) on delete cascade,
  project_id uuid,
  parent_task_id uuid references tasks(id) on delete cascade,
  area_id uuid references areas(id),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  due_date date,
  due_at timestamptz,            -- set when the task has a clock time; drives calendar and reminders
  duration_min int,
  estimate_min int,              -- effort; falls back to app_config.default_estimate_min
  notes_md text not null default '',   -- the task's page: description, commands, code
  tags text[] not null default '{}',
  sort_order double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (project_id, goal_id) references projects(id, goal_id) on update cascade on delete cascade,
  check (project_id is null or goal_id is not null),
  check (parent_task_id is distinct from id)
);
create index on tasks (due_date) where deleted_at is null;
create index on tasks (status);
create index on tasks (goal_id);
create index on tasks (project_id);
create index on tasks (parent_task_id);
create index on tasks using gin (title gin_trgm_ops);
create index on goals using gin (title gin_trgm_ops);
create index on projects using gin (title gin_trgm_ops);

-- lineage: a task always takes goal/project/area from its parent task or project
create function tasks_inherit() returns trigger language plpgsql as $$
declare p record;
begin
  if new.parent_task_id is not null then
    select goal_id, project_id, area_id into p from tasks where id = new.parent_task_id;
    new.goal_id := p.goal_id; new.project_id := p.project_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  elsif new.project_id is not null then
    select goal_id, area_id into p from projects where id = new.project_id;
    new.goal_id := p.goal_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  elsif new.goal_id is not null then
    select area_id into p from goals where id = new.goal_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  end if;
  return new;
end $$;
create trigger tasks_inherit_bi before insert or update of project_id, parent_task_id, goal_id
  on tasks for each row execute function tasks_inherit();

-- projects inherit Area from their goal
create function projects_inherit() returns trigger language plpgsql as $$
begin
  new.area_id := coalesce(new.area_id, (select area_id from goals where id = new.goal_id));
  return new;
end $$;
create trigger projects_inherit_bi before insert on projects
  for each row execute function projects_inherit();

-- completed_at follows status; updated_at follows any change
create function tasks_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_stamp_bi before insert or update on tasks
  for each row execute function tasks_stamp();

-- when a project moves to another goal, its tasks follow (the composite FK has ON UPDATE CASCADE)
-- append-only activity log; feeds analytics and survives deletes
create table task_events (
  id bigserial primary key,
  task_id uuid not null,
  goal_id uuid, project_id uuid, area_id uuid,
  event text not null check (event in ('created','completed','reopened','deleted')),
  estimate_min int,
  at timestamptz not null default now(),
  source text not null default 'web'   -- web | chat | gcal | system
);
create function log_task_event() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'created', new.estimate_min);
  elsif new.status = 'done' and old.status <> 'done' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'completed', new.estimate_min);
  elsif old.status = 'done' and new.status <> 'done' then
    insert into task_events (task_id, goal_id, project_id, area_id, event, estimate_min) values (new.id, new.goal_id, new.project_id, new.area_id, 'reopened', new.estimate_min);
  end if;
  return new;
end $$;
create trigger tasks_log_ai after insert or update of status on tasks
  for each row execute function log_task_event();

-- habits
create table habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  time_of_day text not null default 'any' check (time_of_day in ('morning','afternoon','evening','any')),
  kind text not null default 'boolean' check (kind in ('boolean','count')),
  target_value numeric not null default 1,
  unit text,
  days_of_week smallint[],            -- 1=Mon..7=Sun; null = every day
  reminder_time time,
  area_id uuid references areas(id),
  goal_id uuid references goals(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  checkin_date date not null,
  value numeric not null default 1,
  note text,
  unique (habit_id, checkin_date)
);

-- journal: one entry per day
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  body_md text not null default '',
  mood smallint check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reminders, daily plan, chat, audit, job idempotency
create table reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  remind_at timestamptz not null,
  task_id uuid references tasks(id) on delete cascade,
  habit_id uuid references habits(id) on delete cascade,
  recurrence text,                    -- null | 'daily' | 'weekdays' | 'weekly'
  sent_at timestamptz,
  cancelled_at timestamptz
);
create index on reminders (remind_at) where sent_at is null and cancelled_at is null;
create table daily_plans (plan_date date primary key, task_ids uuid[] not null default '{}', plan_md text, accepted_at timestamptz);
create table chat_messages (
  id bigserial primary key,
  channel text not null check (channel in ('web','system')),
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  page_context jsonb,
  created_at timestamptz not null default now()
);
create table agent_actions (
  id bigserial primary key,
  tool text not null, input jsonb, before jsonb, after jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create table job_runs (job_key text primary key, ran_at timestamptz not null default now());

-- RLS: enabled on every table; one owner policy; the server uses the service role
create function is_owner() returns boolean language sql stable security definer as $$
  select auth.uid() = (select owner_user_id from app_config)
$$;
-- repeat for every table above:
-- alter table <t> enable row level security;
-- create policy owner_all on <t> for all to authenticated using (is_owner()) with check (is_owner());
```

**Rules the agent must follow:**

- Deletes are soft (`deleted_at`) for goals, projects and tasks; every query filters `deleted_at is null`.
- Maximum subtask depth is 3; reject deeper nesting and reject cycles in a server check.
- Set `app_config.owner_user_id` on first sign-in; reject any other Google account.
- The UI shows status labels Not started, In progress, Done for `todo`, `doing`, `done`.

## 5. Money model

Every expense stores two numbers, the cash the user paid and his own share; the difference is what is owed, and it is settled once a month. There is no per-person ledger and no loan table.

- **Paid** (`amount`): cash that left his account.
- **My share** (`my_share`): what the expense really cost him.
- **Owed** = paid minus my share. Positive means others owe him (green); negative means he owes others (red).

| Example | Paid | My share | Owed |
| --- | --- | --- | --- |
| Spent 200 with brother, half his | 200 | 100 | +100, brother owes him |
| Friend paid 600 for 3 people | 0 | 200 | -200, he owes the friend |
| Solo lunch | 150 | 150 | 0 |

```sql
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,                      -- 'Cash', 'HDFC', 'GPay'
  opening_balance numeric(12,2) not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz
);
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into categories (name) values ('Food'),('Groceries'),('Transport'),('Rent'),('Bills'),('Shopping'),('Health'),('Entertainment'),('Family'),('Misc');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  kind text not null check (kind in ('expense','income','settlement')),
  description text,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  amount numeric(12,2) not null,   -- expense/income: cash moved, >= 0. settlement: signed, + received, - paid
  my_share numeric(12,2),          -- expenses only; defaults to amount
  counterparty text,               -- optional free-text label, e.g. 'brother'; groups the owed list
  note text,
  raw_text text,                   -- what the user said to the chat
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'settlement' or amount >= 0),
  check (kind <> 'expense' or (my_share is not null and my_share >= 0)),
  check (kind = 'expense' or my_share is null)
);
create index on transactions (occurred_on);

-- owed per label: expenses add (amount - my_share), settlements subtract their signed amount
create view v_owed_by_label as
select coalesce(counterparty, 'unspecified') as label,
       sum(case when kind = 'expense' then amount - my_share
                when kind = 'settlement' then -amount else 0 end) as owed   -- >0 they owe me, <0 I owe
from transactions where deleted_at is null
group by 1;

create view v_account_balances as
select a.id, a.name,
  a.opening_balance
  + coalesce(sum(case when t.kind in ('income','settlement') then t.amount
                      when t.kind = 'expense' then -t.amount end), 0) as balance
from accounts a
left join transactions t on t.account_id = a.id and t.deleted_at is null
group by a.id;

create view v_wallet as
select
  (select coalesce(sum(balance),0) from v_account_balances)            as cash_on_hand,
  (select coalesce(sum(owed) filter (where owed > 0),0) from v_owed_by_label)  as owed_to_me,
  (select coalesce(-sum(owed) filter (where owed < 0),0) from v_owed_by_label) as i_owe,
  (select coalesce(sum(balance),0) from v_account_balances)
   + (select coalesce(sum(owed),0) from v_owed_by_label)               as net;

create view v_my_spending as   -- analytics use my share, never the cash paid
select occurred_on, category_id, my_share as amount
from transactions where kind = 'expense' and deleted_at is null;
```

**Settling.** At month end the user pays or collects outside the app, then tells the chat "brother paid me 100 on GPay" or "I paid Ravi 200". The agent creates a `settlement` row (positive if received, negative if paid) against the account, and the owed amount for that label drops to zero. Settlements are not spending.

**Month-end reminder.** On the last day of each month at 20:00 IST, send one message: the owed-to-me list, the I-owe list and the net, with a prompt to settle. Repeat the next morning if any label is still non-zero.

**Wallet card** shows four numbers: cash on hand, owed to me (green), I owe (red), and net (green if positive, red if negative). Expanding it lists labels with their owed amounts and a Settle button that opens the chat with a prefilled message.

**Agent behaviour for expenses:**

- "Spent 200 with my brother, half his" creates an expense with paid 200, my share 100, label brother, then echoes: "Rs 200 on Food. Brother owes you Rs 100."
- If the user says "with X" without a split, ask once whether to split equally; do not guess.
- Default account is the one flagged `is_default`; ask only if none exists.
- Default category: infer from the description, else Misc, and echo the choice.

## 6. UI spec

The app is one dashboard plus subpages navigated on the client, with a persistent chat panel. Goals, projects and tasks each get a full page whose contents are grouped around that entity.

### Routes

| Route | Page |
| --- | --- |
| `/` | Dashboard |
| `/area/[slug]` | One page per Area (Business, Health & Fitness, Relationships, Finances) |
| `/goals/[id]` | Goal page |
| `/projects/[id]` | Project page |
| `/tasks/[id]` | Task page |
| `/habits` | Habits (Part 2) |
| `/money` | Money (Part 3) |
| `/analytics` | Analytics (Part 3) |
| `/settings` | Times, accounts, categories, Google connect, push notification setup |

Use Next.js App Router with client-side `<Link>` navigation and a shared layout holding the sidebar (desktop) or bottom nav (mobile) and the chat panel, so switching pages never reloads the chat. Every page has breadcrumbs: Goal > Project > Task. Browser back works everywhere.

### Dashboard (`/`)

Responsive grid: three columns on desktop, one column on mobile.

- **Header:** date, quick-add input (sends its text to the chat agent), chat toggle.
- **Goals strip:** a card per active goal with emoji, Area colour, progress ring (by effort), hours left, projected finish date versus target date, and an on-track badge. Click opens the Goal page.
- **Tasks block (main):** Board and List toggle, the filter bar below, and preset tabs: Today, Within 7 days, Overdue, All open.
- **Side cards:** today's habits grouped Morning, Afternoon, Evening, Any (tap to check in); today's calendar events and timed tasks; wallet (four numbers, green and red); journal prompt with today's entry and mood.

### Tasks views and filters (used on every page)

One reusable `TaskViews` component takes a base query (for example a project id) and renders:

- **Board:** columns Not started, In progress, Done. Drag cards between columns with `@dnd-kit`; dropping into Done completes the task. Card shows title, priority chip, Area colour, due date, estimate, and subtask count.
- **List:** rows with checkbox, title, priority, status, Area, goal and project path, due date, estimate. Click a column header to sort. Group-by dropdown: none, Area, goal, project, priority, due date.
- **Filter bar** (both views): Area, goal, project, priority (multi), status (multi), due (today, 7 days, overdue, no date, custom range), tag, text search. Filters live in the URL query string, so a view is bookmarkable, and the last-used set is remembered per page in `localStorage`.
- **Inline create:** an "Add task" row at the top of every list or column; a task added here is linked to the page's entity automatically.

### Entity pages

Each has a properties header (editable inline), a progress bar, and the grouped content below. All editing saves on blur through server actions, with optimistic updates.

| Page | Header | Body grouping |
| --- | --- | --- |
| Area | Area name, counts, progress | Goals as groups; each group lists its projects and open tasks. Same TaskViews with the Area filter locked |
| Goal | Emoji, title, Area, status, priority, start and target date, progress ring, hours left, projected date | Projects as groups, each with its tasks; "Add project"; goal-level tasks without a project in an "Unsorted" group; notes editor |
| Project | Same fields, parent goal as a link | Tasks grouped by status (Board) or by priority (List); subtasks nested under each task; notes editor |
| Task | Title, status, priority, Area, due date and time, duration, estimate, tags, breadcrumbs | Subtasks list with checkboxes and "Add subtask"; **notes editor**; linked reminder and calendar event |

**Notes editor:** a markdown textarea with live preview for the first version (headings, lists, checklists, fenced code blocks with a copy button). Store plain markdown in `notes_md`. It autosaves 800 ms after typing stops. Upgrade to a block editor such as BlockNote later; the column can hold its content as markdown without a schema change.

### Chat panel

Right-side drawer on desktop, full-screen tab on mobile. It sends the current `page_context` with every message (see section 7), shows tool results as small cards ("Task created: Fix login redirect, Website > Launch MVP" with a link), and shows system messages such as the morning plan.

### Visual rules

Clean and dense, light and dark themes, one accent colour, Area colours used as small dots or left borders, not backgrounds. Money uses green for positive and red for negative everywhere. Touch targets at least 44 px on mobile. No feature should need more than two taps from the dashboard.

## 7. Chat agent

The agent is a tool-calling LLM loop that writes straight to the database through the same domain functions the UI uses, and it always knows which page the user is on. Use the Vercel AI SDK `streamText` with the tool registry, capped at 8 tool steps per message.

### Request flow

1. `POST /api/chat` receives `{text, page_context}`; `page_context` is `{route, entity_type, entity_id, area_id, filters}`, for example `{entity_type: "project", entity_id: "..."}` when the user is on a Project page.
2. Store the message in `chat_messages`.
3. Build the prompt: system rules, current date and time in Asia/Kolkata, the page context with the entity's title and breadcrumb, a compact index of active goals and projects (id and title only), and the last 20 messages.
4. Run the tool loop. Each tool validates input with zod, runs in a transaction, and writes an `agent_actions` row with before and after JSON.
5. Reply in plain text, plus tool-result cards for the UI. Always echo resolved values: dates, amounts, and the full path ("Added to Login Page, Website > Launch MVP").

Scheduled jobs (Part 2) post proactive messages into the same conversation thread with `channel = 'system'`; they use the same agent core and domain functions as the web chat.

### Context rules

- "Add a task" with no parent, while on a Goal, Project or Task page, means under that entity (a Task page means a subtask). On the dashboard it creates an unsorted task with an Area if one is named.
- "This", "it" and "here" mean the page entity first, then the most recently touched entity in the conversation.
- Dates accept natural language ("tomorrow 4pm", "next Friday"); parse with `chrono-node` in IST and echo the resolved value.

### Tools

Every tool taking an entity accepts `id` or a natural-language `ref`; the resolver below turns `ref` into an id.

| Tool | Parameters | Notes |
| --- | --- | --- |
| `search` | query, types?, include\_done?, limit? | Trigram match across goals, projects, tasks, habits |
| `get` | type, id | Entity with breadcrumb and children summary |
| `goal_create`, `goal_update`, `goal_delete` | title, emoji?, area?, priority?, start\_date?, target\_date?, status?, notes\_md? | Delete is soft and needs confirmation |
| `project_create`, `project_update`, `project_delete` | goal\_ref, title, area?, priority?, target\_date?, status?, notes\_md? | Changing `goal_ref` moves the project and its tasks |
| `task_create` | title, project\_ref?, goal\_ref?, parent\_task\_ref?, area?, priority?, due\_date?, due\_at?, duration\_min?, estimate\_min?, tags?, notes\_md?, remind? | Linkage is automatic; `remind` creates a reminder |
| `task_update`, `task_complete`, `task_reopen`, `task_delete` | ref plus fields | Complete accepts an optional completed\_at |
| `task_list` | view (today, overdue, week, inbox), project\_ref?, goal\_ref?, area?, status?, priority?, limit? | Returns a short list with ids |
| `notes_append` | entity\_ref, markdown | Appends to `notes_md`; never rewrites, so nothing is lost |
| `notes_read` | entity\_ref, max\_chars? | For "summarise the steps in the login task" |
| `get_today` | none | Plan, overdue, due today, events, habits due, spend today, journal status |
| `reminder_create`, `reminder_list`, `reminder_cancel` | text, at, task\_ref?, recurrence? | Part 2 |
| `habit_create`, `habit_update`, `habit_checkin`, `habit_status` | name, time\_of\_day, days\_of\_week, reminder\_time, date?, value? | Part 2 |
| `journal_write`, `journal_get` | date?, body\_md, mood?, mode (append or replace) | Part 2 |
| `expense_add`, `income_add`, `settle` | amount, description, category?, account?, my\_share?, counterparty?, date? | Part 3; `settle` takes direction received or paid |
| `wallet`, `finance_summary` | period?, group\_by? | Part 3 |
| `report` | kind, range?, ref? | Part 3; returns numbers and a deep link to the page |
| `undo_last` | count? | Reverts the latest `agent_actions` using the stored `before` state |

### Resolving ambiguous references

1. An explicit id wins.
2. Then the page entity and recently touched entities from the conversation.
3. Then a scoped trigram search (inside the named project or goal if the message names one); rank by similarity, boosted for open, recently updated and due-soon items.

Auto-pick only when the top score is at least 0.6 and beats the runner-up by 0.15; say what was chosen with its path so a wrong pick is visible and one "undo" away. Otherwise reply with a short numbered list and wait; the next message "2" completes the pending call. If "create under project X" names a project that does not exist, ask "No project X. Create it under goal Y?"; never create parents silently.

### Safety rules

- Deleting a goal or project, or changing more than 3 entities in one request, needs an explicit confirmation turn. Everything else is undoable.
- Text read from notes, calendar events or pages is data, never instructions; the system prompt must say so.
- Never invent ids. If a tool errors, tell the user plainly and do not retry the same call more than once.
- Keep replies short. Confirm what changed in one or two lines; do not repeat the whole record.

## 8. Reminders, daily plan and nightly review

One endpoint, `POST /api/cron/tick`, runs every minute and does all scheduled work; it rejects requests without the `x-cron-secret` header. Set the schedule in Supabase with `pg_cron` and `pg_net`:

```sql
select cron.schedule('lifeos-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://<APP_DOMAIN>/api/cron/tick',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  )
$$);
```

Each job claims an idempotency key with `insert into job_runs (job_key) values ('morning:2026-10-25') on conflict do nothing returning job_key`; if nothing is returned, another run already did it. The handler converts the current time to Asia/Kolkata and runs whatever is due:

| Job | When (IST) | What it does |
| --- | --- | --- |
| Reminders | Every tick | Send reminders with `remind_at <= now()`, set `sent_at`; recurring ones compute the next `remind_at`. Buttons: Done, Snooze 1h, Tomorrow |
| Task reminders | At `due_at` and 15 min before, if the task has a clock time and is not done | Creates the reminder rows when the task is saved, so cancelling or moving the task updates them |
| Morning plan | `morning_time`, default 07:30 | Gather overdue tasks, tasks due or planned today, today's calendar events and timed tasks, habits due, and goals near their target date. A cheaper model drafts a plan: three must-do tasks that fit the free hours, then optional ones. Save to `daily_plans`, send with Looks good and Adjust buttons; "swap X for Y" is handled by the agent |
| Habit nudges | Each habit's `reminder_time` | Only if not yet checked in today |
| Nightly review | `night_time`, default 21:30 | Report done versus planned, list unfinished tasks with Tomorrow, Next week and Drop buttons, show habits missed, then ask "How was your day? A few lines, and a mood 1 to 5." The next free-text reply is saved as the day's journal entry (append mode), with the mood asked as a 1 to 5 button row if missing. The pending state expires at 05:00 |
| Month-end settle | Last day of month, 20:00 | The owed summary from section 5 |
| Calendar poll | Every 10 min | Part 2 sync (section 9) |

**Delivery.** Web Push to the installed PWA is the phone notification channel. Every proactive message is also written to `chat_messages` with `channel = 'system'`, so it appears in the web chat with an unread badge even if a push never arrives.

- Use the `web-push` library with VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). The Serwist service worker handles `push` and `notificationclick`. Notifications carry action buttons (Done, Snooze 1h, Tomorrow) that call `/api/notify/action`, which runs the domain function directly without the LLM.
- Ask for notification permission from a button on `/settings`, never on page load, and save the subscription for each device that should get alerts (the Android PWA and Chrome on Mac). Enable RLS on this table like every other.
- Delete a subscription when the push service answers 404 or 410.
- Quiet hours 22:30 to 07:00 suppress everything except the nightly review and explicit reminders.
- On Android, install the PWA first, then test a push with the app closed before relying on reminders.

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_error text,
  created_at timestamptz not null default now()
);
```

Button presses are handled without the LLM: parse the callback data and call the domain function directly.

## 9. Google Calendar sync (Part 2)

A task with a clock time becomes an event on a dedicated "LifeOS" calendar in the user's personal Google account, and edits on either side update the other; the user's primary calendar is read-only and only feeds the agenda and the morning plan. This keeps two-way sync away from the user's real events.

### Setup

1. In Google Cloud Console create a project, enable the Google Calendar API, and create an OAuth client of type Web with redirect `https://<APP_DOMAIN>/api/google/callback`.
2. **Set the consent screen's publishing status to "In production".** In Testing status refresh tokens expire after 7 days and sync silently breaks. For one personal user the unverified-app warning is acceptable.
3. Scopes: least privilege, `calendar.app.created` (manage the app's own calendar) plus `calendar.readonly` (read the primary calendar). Confirm the exact names against the current Google docs; fall back to the full `calendar` scope if needed.
4. Request `access_type=offline` and `prompt=consent`. Store the refresh token encrypted (Supabase Vault or an encrypted column); refresh access tokens on the server.
5. On first connect, create the "LifeOS" calendar and save its id.

```sql
create table gcal_calendars (
  google_calendar_id text primary key,
  role text not null check (role in ('lifeos_rw','primary_ro')),
  sync_token text, channel_id text, channel_resource_id text, channel_token text, channel_expires_at timestamptz
);
create table gcal_links (
  task_id uuid primary key references tasks(id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null unique,
  etag text, google_updated_at timestamptz,
  local_updated_at timestamptz, last_synced_at timestamptz
);
create table calendar_events (      -- read-only cache of the primary calendar
  google_event_id text primary key, summary text, starts_at timestamptz, ends_at timestamptz, all_day boolean, updated_at timestamptz
);
create table gcal_outbox (
  id bigserial primary key, task_id uuid, op text check (op in ('upsert','delete')),
  attempts int not null default 0, last_error text, enqueued_at timestamptz default now(), done_at timestamptz
);
create table sync_conflicts (id bigserial primary key, task_id uuid, field text, local_value text, remote_value text, resolution text, at timestamptz default now());
```

### App to Google

- A trigger on `tasks` adds a `gcal_outbox` row when title, `due_at`, `duration_min`, status or `deleted_at` changes, and `due_at` is set.
- The worker runs right after the write and on every cron tick: insert the event if there is no link, otherwise patch it.
- Event start is `due_at`, end is `due_at + duration_min` (default 30 minutes), description links back to the task page, and `extendedProperties.private.lifeos_task_id` holds the task id.
- A completed task keeps its event with a "✓ " title prefix and a grey colour. A deleted task, or one whose `due_at` is cleared, deletes the event.
- Retry with exponential backoff, six attempts, then show the error on `/settings`.

### Google to app

- Poll every 10 minutes with `events.list(syncToken, showDeleted=true, singleEvents=true)`. On HTTP 410 do a full resync from 30 days back to 180 days ahead. Push notifications through `events.watch` are optional and only make it faster; renew channels daily.
- **Echo suppression:** if the event's `etag` equals the stored one, it is our own write, so skip it. Updates written from sync set the task's source to `gcal` so the outbox does not push them straight back.
- A moved or renamed LifeOS event updates `due_at`, `duration_min` and title on the task. A deleted event clears `due_at` and keeps the task, with a chat note. A new event created by hand on the LifeOS calendar becomes an unsorted task.
- Primary calendar events are only cached into `calendar_events`; never turned into tasks.

### Conflicts

If both sides changed since the last sync, resolve per field: for time fields the later change wins, since dragging in Calendar is the usual reschedule; for title and status the app wins. Log every conflict in `sync_conflicts` and mention conflicts in the nightly message. Recurring events on the LifeOS calendar are not supported in version 1: treat each instance as a separate event.

## 10. Analytics (Part 3)

Progress is measured by effort (estimated minutes), not task count, so a goal's remaining hours and projected finish date come out of the same numbers; every chart is backed by a named SQL view.

**Definitions:**

- **Effort of a task** = `coalesce(estimate_min, default_estimate_min)` (default 30). Show how many tasks have no estimate, so the forecast quality is visible.
- **Progress %** of a goal or project = effort of done tasks divided by effort of all non-deleted tasks, including tasks inside its projects.
- **Remaining hours** = effort of open tasks divided by 60.
- **Velocity** = effort completed on that goal in the last 14 days divided by 14 (minutes per day). If the goal had no completions, fall back to the global velocity times 0.25 and label it "rough".
- **Projected days** = remaining minutes divided by velocity; **projected date** = today plus projected days. **On track** if the projected date is on or before `target_date`.

```sql
create view v_task_effort as
select t.*, coalesce(t.estimate_min, (select default_estimate_min from app_config)) as effort_min
from tasks t where t.deleted_at is null;

create view v_goal_progress as
select g.id as goal_id, g.title, g.area_id, g.target_date,
  coalesce(sum(e.effort_min) filter (where e.status = 'done'), 0) as done_min,
  coalesce(sum(e.effort_min), 0) as total_min,
  coalesce(sum(e.effort_min) filter (where e.status <> 'done'), 0) as remaining_min,
  count(*) filter (where e.estimate_min is null) as unestimated
from goals g left join v_task_effort e on e.goal_id = g.id
where g.deleted_at is null group by g.id;

create view v_goal_velocity as
select goal_id,
  coalesce(sum(coalesce(estimate_min, (select default_estimate_min from app_config))), 0) / 14.0 as min_per_day
from task_events where event = 'completed' and at > now() - interval '14 days' group by goal_id;

create view v_completed_daily as
select (at at time zone 'Asia/Kolkata')::date as day, area_id, goal_id, count(*) as tasks,
  sum(coalesce(estimate_min, 30)) as effort_min
from task_events where event = 'completed' group by 1, 2, 3;
```

Build `v_project_progress` the same way as the goal view, grouped by `project_id`. Compute forecasts in TypeScript from these views, not in SQL, so the rules stay easy to change.

**Analytics page charts:**

| Chart | Source | Type |
| --- | --- | --- |
| Tasks completed per day, 30 and 90 days | `v_completed_daily` | Bar |
| Effort per day by Area | `v_completed_daily` | Stacked bar |
| Goal progress and projected date versus target | `v_goal_progress`, `v_goal_velocity` | Progress bars with date markers |
| Habit consistency, last 90 days | `habit_checkins` | Calendar heatmap per habit, plus current and longest streak |
| Spending by category, this month and last | `v_my_spending` | Bar |
| Mood over time | `journal_entries` | Line |

**Habit streak:** count consecutive days on which the habit was due and its check-in value met the target; days when the habit was not due neither extend nor break the streak.

The end-of-day review in section 8 and the `report` chat tool use the same views, so "how was my day" and "how far is goal X" return the same numbers the pages show.

## 11. Acceptance criteria

A part is done only when every check below passes on the deployed app, from the Android PWA and from Chrome on Mac. Write SQL asserts for the database checks and unit tests for the date parser and the resolver.

### Part 1: Core

- [ ] Signing in with any Google account other than the owner's is rejected.
- [ ] "Create a task Fix login redirect under project Website" creates a task whose goal and Area equal Website's. A direct SQL insert with a wrong `goal_id` is corrected by the trigger or rejected by the foreign key.
- [ ] Moving a project to another goal changes `goal_id` on all its tasks.
- [ ] On a Project page, saying "add a task call the vendor" creates it under that project; on a Task page the same sentence creates a subtask.
- [ ] With two tasks containing "login", "complete the login task" asks which one; replying "2" completes the second.
- [ ] "Add this command to the login task: npm test -- login" appends a code block to the notes, visible and editable on the Task page without losing it.
- [ ] Board and List views both work with all filters; filters survive a reload; dragging a card to Done sets `completed_at`.
- [ ] Goal page groups projects with their tasks; Project page groups tasks by status; Area pages show only that Area.
- [ ] "Undo" reverts the last agent action.
- [ ] The app installs as a PWA on Android and loads the dashboard in under 3 seconds on a normal connection.

### Part 2: Daily life

- [ ] The morning plan arrives at the configured time as a push notification on the Android PWA and in the web chat, with three must-do tasks; the nightly message arrives and the reply is saved as today's journal entry with a mood.
- [ ] A task due tomorrow at 4pm for one hour appears on the LifeOS calendar within 10 seconds; dragging it to 5pm in Google Calendar updates the task within 10 minutes.
- [ ] Renaming the task in chat updates the event; completing it greys the event; deleting the event unschedules the task and posts a note.
- [ ] Habit "did gym" checks in the habit and returns the current streak; a day when the habit was not due does not break the streak.
- [ ] Sync still works after 8 days (proves the refresh token does not expire).

### Part 3: Money and analytics

- [ ] "Spent 200 with my brother, half his" produces paid 200, share 100, owed +100 labelled brother; the wallet shows owed to me 100 in green and cash down 200.
- [ ] "Brother paid me back 100 on GPay" brings that label to 0 and raises the GPay balance by 100.
- [ ] "Ravi paid 600 for dinner for 3 of us" produces a record with paid 0, share 200, and I owe 200 shown in red.
- [ ] The month-end message lists both owed lists and the net.
- [ ] Analytics numbers match hand-checked SQL on a seeded dataset: progress, remaining hours, projected date and daily completions.

### Seed data for testing

Seed the four Areas, two goals, three projects, about 12 tasks with mixed statuses and estimates, three habits, and five expenses including one with a split.

## 12. Decisions, out of scope and open questions

**Decisions already made (do not revisit):**

- No nested free-form pages and no live wallpaper in this version.
- No self-hosting; Vercel and Supabase hosted services are fine.
- Google Calendar is the user's personal account; two-way sync only on a dedicated LifeOS calendar.
- Money is simplified to paid, my share and an owed amount, settled monthly; no per-person ledger or loan table.
- Goals, projects and tasks each have their own full page, grouped around that entity.
- Board and List views with filters on every list; one dashboard with client-routed subpages.
- The LLM is swappable behind the AI SDK; start with Claude, Gemini is an option later.

**Out of scope:** recurring tasks, budgets per category, voice notes, offline queue, web push, multi-user, data export (add a nightly CSV dump later if wanted).

**Defaults to use unless the owner says otherwise (listed so the agent does not stop to ask):**

| Question | Default |
| --- | --- |
| Morning plan and nightly review times | 07:30 and 21:30 IST |
| Mood scale | 1 to 5 numbers |
| Subtask depth | 3 levels in the database, shown nested in the UI |
| Accounts | One default account named Cash; the owner adds banks and UPI in `/settings` |
| Default estimate for tasks without one | 30 minutes |
| Notifications | Web Push to the installed Android PWA, plus the in-app chat feed |
| Category list | Food, Groceries, Transport, Rent, Bills, Shopping, Health, Entertainment, Family, Misc |

**Open questions for the owner (ask once, after Part 1 is working):**

1. Do push notifications arrive reliably on the Android PWA, and can the work laptop reach fcm.googleapis.com?
2. Should a Google Calendar event created by hand on the LifeOS calendar become a task? (default: yes)
3. Should completed tasks stay on the calendar greyed out, or be removed? (default: stay)
4. Are the Area names and the P0 to P3 priority labels right, or does he want others?
5. Import his existing AppFlowy goals and tasks once, through a seed script from a CSV export, or start clean? (default: start clean, then add by chat)
