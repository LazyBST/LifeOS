-- LifeOS 0007: life calendar settings (birth date and expected lifespan)
alter table app_config add column if not exists birth_date date;
alter table app_config add column if not exists lifespan_years int not null default 80 check (lifespan_years between 1 and 120);
