-- LifeOS 0005: row level security (spec section 4)
-- Single user. Everything is readable/writable only by the owner's auth uid.
-- The server uses the service-role key, which bypasses RLS entirely.

create function is_owner() returns boolean language sql stable security definer as $$
  select auth.uid() is not null
     and auth.uid() = (select owner_user_id from app_config)
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'app_config','areas','goals','projects','tasks','task_events',
    'habits','habit_checkins','journal_entries','reminders','daily_plans',
    'chat_messages','agent_actions','job_runs',
    'accounts','categories','transactions',
    'push_subscriptions','google_tokens',
    'gcal_calendars','gcal_links','calendar_events','gcal_outbox','sync_conflicts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;

-- google_tokens holds the refresh token: no client ever needs it, not even the owner's session.
drop policy if exists owner_all on google_tokens;
revoke all on google_tokens from authenticated, anon;
