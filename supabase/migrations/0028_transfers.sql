-- Transfers between your own accounts, and income categories. Safe to run twice.

-- a transfer moves money between two of your accounts: not income, not spending
alter table transactions add column if not exists to_account_id uuid references accounts(id);
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'transactions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'kind = ANY'
  loop execute format('alter table transactions drop constraint %I', c); end loop;
end $$;
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check check (kind in ('expense','income','settlement','transfer'));
alter table transactions drop constraint if exists transactions_transfer_check;
alter table transactions add constraint transactions_transfer_check check (
  (kind = 'transfer' and account_id is not null and to_account_id is not null and account_id <> to_account_id)
  or (kind <> 'transfer' and to_account_id is null));

-- balances: a transfer takes the amount out of one account and puts it in the other
create or replace view v_account_balances as
select a.id, a.name,
  a.opening_balance
  + coalesce((select sum(case when t.kind in ('income','settlement') then t.amount
                              when t.kind in ('expense','transfer') then -t.amount end)
              from transactions t where t.account_id = a.id and t.deleted_at is null), 0)
  + coalesce((select sum(t.amount) from transactions t
              where t.kind = 'transfer' and t.to_account_id = a.id and t.deleted_at is null), 0) as balance
from accounts a;

-- the owed view lists the table's columns, so it is rebuilt to include the new ones
drop view if exists v_transactions_owed;
create view v_transactions_owed as
select t.*,
  case when t.kind = 'expense' then t.amount - coalesce(t.my_share, t.amount)
       when t.kind = 'settlement' then -t.amount
       else 0 end as owed
from transactions t
where t.deleted_at is null;

-- income can be categorised too
insert into categories (name) values ('Salary'), ('Refund') on conflict (name) do nothing;
