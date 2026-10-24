-- LifeOS 0015: make calendar sync visible, and give habits a time block

create table calendar_sync_state (
  id boolean primary key default true check (id),
  last_polled_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_changed int not null default 0,
  cached_events int not null default 0
);
insert into calendar_sync_state default values;
alter table calendar_sync_state enable row level security;
create policy owner_all on calendar_sync_state for all to authenticated using (is_owner()) with check (is_owner());

-- a habit can have a start and end time, so it shows as a block on the day view
alter table habits add column if not exists start_time time;
alter table habits add column if not exists end_time time;
alter table habits add constraint habits_time_order check (end_time is null or start_time is null or end_time > start_time);
