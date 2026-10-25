-- LifeOS 0016: monthly budgets per category and scheduled (recurring or one-off) payments

create table budgets (
  category_id uuid primary key references categories(id) on delete cascade,
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  updated_at timestamptz not null default now()
);

create table scheduled_payments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  amount numeric(12,2) not null check (amount >= 0),
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  frequency text not null default 'monthly' check (frequency in ('once','weekly','biweekly','monthly','quarterly','yearly')),
  next_due date not null,            -- the next payment that has not happened yet
  end_date date,                     -- last day it can fall on, if it ends
  active boolean not null default true,
  last_paid_on date,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date is null or end_date >= next_due)
);
create index on scheduled_payments (next_due) where deleted_at is null and active;

alter table budgets enable row level security;
alter table scheduled_payments enable row level security;
create policy owner_all on budgets for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on scheduled_payments for all to authenticated using (is_owner()) with check (is_owner());
