-- A catch-all Area with a yellow colour.
insert into areas (name, color, sort_order)
select 'Miscellaneous', '#eab308', coalesce(max(sort_order), 0) + 1 from areas
on conflict (name) do nothing;
