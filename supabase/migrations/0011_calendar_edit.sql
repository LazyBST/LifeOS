-- LifeOS 0011: edit events on the primary calendar from the app, with an undo log
alter table calendar_events add column if not exists etag text;
alter table calendar_events add column if not exists description text;
alter table calendar_events add column if not exists location text;
alter table calendar_events add column if not exists recurring boolean not null default false;
alter table calendar_events add column if not exists can_edit boolean not null default true;
alter table calendar_events add column if not exists html_link text;

-- every change the app makes to your real calendar keeps its before-state, so it can be undone
create table calendar_edit_log (
  id bigserial primary key,
  op text not null check (op in ('create','update','delete')),
  google_event_id text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  undone_at timestamptz
);
alter table calendar_edit_log enable row level security;
create policy owner_all on calendar_edit_log for all to authenticated using (is_owner()) with check (is_owner());
