-- LifeOS 0013: remember where imported rows came from, so an import can be re-run without duplicating
alter table goals    add column if not exists external_id text;
alter table projects add column if not exists external_id text;
alter table tasks    add column if not exists external_id text;
alter table habits   add column if not exists external_id text;
create unique index if not exists goals_external_id_key    on goals (external_id)    where external_id is not null;
create unique index if not exists projects_external_id_key on projects (external_id) where external_id is not null;
create unique index if not exists tasks_external_id_key    on tasks (external_id)    where external_id is not null;
create unique index if not exists habits_external_id_key   on habits (external_id)   where external_id is not null;
