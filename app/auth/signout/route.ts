import { NextResponse } from 'next/server';
import { supabaseSession } from '@/lib/auth';
import { env } from '@/lib/env';

export async function GET() {
  const supabase = await supabaseSession();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', env.appUrl));
}

export async function POST() {
  return GET();
}
