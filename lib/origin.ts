import 'server-only';
import { headers } from 'next/headers';

/** Public origin of the current request (Vercel domain in prod, localhost in dev),
 *  so OAuth redirects never depend on an APP_URL that may be unset or stale. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return process.env.APP_URL ?? 'http://localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
