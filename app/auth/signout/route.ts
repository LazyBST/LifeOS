import { NextResponse } from 'next/server';
import { supabaseSession } from '@/lib/auth';
import { requestOrigin } from '@/lib/origin';

export async function GET() {
  const supabase = await supabaseSession();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', await requestOrigin()));
}

export async function POST() {
  return GET();
}
