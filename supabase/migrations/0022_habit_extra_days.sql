-- LifeOS 0022: a habit can be moved to another day of the week (Saturday's to Sunday). The new day is an "extra"
-- occurrence: it shows on the calendar and counts when done. A skipped day is stored as a check-in with value -2.
alter table habit_day_times add column extra boolean not null default false;
alter table habit_day_times alter column start_time drop not null;   -- an extra day of an untimed habit has no time
