import 'server-only';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env } from '@/lib/env';
import { admin } from '@/lib/supabase/admin';

/**
 * The full calendar scope: needed to edit events on the primary calendar
 * from the app (a deliberate widening of spec section 9, which started
 * read-only). Every app-made change is logged with its before-state.
 */
export const SCOPES = [
  // full calendar access: LifeOS creates and edits events on your primary calendar as well as its own
  'https://www.googleapis.com/auth/calendar',
  // Google Tasks <-> habits sync (read and complete tasks)
  'https://www.googleapis.com/auth/tasks',
];

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** True when the stored consent allows editing your main calendar (older connections must reconnect). */
export async function hasCalendarWriteScope(): Promise<boolean> {
  const row = await getTokenRow();
  return !!row?.refresh_token && (row.scope ?? '').split(/\s+/).includes(CALENDAR_SCOPE);
}

export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

/** True when the stored consent includes the Google Tasks scope (older connections need to reconnect). */
export async function hasTasksScope(): Promise<boolean> {
  const row = await getTokenRow();
  return !!row?.refresh_token && (row.scope ?? '').includes(TASKS_SCOPE);
}

type TokenRow = {
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
  connected_email: string | null;
};

function clientId(): string | undefined {
  return env.optional('GOOGLE_CLIENT_ID');
}

function clientSecret(): string | undefined {
  return env.optional('GOOGLE_CLIENT_SECRET');
}

/** True when the Google OAuth client id/secret are both set. */
export function isConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

function redirectUri(): string {
  return `${env.appUrl}/api/google/callback`;
}

function newOAuthClient(): OAuth2Client {
  if (!isConfigured()) throw new Error('Google is not configured');
  return new google.auth.OAuth2(clientId(), clientSecret(), redirectUri());
}

async function getTokenRow(): Promise<TokenRow | null> {
  const { data } = await admin().from('google_tokens').select('*').eq('id', true).maybeSingle();
  return (data as TokenRow) ?? null;
}

/** OAuth consent URL. Always requests a refresh token (spec section 9 setup). */
export function authUrl(): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

/**
 * Exchanges an OAuth `code` for tokens and stores the refresh token in the
 * single-row `google_tokens` table. The refresh token is a secret: it is
 * never logged and never returned from this function.
 */
export async function exchangeCode(code: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    // Google only returns a refresh token on first consent (we always pass
    // prompt=consent, so this should not happen); keep any existing one
    // rather than wiping it out.
    const existing = await getTokenRow();
    if (!existing?.refresh_token) {
      throw new Error(
        'Google did not return a refresh token. Revoke app access at ' +
          'https://myaccount.google.com/permissions and reconnect.',
      );
    }
  }

  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    email = data.email ?? null;
  } catch {
    email = null; // non-fatal: the connection still works without an email label
  }

  const patch: Record<string, unknown> = {
    id: true,
    access_token: tokens.access_token ?? null,
    access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? null,
    connected_email: email,
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token) patch.refresh_token = tokens.refresh_token;

  const { error } = await admin().from('google_tokens').upsert(patch, { onConflict: 'id' });
  if (error) throw new Error(`google_tokens: ${error.message}`);
}

/**
 * An authorised OAuth2 client with a fresh access token, refreshed from the
 * stored refresh token when needed. Persists the new access token and its
 * expiry back to `google_tokens`. Throws `Error('Google is not connected')`
 * when there is no stored refresh token.
 */
export async function authedClient(): Promise<OAuth2Client> {
  const row = await getTokenRow();
  if (!row?.refresh_token) throw new Error('Google is not connected');

  const client = newOAuthClient();
  client.setCredentials({
    refresh_token: row.refresh_token,
    access_token: row.access_token ?? undefined,
    expiry_date: row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : undefined,
  });

  const before = client.credentials.access_token ?? null;
  await client.getAccessToken(); // refreshes internally when the cached token is missing/expiring
  const creds = client.credentials;

  if (creds.access_token && creds.access_token !== before) {
    await admin()
      .from('google_tokens')
      .update({
        access_token: creds.access_token,
        access_token_expires_at: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
  }

  return client;
}

/** Clears the stored connection. Never touch the refresh token elsewhere. */
export async function disconnect(): Promise<void> {
  await admin()
    .from('google_tokens')
    .update({
      refresh_token: null,
      access_token: null,
      access_token_expires_at: null,
      scope: null,
      connected_email: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);
}
