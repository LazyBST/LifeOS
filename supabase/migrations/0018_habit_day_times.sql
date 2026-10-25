-- LifeOS 0018: a habit's time on one particular day. Moving a habit on the calendar changes only that day;
-- every other day keeps the habit's own start/end time (habits.start_time / end_time).
create table habit_day_times (
  habit_id uuid not null references habits(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time,
  primary key (habit_id, day),
  check (end_time is null or end_time > start_time)
);
create index on habit_day_times (day);

alter table habit_day_times enable row level security;
create policy owner_all on habit_day_times for all to authenticated using (is_owner()) with check (is_owner());
