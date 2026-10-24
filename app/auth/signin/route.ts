import { NextResponse } from 'next/server';
import { supabaseSession } from '@/lib/auth';
import { requestOrigin } from '@/lib/origin';

/** Builds the Supabase Google OAuth URL server-side and redirects to it. */
export async function GET() {
  const origin = await requestOrigin();
  const supabase = await supabaseSession();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL('/login?error=signin_failed', origin));
  }
  return NextResponse.redirect(data.url);
}
