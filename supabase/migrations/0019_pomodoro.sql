-- LifeOS 0019: Pomodoro. One row per work or break segment that ran (finished or stopped early).
create table pomodoro_segments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,                  -- one start-to-stop run of the timer
  day date not null,                     -- the IST day the segment started on
  kind text not null check (kind in ('work','break')),
  label text,                            -- what the calendar said you were working on
  planned_sec int not null check (planned_sec >= 0),
  actual_sec int not null check (actual_sec >= 0),   -- time actually spent, pauses excluded
  paused_sec int not null default 0,
  pauses int not null default 0,
  completed boolean not null default false,          -- ran to its end rather than being skipped or stopped
  started_at timestamptz not null,
  ended_at timestamptz not null
);
create index on pomodoro_segments (day);
create index on pomodoro_segments (run_id);

alter table pomodoro_segments enable row level security;
create policy owner_all on pomodoro_segments for all to authenticated using (is_owner()) with check (is_owner());
