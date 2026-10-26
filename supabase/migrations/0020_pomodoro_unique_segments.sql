-- LifeOS 0020: with the timer shared between devices, two of them can close the same phase at the same moment.
-- A segment is now stored once per run, start time and kind.
delete from pomodoro_segments a using pomodoro_segments b
  where a.ctid > b.ctid and a.run_id = b.run_id and a.started_at = b.started_at and a.kind = b.kind;
create unique index pomodoro_segments_once on pomodoro_segments (run_id, started_at, kind);
