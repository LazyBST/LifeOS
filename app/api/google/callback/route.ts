// GET /api/google/callback — OAuth redirect target: exchanges the code,
// creates/caches the LifeOS and primary calendars, then sends the owner
// back to /settings (spec section 9, CONTRACTS.md route list).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { exchangeCode } from '@/lib/google/auth';
import { requestOrigin } from '@/lib/origin';
import { ensureLifeosCalendar, ensurePrimaryCached } from '@/lib/google/calendar';

async function settingsRedirect(request: NextRequest, params: Record<string, string>): Promise<NextResponse> {
  const url = new URL('/settings', await requestOrigin());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** A short, non-secret reason code safe to put in a redirect URL. */
function reasonFor(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'UNAUTHENTICATED') return 'unauthenticated';
    if (/not configured/i.test(err.message)) return 'not_configured';
    if (/refresh token/i.test(err.message)) return 'no_refresh_token';
  }
  return 'unknown';
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return await settingsRedirect(request, { google: 'error', reason: 'unauthenticated' });
  }

  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    return await settingsRedirect(request, { google: 'error', reason: error.slice(0, 60) });
  }
  if (!code) {
    return await settingsRedirect(request, { google: 'error', reason: 'missing_code' });
  }

  try {
    await exchangeCode(code, await requestOrigin());
    await ensureLifeosCalendar();
    await ensurePrimaryCached();
  } catch (err) {
    const detail = err instanceof Error ? err.message.replace(/[^\w .,:;/'()-]/g, '').slice(0, 140) : '';
    return await settingsRedirect(request, { google: 'error', reason: reasonFor(err), ...(detail ? { detail } : {}) });
  }

  return await settingsRedirect(request, { google: 'connected' });
}
