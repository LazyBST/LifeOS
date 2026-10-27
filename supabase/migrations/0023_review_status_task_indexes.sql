-- LifeOS 0023: an "In review" status for tasks, projects and goals, and indexes
-- for the task list filters (area, status + due date, created order).

insert into statuses
  (key, label, category, color, bg_color, fg_color, icon, description, applies_to, sort_order, board_order, is_default, default_for, strike_through, dim)
values
  ('review', 'In review', 'in_progress', '#7c3aed', '#ede9fe', '#5b21b6', 'eye', 'Done on my side, waiting for a check', '{task,project,goal}', 25, 3, false, '{}', false, false)
on conflict (key) do nothing;

-- the board gets a Review column between In progress and Done
update statuses set board_order = 4 where key = 'done' and board_order = 3;

create index if not exists tasks_area_id_idx on tasks (area_id) where deleted_at is null;
create index if not exists tasks_open_due_idx on tasks (due_date) where deleted_at is null and status <> 'done';
create index if not exists tasks_list_order_idx on tasks (sort_order, priority, created_at) where deleted_at is null;
