-- LifeOS 0008: first-agreed deadlines + change log, completion dates, daily top-3,
-- journal improvement, calendar embed URL.

-- ---- first agreed deadline (set once, never edited) ----------------------
alter table tasks    add column original_due_date date;
alter table projects add column original_target_date date;
alter table goals    add column original_target_date date;
alter table projects add column completed_on date;
alter table goals    add column completed_on date;

update tasks    set original_due_date    = due_date    where original_due_date is null and due_date is not null;
update projects set original_target_date = target_date where original_target_date is null and target_date is not null;
update goals    set original_target_date = target_date where original_target_date is null and target_date is not null;

-- every change of an agreed deadline is logged, so "slipped 3 times" is a query
create table deadline_changes (
  id bigserial primary key,
  entity text not null check (entity in ('task','project','goal')),
  entity_id uuid not null,
  old_date date,
  new_date date,
  at timestamptz not null default now()
);
create index on deadline_changes (entity, entity_id);

create function track_task_deadline() returns trigger language plpgsql as $$
begin
  if new.original_due_date is null and new.due_date is not null then new.original_due_date := new.due_date; end if;
  if tg_op = 'UPDATE' and new.due_date is distinct from old.due_date and old.due_date is not null then
    new.original_due_date := coalesce(old.original_due_date, old.due_date);   -- the original can never move
    insert into deadline_changes (entity, entity_id, old_date, new_date) values ('task', new.id, old.due_date, new.due_date);
  end if;
  return new;
end $$;
create trigger tasks_deadline_biu before insert or update of due_date on tasks
  for each row execute function track_task_deadline();

create function track_target_deadline() returns trigger language plpgsql as $$
declare kind text := tg_argv[0];
begin
  if new.original_target_date is null and new.target_date is not null then new.original_target_date := new.target_date; end if;
  if tg_op = 'UPDATE' then
    if new.target_date is distinct from old.target_date and old.target_date is not null then
      new.original_target_date := coalesce(old.original_target_date, old.target_date);
      insert into deadline_changes (entity, entity_id, old_date, new_date) values (kind, new.id, old.target_date, new.target_date);
    end if;
    if new.status = 'done' and old.status <> 'done' then new.completed_on := (now() at time zone 'Asia/Kolkata')::date; end if;
    if new.status <> 'done' then new.completed_on := null; end if;
  end if;
  return new;
end $$;
create trigger projects_deadline_biu before insert or update of target_date, status on projects
  for each row execute function track_target_deadline('project');
create trigger goals_deadline_biu before insert or update of target_date, status on goals
  for each row execute function track_target_deadline('goal');

-- ---- today's top 3 ---------------------------------------------------------
create table daily_priorities (
  plan_date date not null,
  position smallint not null check (position between 1 and 3),
  text text not null,
  task_id uuid references tasks(id) on delete set null,
  done_at timestamptz,
  primary key (plan_date, position)
);

-- ---- journal: one improvement to carry into tomorrow ----------------------
alter table journal_entries add column improvement text;
alter table journal_entries add column improvement_followed_at timestamptz;

-- ---- google calendar embed widget -----------------------------------------
alter table app_config add column calendar_embed_url text;

-- ---- RLS ---------------------------------------------------------------
alter table deadline_changes enable row level security;
alter table daily_priorities enable row level security;
create policy owner_all on deadline_changes for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on daily_priorities for all to authenticated using (is_owner()) with check (is_owner());
