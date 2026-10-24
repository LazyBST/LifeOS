import { NextResponse, type NextRequest } from 'next/server';
import { supabaseSession, checkUser } from '@/lib/auth';
import { requestOrigin } from '@/lib/origin';

/** Exchanges the OAuth code for a session, then enforces the single-owner
 *  rule via lib/auth.ts. Redirects to /login with a specific reason on failure. */
export async function GET(request: NextRequest) {
  const origin = await requestOrigin();
  const fail = (reason: string, detail?: string) => {
    const u = new URL('/login', origin);
    u.searchParams.set('error', reason);
    if (detail) u.searchParams.set('detail', detail.slice(0, 160));
    return NextResponse.redirect(u);
  };

  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await supabaseSession();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] code exchange failed:', error.message);
      return fail('exchange_failed', error.message);
    }
  }

  let r: Awaited<ReturnType<typeof checkUser>>;
  try {
    r = await checkUser();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auth/callback] owner check failed:', msg);
    return fail('server_error', msg);
  }
  if (!r.ok) {
    console.error('[auth/callback] rejected:', r.reason);
    if (r.reason === 'owner_mismatch') {
      const supabase = await supabaseSession();
      await supabase.auth.signOut();
    }
    return fail(r.reason);
  }
  return NextResponse.redirect(new URL('/', origin));
}
