import { NextResponse } from 'next/server';
import { supabaseSession } from '@/lib/auth';
import { env } from '@/lib/env';

/** Builds the Supabase Google OAuth URL server-side and redirects to it. */
export async function GET() {
  const supabase = await supabaseSession();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${env.appUrl}/auth/callback`,
    },
  });

  if (error || !data.url) {
    const url = new URL('/login', env.appUrl);
    url.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(data.url);
}
