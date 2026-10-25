-- LifeOS 0017: the first agreed deadline and the completion date can be corrected by hand (e.g. after an import).
-- The triggers still fill them in automatically; they just no longer overwrite a value that was set on purpose.

create or replace function track_task_deadline() returns trigger language plpgsql as $$
begin
  if new.original_due_date is null and new.due_date is not null then new.original_due_date := new.due_date; end if;
  if tg_op = 'UPDATE' and new.due_date is distinct from old.due_date and old.due_date is not null then
    if new.original_due_date is not distinct from old.original_due_date then   -- keep it unless it was edited in the same update
      new.original_due_date := coalesce(old.original_due_date, old.due_date);
    end if;
    insert into deadline_changes (entity, entity_id, old_date, new_date) values ('task', new.id, old.due_date, new.due_date);
  end if;
  return new;
end $$;

create or replace function track_target_deadline() returns trigger language plpgsql as $$
declare kind text := tg_argv[0];
begin
  if new.original_target_date is null and new.target_date is not null then new.original_target_date := new.target_date; end if;
  if tg_op = 'UPDATE' then
    if new.target_date is distinct from old.target_date and old.target_date is not null then
      if new.original_target_date is not distinct from old.original_target_date then
        new.original_target_date := coalesce(old.original_target_date, old.target_date);
      end if;
      insert into deadline_changes (entity, entity_id, old_date, new_date) values (kind, new.id, old.target_date, new.target_date);
    end if;
    if new.status = 'done' and old.status <> 'done' and new.completed_on is not distinct from old.completed_on then
      new.completed_on := (now() at time zone 'Asia/Kolkata')::date;
    end if;
    if new.status <> 'done' and new.completed_on is not distinct from old.completed_on then new.completed_on := null; end if;
  end if;
  return new;
end $$;
