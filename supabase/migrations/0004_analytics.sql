-- LifeOS 0004: analytics views (spec section 10)
create view v_task_effort as
select t.*, coalesce(t.estimate_min, (select default_estimate_min from app_config)) as effort_min
from tasks t where t.deleted_at is null;

create view v_goal_progress as
select g.id as goal_id, g.title, g.area_id, g.target_date,
  coalesce(sum(e.effort_min) filter (where e.status = 'done'), 0) as done_min,
  coalesce(sum(e.effort_min), 0) as total_min,
  coalesce(sum(e.effort_min) filter (where e.status <> 'done'), 0) as remaining_min,
  count(*) filter (where e.estimate_min is null) as unestimated
from goals g left join v_task_effort e on e.goal_id = g.id
where g.deleted_at is null group by g.id;

create view v_goal_velocity as
select goal_id,
  coalesce(sum(coalesce(estimate_min, (select default_estimate_min from app_config))), 0) / 14.0 as min_per_day
from task_events where event = 'completed' and at > now() - interval '14 days' group by goal_id;

create view v_completed_daily as
select (at at time zone 'Asia/Kolkata')::date as day, area_id, goal_id, count(*) as tasks,
  sum(coalesce(estimate_min, 30)) as effort_min
from task_events where event = 'completed' group by 1, 2, 3;

create view v_project_progress as
select p.id as project_id, p.title, p.goal_id, p.area_id, p.target_date,
  coalesce(sum(e.effort_min) filter (where e.status = 'done'), 0) as done_min,
  coalesce(sum(e.effort_min), 0) as total_min,
  coalesce(sum(e.effort_min) filter (where e.status <> 'done'), 0) as remaining_min,
  count(*) filter (where e.estimate_min is null) as unestimated
from projects p left join v_task_effort e on e.project_id = p.id
where p.deleted_at is null group by p.id;

-- global fallback velocity (minutes completed per day over the last 14 days)
create view v_global_velocity as
select coalesce(sum(coalesce(estimate_min, (select default_estimate_min from app_config))), 0) / 14.0 as min_per_day
from task_events where event = 'completed' and at > now() - interval '14 days';
