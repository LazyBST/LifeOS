-- LifeOS 0010: Google Tasks <-> habits sync state
create table gtasks_sync_state (
  id boolean primary key default true check (id),
  last_polled_at timestamptz,
  last_error text,
  last_pulled int not null default 0,
  last_pushed int not null default 0
);
insert into gtasks_sync_state default values;
alter table gtasks_sync_state enable row level security;
create policy owner_all on gtasks_sync_state for all to authenticated using (is_owner()) with check (is_owner());

-- optional per-habit override of the Google Task title to match (default: the habit name)
alter table habits add column if not exists gtask_title text;
