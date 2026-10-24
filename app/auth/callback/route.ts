import { NextResponse, type NextRequest } from 'next/server';
import { supabaseSession, checkUser } from '@/lib/auth';
import { requestOrigin } from '@/lib/origin';

/** Exchanges the OAuth code for a session, then enforces the single-owner
 *  rule via lib/auth.ts. Redirects to /login with a specific reason on failure. */
export async function GET(request: NextRequest) {
  const origin = await requestOrigin();
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await supabaseSession();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] code exchange failed:', error.message);
      return fail('exchange_failed');
    }
  }

  const r = await checkUser();
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
