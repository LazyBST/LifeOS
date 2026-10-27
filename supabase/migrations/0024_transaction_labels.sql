-- LifeOS 0024: labels on transactions (Necessity, Luxury, ... your own), next to the category.
-- A transaction carries label names in a text[]; the labels table is the managed list with colours.

create table transaction_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#64748b',
  created_at timestamptz not null default now()
);
insert into transaction_labels (name, color) values ('Necessity', '#10b981'), ('Luxury', '#a855f7');
alter table transaction_labels enable row level security;
create policy owner_all on transaction_labels for all to authenticated using (is_owner()) with check (is_owner());

alter table transactions add column labels text[] not null default '{}';
create index transactions_labels_idx on transactions using gin (labels) where deleted_at is null;

-- the owed view lists the table's columns, so it has to be rebuilt to include labels
drop view if exists v_transactions_owed;
create view v_transactions_owed as
select t.*,
  case when t.kind = 'expense' then t.amount - coalesce(t.my_share, t.amount)
       when t.kind = 'settlement' then -t.amount
       else 0 end as owed
from transactions t
where t.deleted_at is null;
