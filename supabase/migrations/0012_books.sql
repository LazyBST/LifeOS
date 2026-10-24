-- LifeOS 0012: books, reading log, and links from a book to anything else

-- statuses for books come from the one statuses table (migration 0006)
insert into statuses
  (key, label, category, color, bg_color, fg_color, icon, description, applies_to, sort_order, board_order, is_default, default_for, strike_through, dim)
values
  ('to_read',  'To read',  'todo',        '#64748b', '#e2e8f0', '#334155', 'circle',       'On the shelf, not started', '{book}', 70, null, true,  '{book}', false, false),
  ('reading',  'Reading',  'in_progress', '#7c3aed', '#ede9fe', '#5b21b6', 'loader-circle','Currently reading',         '{book}', 80, null, false, '{}',     false, false),
  ('finished', 'Finished', 'done',        '#16a34a', '#dcfce7', '#166534', 'circle-check', 'Read to the end',           '{book}', 90, null, false, '{}',     false, false);
update statuses set applies_to = array_append(applies_to, 'book') where key = 'dropped' and not ('book' = any(applies_to));
create unique index statuses_default_book on statuses ((1)) where is_default and 'book' = any(default_for);

create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  status text not null default 'to_read' references statuses(key) on update cascade,
  rating smallint check (rating between 1 and 5),
  total_pages int check (total_pages > 0),
  current_page int not null default 0 check (current_page >= 0),
  area_id uuid references areas(id),
  start_date date,                 -- planned start
  target_date date,                -- when you mean to finish it
  original_target_date date,       -- first agreed finish date, never edited
  started_on date,                 -- actually started
  finished_on date,                -- actually finished
  tags text[] not null default '{}',
  notes_md text not null default '',
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (total_pages is null or current_page <= total_pages)
);
create index on books (status) where deleted_at is null;
create index on books using gin (title gin_trgm_ops);

create trigger books_status_kind before insert or update of status on books
  for each row execute function status_applies('book');

-- first agreed finish date is set once; changes are logged with the others
create function track_book_deadline() returns trigger language plpgsql as $$
begin
  if new.original_target_date is null and new.target_date is not null then new.original_target_date := new.target_date; end if;
  if tg_op = 'UPDATE' and new.target_date is distinct from old.target_date and old.target_date is not null then
    new.original_target_date := coalesce(old.original_target_date, old.target_date);
    insert into deadline_changes (entity, entity_id, old_date, new_date) values ('book', new.id, old.target_date, new.target_date);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger books_deadline_biu before insert or update on books
  for each row execute function track_book_deadline();
alter table deadline_changes drop constraint if exists deadline_changes_entity_check;
alter table deadline_changes add constraint deadline_changes_entity_check check (entity in ('task','project','goal','book'));

-- reading sessions: pages per day feed pace, ETA and the life calendar
create table reading_log (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  read_on date not null default current_date,
  pages int not null check (pages >= 0),
  minutes int check (minutes >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index on reading_log (book_id, read_on);
create index on reading_log (read_on);

-- a book can be linked to any goal, project, task or habit (an Area is the book's own area_id)
create table book_links (
  book_id uuid not null references books(id) on delete cascade,
  entity_type text not null check (entity_type in ('goal','project','task','habit')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (book_id, entity_type, entity_id)
);
create index on book_links (entity_type, entity_id);

alter table books enable row level security;
alter table reading_log enable row level security;
alter table book_links enable row level security;
create policy owner_all on books for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on reading_log for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on book_links for all to authenticated using (is_owner()) with check (is_owner());
