import { SetPageContext } from '@/components/chat/page-context';
import { SettingsForm, AccountsPanel, CategoriesPanel } from '@/components/settings/SettingsForm';
import { PushSetup } from '@/components/settings/PushSetup';
import { GoogleConnect } from '@/components/settings/GoogleConnect';
import { GoogleSyncNow } from '@/components/settings/GoogleSyncNow';
import { getConfig } from '@/lib/domain/config';
import { admin } from '@/lib/supabase/admin';
import { keyEnvName } from '@/lib/agent/model';
import { hasTasksScope, hasCalendarWriteScope, googleRedirectUri, isConfigured } from '@/lib/google/auth';
import { requestOrigin } from '@/lib/origin';
import type { Account, Category } from '@/lib/types/db';

async function loadAccounts(): Promise<Account[]> {
  try {
    const { data, error } = await admin().from('accounts').select('*').is('archived_at', null).order('name');
    if (error) return [];
    return (data ?? []) as Account[];
  } catch {
    return [];
  }
}

async function loadCategories(): Promise<Category[]> {
  try {
    const { data, error } = await admin().from('categories').select('*').order('name');
    if (error) return [];
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

type GoogleConnection = { connected: boolean; connectedEmail: string | null };

async function loadGoogleConnection(): Promise<GoogleConnection> {
  try {
    const { data, error } = await admin().from('google_tokens').select('refresh_token, connected_email').maybeSingle();
    if (error || !data) return { connected: false, connectedEmail: null };
    return { connected: Boolean(data.refresh_token), connectedEmail: (data.connected_email as string | null) ?? null };
  } catch {
    // google_tokens / gcal routes may not exist yet while another worker builds them
    return { connected: false, connectedEmail: null };
  }
}

async function loadLastSyncError(): Promise<string | null> {
  try {
    const { data, error } = await admin()
      .from('gcal_outbox')
      .select('last_error')
      .not('last_error', 'is', null)
      .order('enqueued_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data.last_error as string | null) ?? null;
  } catch {
    return null;
  }
}

function envStatus(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]!.length > 0);
}

async function loadCalendarState() {
  try {
    const { data } = await admin().from('calendar_sync_state').select('*').maybeSingle();
    return { error: (data?.last_error as string | null) ?? null, ok: (data?.last_ok_at as string | null) ?? null, cached: Number(data?.cached_events ?? 0) };
  } catch {
    return { error: null, ok: null, cached: 0 };
  }
}

async function loadTasksSync() {
  try {
    const [{ data }, scope, calWrite] = await Promise.all([admin().from('gtasks_sync_state').select('*').maybeSingle(), hasTasksScope().catch(() => false), hasCalendarWriteScope().catch(() => false)]);
    return { scope, calWrite, polled: (data?.last_polled_at as string | null) ?? null, error: (data?.last_error as string | null) ?? null, pulled: Number(data?.last_pulled ?? 0) };
  } catch {
    return { scope: false, calWrite: false, polled: null, error: null, pulled: 0 };
  }
}

const REASONS: Record<string, string> = {
  redirect_uri_mismatch: 'Google does not recognise this app’s return address. Add the redirect address shown below to your OAuth client in Google Cloud, exactly as written.',
  invalid_scope: 'Google rejected one of the permissions. In Google Cloud, add the calendar and tasks scopes to the consent screen.',
  access_denied: 'You declined access (or this Google account is not allowed on the consent screen).',
  not_configured: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set on the server.',
  no_refresh_token: 'Google did not give a refresh token. Revoke LifeOS at myaccount.google.com/permissions, then connect again.',
  unauthenticated: 'You were signed out. Sign in again and retry.',
  missing_code: 'Google did not send back a code. Try connecting again.',
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; reason?: string; detail?: string }> }) {
  const sp = await searchParams;
  const redirectUri = googleRedirectUri(await requestOrigin());
  const [tasksSync, calState] = await Promise.all([loadTasksSync(), loadCalendarState()]);
  const [config, accounts, categories, google, lastSyncError] = await Promise.all([
    getConfig(),
    loadAccounts(),
    loadCategories(),
    loadGoogleConnection(),
    loadLastSyncError(),
  ]);

  const diagnostics: { label: string; env: string }[] = [
    { label: 'AI model key', env: keyEnvName() },
    { label: 'VAPID public key', env: 'VAPID_PUBLIC_KEY' },
    { label: 'VAPID private key', env: 'VAPID_PRIVATE_KEY' },
    { label: 'Google client ID', env: 'GOOGLE_CLIENT_ID' },
    { label: 'Google client secret', env: 'GOOGLE_CLIENT_SECRET' },
    { label: 'Cron secret', env: 'CRON_SECRET' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <SetPageContext ctx={{ route: '/settings', entity_type: 'none' }} />
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Times</h2>
        <SettingsForm config={config} />
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Notifications</h2>
        <PushSetup />
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Google Calendar</h2>
        {sp.google === 'connected' && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Google connected.</p>}
        {sp.google === 'error' && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <p className="font-medium">Could not connect Google{sp.reason ? ` (${sp.reason})` : ''}.</p>
            {sp.reason && REASONS[sp.reason] && <p className="mt-1">{REASONS[sp.reason]}</p>}
            {sp.detail && <p className="mt-1 text-xs opacity-80">{sp.detail}</p>}
          </div>
        )}
        {isConfigured() && !google.connected && (
          <div className="mb-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <p>Before connecting, this exact address must be listed under <b>Authorized redirect URIs</b> for your OAuth client in Google Cloud (APIs &amp; Services → Credentials):</p>
            <p className="mt-1 select-all break-all rounded bg-muted px-2 py-1 font-mono text-foreground">{redirectUri}</p>
            <p className="mt-1">“Access blocked: This app’s request is invalid” almost always means it is missing or differs by even one character (http vs https, a trailing slash, another domain).</p>
          </div>
        )}
        <GoogleConnect
          connected={google.connected}
          connectedEmail={google.connectedEmail}
          lastSyncError={lastSyncError}
        />
        {google.connected && <div className="mt-3"><GoogleSyncNow lastError={calState.error} lastOk={calState.ok} cached={calState.cached} /></div>}
        {google.connected && (
          <div className="mt-3 rounded-lg border px-3 py-2 text-sm">
            <div className="font-medium">Calendar editing</div>
            {tasksSync.calWrite ? (
              <p className="text-xs text-muted-foreground">Two-way: events you add or change in LifeOS go to Google Calendar, and changes made on your phone come back within 5 minutes (or press Sync now on the dashboard).</p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">Read-only for now: disconnect and connect Google again to allow LifeOS to edit your calendar.</p>
            )}
          </div>
        )}
        {google.connected && (
          <div className="mt-3 rounded-lg border px-3 py-2 text-sm">
            <div className="font-medium">Google Tasks ↔ habits</div>
            {tasksSync.scope ? (
              <p className="text-xs text-muted-foreground">
                Completing a task whose title matches a habit checks the habit in, and checking a habit completes that task.
                {tasksSync.polled ? ` Last sync ${new Date(tasksSync.polled).toLocaleString()} · ${tasksSync.pulled} check-in${tasksSync.pulled === 1 ? '' : 's'} pulled.` : ' Waiting for the first sync (runs every 10 minutes).'}
              </p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">Not enabled yet: disconnect and connect Google again to grant Tasks access (and enable the Google Tasks API in Google Cloud).</p>
            )}
            {tasksSync.error && <p className="mt-1 text-xs text-destructive">Last error: {tasksSync.error}</p>}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Accounts</h2>
        <AccountsPanel accounts={accounts} />
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Categories</h2>
        <CategoriesPanel categories={categories} />
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Diagnostics</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {diagnostics.map((d) => (
            <li key={d.env} className="flex items-center justify-between">
              <span>{d.label}</span>
              <span className={envStatus(d.env) ? 'text-green-600' : 'text-muted-foreground'}>
                {envStatus(d.env) ? 'set' : 'not set'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
