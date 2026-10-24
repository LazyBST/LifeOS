-- LifeOS 0014: synced UI state, habit links to anything, and indexes for the queries the app runs most

-- 1. UI state that should follow you across devices (the dashboard layout)
create table ui_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table ui_state enable row level security;
create policy owner_all on ui_state for all to authenticated using (is_owner()) with check (is_owner());

-- 2. A habit can serve any number of goals, projects and tasks (the old goal_id / task_id columns are copied in)
create table habit_links (
  habit_id uuid not null references habits(id) on delete cascade,
  entity_type text not null check (entity_type in ('goal','project','task')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, entity_type, entity_id)
);
create index habit_links_entity_idx on habit_links (entity_type, entity_id);
alter table habit_links enable row level security;
create policy owner_all on habit_links for all to authenticated using (is_owner()) with check (is_owner());
insert into habit_links (habit_id, entity_type, entity_id) select id, 'goal', goal_id from habits where goal_id is not null on conflict do nothing;
insert into habit_links (habit_id, entity_type, entity_id)
  select id, 'task', task_id from habits where task_id is not null and exists (select 1 from information_schema.columns where table_name='habits' and column_name='task_id') on conflict do nothing;

-- 3. Indexes (all partial where the app always filters deleted rows out)
create index if not exists tasks_area_idx            on tasks (area_id) where deleted_at is null;
create index if not exists tasks_open_due_idx        on tasks (due_date) where deleted_at is null and status <> 'done';
create index if not exists tasks_completed_idx       on tasks (completed_at) where deleted_at is null and status = 'done';
create index if not exists tasks_project_status_idx  on tasks (project_id, status) where deleted_at is null;
create index if not exists tasks_goal_status_idx     on tasks (goal_id, status) where deleted_at is null;
create index if not exists tasks_due_at_idx          on tasks (due_at) where due_at is not null and deleted_at is null;
create index if not exists tasks_sort_idx            on tasks (sort_order) where deleted_at is null;
create index if not exists goals_status_idx          on goals (status) where deleted_at is null;
create index if not exists goals_area_idx            on goals (area_id) where deleted_at is null;
create index if not exists projects_goal_idx         on projects (goal_id) where deleted_at is null;
create index if not exists projects_status_idx       on projects (status) where deleted_at is null;
create index if not exists projects_area_idx         on projects (area_id) where deleted_at is null;
create index if not exists task_events_at_idx        on task_events (at);
create index if not exists task_events_event_at_idx  on task_events (event, at);
create index if not exists task_events_goal_idx      on task_events (goal_id);
create index if not exists habit_checkins_date_idx   on habit_checkins (checkin_date);
create index if not exists habits_active_idx         on habits (created_at) where archived_at is null;
create index if not exists chat_messages_recent_idx  on chat_messages (created_at desc);
create index if not exists agent_actions_recent_idx  on agent_actions (id desc) where undone_at is null;
create index if not exists transactions_account_idx  on transactions (account_id, occurred_on) where deleted_at is null;
create index if not exists transactions_label_idx    on transactions (counterparty) where deleted_at is null;
create index if not exists calendar_events_start_idx on calendar_events (starts_at);
create index if not exists calendar_events_end_idx   on calendar_events (ends_at);
create index if not exists gcal_outbox_pending_idx   on gcal_outbox (id) where done_at is null;
create index if not exists books_updated_idx         on books (updated_at desc) where deleted_at is null;
