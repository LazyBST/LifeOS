-- LifeOS 0006: one status table for every entity (goals, projects, tasks, ...).
-- Replaces the per-table CHECK lists. The row defines the label, the colour
-- coding and the UI hints, so the UI never hard-codes a status again.

create table statuses (
  key text primary key,                       -- stored on goals/projects/tasks
  label text not null,                        -- 'In progress'
  category text not null check (category in ('todo','in_progress','done','inactive')),  -- Jira-style status category
  color text not null,                        -- accent hex, e.g. '#2563eb'
  bg_color text not null,                     -- badge / lozenge background
  fg_color text not null,                     -- badge / lozenge text
  icon text,                                  -- lucide icon name
  description text,
  applies_to text[] not null default '{task,project,goal}',  -- which entity kinds may offer it
  sort_order int not null default 0,          -- order in dropdowns
  board_order int,                            -- column order on a board; null = not a board column
  is_default boolean not null default false,  -- default for new rows of the kinds in default_for
  default_for text[] not null default '{}',
  strike_through boolean not null default false,   -- cross out titles (done/dropped)
  dim boolean not null default false,              -- render muted
  created_at timestamptz not null default now()
);

insert into statuses
  (key, label, category, color, bg_color, fg_color, icon, description, applies_to, sort_order, board_order, is_default, default_for, strike_through, dim)
values
  ('todo',    'Not started', 'todo',        '#64748b', '#e2e8f0', '#334155', 'circle',        'Planned, not begun',                 '{task}',                  10, 1,    true,  '{task}',          false, false),
  ('doing',   'In progress', 'in_progress', '#2563eb', '#dbeafe', '#1e40af', 'loader-circle', 'Actively being worked on',           '{task}',                  20, 2,    false, '{}',              false, false),
  ('done',    'Done',        'done',        '#16a34a', '#dcfce7', '#166534', 'circle-check',  'Finished',                           '{task,project,goal}',     30, 3,    false, '{}',              true,  true),
  ('active',  'Active',      'in_progress', '#2563eb', '#dbeafe', '#1e40af', 'play',          'Currently pursued',                  '{project,goal}',          40, null, true,  '{project,goal}',  false, false),
  ('paused',  'Paused',      'inactive',    '#d97706', '#fef3c7', '#92400e', 'pause',         'On hold for now',                    '{project,goal}',          50, null, false, '{}',              false, true),
  ('dropped', 'Dropped',     'inactive',    '#dc2626', '#fee2e2', '#991b1b', 'circle-x',      'Abandoned',                          '{project,goal}',          60, null, false, '{}',              true,  true);

-- exactly one default per entity kind
create unique index statuses_default_task    on statuses ((1)) where is_default and 'task'    = any(default_for);
create unique index statuses_default_project on statuses ((1)) where is_default and 'project' = any(default_for);
create unique index statuses_default_goal    on statuses ((1)) where is_default and 'goal'    = any(default_for);

-- every status column becomes a foreign key into the table
alter table goals    drop constraint if exists goals_status_check;
alter table projects drop constraint if exists projects_status_check;
alter table tasks    drop constraint if exists tasks_status_check;

alter table goals    add constraint goals_status_fkey    foreign key (status) references statuses(key) on update cascade;
alter table projects add constraint projects_status_fkey foreign key (status) references statuses(key) on update cascade;
alter table tasks    add constraint tasks_status_fkey    foreign key (status) references statuses(key) on update cascade;

-- the entity kind is enforced too: a task cannot be 'paused', a goal cannot be 'doing'
create function status_applies() returns trigger language plpgsql as $$
declare kind text := tg_argv[0];
begin
  if not exists (select 1 from statuses where key = new.status and kind = any(applies_to)) then
    raise exception 'status % is not valid for a %', new.status, kind using errcode = '23514';
  end if;
  return new;
end $$;
create trigger goals_status_kind    before insert or update of status on goals    for each row execute function status_applies('goal');
create trigger projects_status_kind before insert or update of status on projects for each row execute function status_applies('project');
create trigger tasks_status_kind    before insert or update of status on tasks    for each row execute function status_applies('task');

alter table statuses enable row level security;
create policy owner_all on statuses for all to authenticated using (is_owner()) with check (is_owner());

-- human-friendly issue key (LIFE-12), shown on board cards; existing rows are numbered automatically
alter table tasks add column task_no bigint generated by default as identity;
create unique index tasks_task_no_key on tasks (task_no);
