-- LifeOS 0002: money model (spec section 5)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,                      -- 'Cash', 'HDFC', 'GPay'
  opening_balance numeric(12,2) not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz
);
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into categories (name) values ('Food'),('Groceries'),('Transport'),('Rent'),('Bills'),('Shopping'),('Health'),('Entertainment'),('Family'),('Misc');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  kind text not null check (kind in ('expense','income','settlement')),
  description text,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  amount numeric(12,2) not null,   -- expense/income: cash moved, >= 0. settlement: signed, + received, - paid
  my_share numeric(12,2),          -- expenses only; defaults to amount
  counterparty text,               -- optional free-text label, e.g. 'brother'; groups the owed list
  note text,
  raw_text text,                   -- what the user said to the chat
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'settlement' or amount >= 0),
  check (kind <> 'expense' or (my_share is not null and my_share >= 0)),
  check (kind = 'expense' or my_share is null)
);
create index on transactions (occurred_on);

-- owed per label: expenses add (amount - my_share), settlements subtract their signed amount
create view v_owed_by_label as
select coalesce(counterparty, 'unspecified') as label,
       sum(case when kind = 'expense' then amount - my_share
                when kind = 'settlement' then -amount else 0 end) as owed   -- >0 they owe me, <0 I owe
from transactions where deleted_at is null
group by 1;

create view v_account_balances as
select a.id, a.name,
  a.opening_balance
  + coalesce(sum(case when t.kind in ('income','settlement') then t.amount
                      when t.kind = 'expense' then -t.amount end), 0) as balance
from accounts a
left join transactions t on t.account_id = a.id and t.deleted_at is null
group by a.id;

create view v_wallet as
select
  (select coalesce(sum(balance),0) from v_account_balances)            as cash_on_hand,
  (select coalesce(sum(owed) filter (where owed > 0),0) from v_owed_by_label)  as owed_to_me,
  (select coalesce(-sum(owed) filter (where owed < 0),0) from v_owed_by_label) as i_owe,
  (select coalesce(sum(balance),0) from v_account_balances)
   + (select coalesce(sum(owed),0) from v_owed_by_label)               as net;

create view v_my_spending as   -- analytics use my share, never the cash paid
select occurred_on, category_id, my_share as amount
from transactions where kind = 'expense' and deleted_at is null;
