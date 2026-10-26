-- LifeOS 0021: transactions with the amount others owe you (or you owe) worked out, so the transactions page can filter on it.
create view v_transactions_owed as
select t.*,
  case when t.kind = 'expense' then t.amount - coalesce(t.my_share, t.amount)
       when t.kind = 'settlement' then -t.amount
       else 0 end as owed          -- > 0 they owe me, < 0 I owe
from transactions t
where t.deleted_at is null;
