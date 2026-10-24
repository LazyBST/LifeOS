import { NextResponse, type NextRequest } from 'next/server';
import { supabaseSession, currentUser } from '@/lib/auth';
import { env } from '@/lib/env';

/** Exchanges the OAuth code for a session, then enforces the single-owner
 *  rule via lib/auth.ts. Signs out and bounces back to /login if the signed
 *  in Google account is not the allowed owner. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (code) {
    const supabase = await supabaseSession();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const user = await currentUser();
  if (!user) {
    const supabase = await supabaseSession();
    await supabase.auth.signOut();
    const url = new URL('/login', env.appUrl);
    url.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL('/', env.appUrl));
}
