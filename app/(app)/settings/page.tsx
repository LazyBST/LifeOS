import { SetPageContext } from '@/components/chat/page-context';
import { SettingsForm, AccountsPanel, CategoriesPanel } from '@/components/settings/SettingsForm';
import { PushSetup } from '@/components/settings/PushSetup';
import { GoogleConnect } from '@/components/settings/GoogleConnect';
import { getConfig } from '@/lib/domain/config';
import { admin } from '@/lib/supabase/admin';
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

export default async function SettingsPage() {
  const [config, accounts, categories, google, lastSyncError] = await Promise.all([
    getConfig(),
    loadAccounts(),
    loadCategories(),
    loadGoogleConnection(),
    loadLastSyncError(),
  ]);

  const diagnostics: { label: string; env: string }[] = [
    { label: 'Anthropic key', env: 'ANTHROPIC_API_KEY' },
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
        <GoogleConnect
          connected={google.connected}
          connectedEmail={google.connectedEmail}
          lastSyncError={lastSyncError}
        />
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
