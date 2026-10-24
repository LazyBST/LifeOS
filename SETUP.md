# LifeOS — setup for Ayush

Everything in this repo is built and committed, but nothing has been deployed
and no account has been created for you. These are the steps only you can do,
in order. Each one is a single sitting; the whole list is about 45 minutes.

Nothing here needs to be shared with anyone: all secrets stay in Supabase,
Google Cloud and Vercel.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard>, sign in, **New project**.
2. Name it `lifeos`, pick the region closest to you (Mumbai / `ap-south-1`),
   and set a strong database password. Save that password in your password
   manager.
3. Wait for the project to finish provisioning.

## 2. Run the migrations, in order

In the Supabase dashboard open **SQL Editor** → **New query**, then paste and
run each file from `supabase/migrations/` **one at a time, in this order**:

1. `0001_core.sql` — app_config, areas, goals, projects, tasks, triggers,
   habits, journal, reminders, chat, audit
2. `0002_money.sql` — accounts, categories, transactions and the money views
3. `0003_push_calendar.sql` — push subscriptions, Google Calendar tables, the
   Google token store and the calendar outbox trigger
4. `0004_analytics.sql` — the analytics views
5. `0005_rls.sql` — row level security on every table
6. `0006_statuses.sql` — the `statuses` table that defines every status, its colours and board columns
7. `0007_life_calendar.sql` — birth date and lifespan for the life calendar
8. `0008_deadlines_priorities.sql` — first agreed deadlines and their change log, completion dates, daily top 3, journal improvement, calendar embed link

Then, only if you want test data to click around in:

9. `0009_habit_task_link.sql` — habits can hang off a task
10. `0010_gtasks_sync.sql` — Google Tasks ↔ habits sync state
11. `0011_calendar_edit.sql` — edit events on your main calendar from the app, with an undo log
12. `supabase/seed.sql` — four Areas are already inserted by `0001`; this adds
   two goals, three projects, about a dozen tasks, three habits, five
   transactions and two journal entries.

If a statement fails, stop and fix it before running the next file — the later
files depend on the earlier ones.

## 3. Enable Google sign-in and lock it to your email

1. Supabase → **Authentication** → **Sign In / Providers** → enable **Google**.
2. You need a Google OAuth client for this. Do step 7 first if you prefer to
   create one client for both sign-in and Calendar, or create a separate one
   now — either works.
3. Paste the client id and client secret into Supabase, and copy the
   **Callback URL** Supabase shows you
   (`https://<project>.supabase.co/auth/v1/callback`) into the Google client's
   *Authorized redirect URIs*.
4. Supabase → **Authentication** → **URL Configuration**: set the Site URL to
   your deployed app URL, and add `http://localhost:3000` and
   `https://<your-app>.vercel.app/auth/callback` as redirect URLs.
5. Set `OWNER_EMAIL` (step 8) to the Gmail address you will sign in with. Any
   other Google account is signed out immediately by `lib/auth.ts`, and the
   first successful sign-in records your user id in `app_config.owner_user_id`,
   which every row-level-security policy checks from then on.


### Sign-in troubleshooting

- **Google sign-in lands on `localhost` from the Vercel site.** Supabase falls
  back to its *Site URL* whenever the `redirectTo` is not on the allow-list.
  In Supabase → Authentication → URL Configuration set **Site URL** to your
  Vercel URL and add `https://<your-app>.vercel.app/**` and
  `http://localhost:3000/**` under **Redirect URLs**. The app now builds the
  redirect from the incoming request, so `APP_URL` no longer matters for login.
- **"That Google account is not the owner."** The email you signed in with
  differs from `OWNER_EMAIL` (compared case-insensitively). Fix the env var in
  `.env` locally and in Vercel, then restart/redeploy.
- **"A different user is already recorded as owner."** An earlier sign-in with
  another Google account claimed `app_config.owner_user_id`. Reset it in the
  SQL editor: `update app_config set owner_user_id = null;` and sign in again.
- Use the same port everywhere: `npm run dev` serves on 3000, and the Supabase
  redirect URL must match the port you open.

## 4. Create the Anthropic API key

1. Go to <https://console.anthropic.com/settings/keys>, create a key named
   `lifeos`.
2. Copy it into `ANTHROPIC_API_KEY` (step 8). It is read only on the server.
3. Optional: set a monthly spend limit on the console while you are there.

## 5. Generate the Web Push (VAPID) keys

Run exactly this in the project folder:

```bash
npx web-push generate-vapid-keys
```

It prints a public key and a private key. Set:

- `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to the **public** key
  (the same value in both — the browser needs it to subscribe),
- `VAPID_PRIVATE_KEY` to the **private** key,
- `VAPID_SUBJECT` to `mailto:your@email.com`.

## 6. Create the Google OAuth client for Calendar

1. <https://console.cloud.google.com> → create a project `lifeos`.
2. **APIs & Services** → **Library** → enable **Google Calendar API**.
3. **APIs & Services** → **OAuth consent screen**: External, fill in the app
   name and your email.
4. **Set the publishing status to "In production".** This matters: in *Testing*
   status Google expires refresh tokens after 7 days and calendar sync breaks
   silently. For a personal single-user app the "unverified app" warning on
   first sign-in is fine — click through it.
5. Scopes: `https://www.googleapis.com/auth/calendar` (full access, so LifeOS can edit your main calendar as well as its own LifeOS calendar) and, for habit sync, `https://www.googleapis.com/auth/tasks`.
6. **Credentials** → **Create credentials** → **OAuth client ID** → type
   **Web application**. Authorized redirect URIs:
   - `https://<your-app-domain>/api/google/callback`
   - `http://localhost:3000/api/google/callback` (for local testing)
   - plus the Supabase callback from step 3 if you are reusing this client for
     sign-in.
7. Copy the client id and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
8. After the app is deployed, open `/settings` and press **Connect Google
   Calendar**. The first connect creates a calendar called **LifeOS** in your
   account and saves its id; your primary calendar stays read-only.

### Google Tasks ↔ habits (optional)

1. In Google Cloud (same project as step 6) → **APIs & Services** → **Library** → enable **Google Tasks API**.
2. In the OAuth consent screen scopes, add `https://www.googleapis.com/auth/tasks`.
3. In LifeOS **/settings**, disconnect Google and connect again so Google asks for Tasks access.
4. Keep each habit as a Google Task with the same title as the habit (emoji and capitals are ignored). Completing it checks the habit in within 10 minutes; checking the habit in LifeOS completes the open task. Google Tasks only stores a due *date*, so LifeOS can match by title and day but cannot read or set the time of day.

## 7. Deploy to Vercel and set the environment variables

1. Push this folder to a GitHub repo (private).
2. <https://vercel.com/new> → import the repo → framework **Next.js** →
   Deploy. The first build will fail or the app will error until the env vars
   below are set; that is expected.
3. Vercel → Project → **Settings** → **Environment Variables**, add every
   variable from `.env.example` for Production (and Preview if you want):

   | Variable | Where it comes from |
   | --- | --- |
   | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
   | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (**server only**) |
   | `OWNER_EMAIL` | your Gmail address |
   | `ANTHROPIC_API_KEY` | step 4 |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | step 5 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | step 6 |
   | `APP_URL`, `NEXT_PUBLIC_APP_URL` | your deployed URL, e.g. `https://lifeos.vercel.app` |

4. Redeploy. Then sign in once with your Google account so
   `app_config.owner_user_id` is filled in.
5. If `*.vercel.app` is blocked on the work VPN, add a plain custom domain in
   Vercel and update `APP_URL`, `NEXT_PUBLIC_APP_URL`, the Supabase redirect
   URLs and the Google redirect URI to match.

## 8. Schedule the cron tick in Supabase

Supabase → **Database** → **Extensions**: enable `pg_cron` and `pg_net`.
Then in the SQL editor, with your real domain and the same `CRON_SECRET` you
set in Vercel:

```sql
select cron.schedule('lifeos-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://<APP_DOMAIN>/api/cron/tick',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  )
$$);
```

Check it is running with `select * from cron.job;` and
`select * from cron.job_run_details order by start_time desc limit 10;`.
To change it later: `select cron.unschedule('lifeos-tick');` then re-run the
statement above.

## 9. Install the PWA on Android and turn on notifications

1. Open the deployed URL in Chrome on Android, sign in.
2. Chrome menu → **Add to Home screen** → **Install**. Open the installed app
   (not the browser tab).
3. Inside the app go to **/settings** → **Enable notifications** and accept the
   permission prompt. Do this once per device you want alerts on (the Android
   PWA and Chrome on your Mac are separate subscriptions).
4. Test: still on `/settings`, press **Send test notification**, then **close
   the app completely** and send another one. If it arrives with the app
   closed, reminders will work.

## 10. Check it from the work laptop on VPN

Open, in this order: your app domain, your Supabase project URL,
`accounts.google.com`, `fcm.googleapis.com`. Only the app domain has to load
for the dashboard and chat to work. If Google or FCM is blocked, calendar sync
and push notifications are the only things affected — the in-app chat feed
still shows every proactive message.

---

## Optional: talk to LifeOS from Gemini CLI or another MCP client

See [docs/MCP.md](docs/MCP.md): generate `MCP_API_KEY` (`openssl rand -hex 32`), set it in Vercel, redeploy,
then add the `lifeos` server to your client.

## Running it locally

```bash
cp .env.example .env.local   # then fill in the values from above
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Service workers and Web Push are disabled in `next dev`; test the PWA against
a production build (`npm run build && npm start`) or the Vercel deployment.
