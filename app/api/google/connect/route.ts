// GET /api/google/connect — redirects to the Google OAuth consent screen.
// POST /api/google/connect {disconnect:true} — clears the stored connection.
// (spec section 9, CONTRACTS.md route list)
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { authUrl, disconnect, isConfigured } from '@/lib/google/auth';

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 400 },
    );
  }

  return NextResponse.redirect(authUrl());
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = json as { disconnect?: boolean } | null;
  if (!body?.disconnect) {
    return NextResponse.json({ error: 'Expected {disconnect:true}' }, { status: 400 });
  }

  await disconnect();
  return NextResponse.json({ ok: true });
}
