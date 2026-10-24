-- LifeOS 0003: web push + google calendar sync (spec sections 8, 9)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_error text,
  created_at timestamptz not null default now()
);

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

-- encrypted-at-rest-by-platform token store for the owner's Google account.
-- Only the server (service role) ever reads this; RLS denies everything else.
create table google_tokens (
  id boolean primary key default true check (id),
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  connected_email text,
  updated_at timestamptz not null default now()
);

-- app -> google: enqueue an outbox row whenever a scheduled task changes
create function tasks_gcal_enqueue() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.due_at is not null and new.deleted_at is null then
      insert into gcal_outbox (task_id, op) values (new.id, 'upsert');
    end if;
  else
    if new.deleted_at is not null and old.deleted_at is null then
      insert into gcal_outbox (task_id, op) values (new.id, 'delete');
    elsif new.due_at is null and old.due_at is not null then
      insert into gcal_outbox (task_id, op) values (new.id, 'delete');
    elsif new.due_at is not null and (
         new.due_at is distinct from old.due_at
      or new.title is distinct from old.title
      or new.duration_min is distinct from old.duration_min
      or new.status is distinct from old.status) then
      insert into gcal_outbox (task_id, op) values (new.id, 'upsert');
    end if;
  end if;
  return null;
end $$;
create trigger tasks_gcal_ai after insert or update on tasks
  for each row execute function tasks_gcal_enqueue();
