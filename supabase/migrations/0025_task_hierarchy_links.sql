-- LifeOS 0025: the goal > project > task > subtask chain stays consistent.
--  * choosing only a goal drops a project that belongs to another goal (a project needs its goal)
--  * moving a task to another project/goal moves its subtasks with it, at every depth
--  * older rows that have a project but no goal, or subtasks out of step with their parent, are repaired

create or replace function tasks_inherit() returns trigger language plpgsql as $$
declare p record;
begin
  if new.parent_task_id is not null then
    select goal_id, project_id, area_id into p from tasks where id = new.parent_task_id;
    new.goal_id := p.goal_id; new.project_id := p.project_id;
    new.area_id := coalesce(new.area_id, p.area_id);
  else
    if tg_op = 'UPDATE' and new.project_id is not null
       and new.goal_id is distinct from old.goal_id and new.project_id is not distinct from old.project_id then
      if new.goal_id is null or not exists (select 1 from projects where id = new.project_id and goal_id = new.goal_id) then
        new.project_id := null;
      end if;
    end if;
    if new.project_id is not null then
      select goal_id, area_id into p from projects where id = new.project_id;
      new.goal_id := p.goal_id;
      new.area_id := coalesce(new.area_id, p.area_id);
    elsif new.goal_id is not null then
      select area_id into p from goals where id = new.goal_id;
      new.area_id := coalesce(new.area_id, p.area_id);
    end if;
  end if;
  return new;
end $$;

create or replace function tasks_cascade_links() returns trigger language plpgsql as $$
begin
  update tasks set project_id = new.project_id, goal_id = new.goal_id where parent_task_id = new.id;
  return null;
end $$;
create trigger tasks_cascade_links_au after update of project_id, goal_id on tasks
  for each row when (old.project_id is distinct from new.project_id or old.goal_id is distinct from new.goal_id)
  execute function tasks_cascade_links();

-- repair existing rows
update tasks t set goal_id = p.goal_id from projects p where t.project_id = p.id and t.goal_id is distinct from p.goal_id;
update tasks t set area_id = coalesce(p.area_id, g.area_id)
  from projects p, goals g where t.area_id is null and t.project_id = p.id and g.id = p.goal_id and coalesce(p.area_id, g.area_id) is not null;
update tasks t set area_id = g.area_id from goals g where t.area_id is null and t.goal_id = g.id and g.area_id is not null;
update tasks c set project_id = p.project_id, goal_id = p.goal_id
  from tasks p where c.parent_task_id = p.id and (c.project_id is distinct from p.project_id or c.goal_id is distinct from p.goal_id);
