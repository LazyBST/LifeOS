// POST/DELETE /api/push/subscribe — stores (or removes) one browser Web Push
// subscription for the installed PWA (spec section 8, CONTRACTS.md route list).
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';

type SubscriptionBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string;
};

function parseBody(value: unknown): SubscriptionBody | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== 'string' || v.endpoint.length === 0) return null;
  const keys = v.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== 'object') return null;
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  return {
    endpoint: v.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    user_agent: typeof v.user_agent === 'string' ? v.user_agent : undefined,
  };
}

function parseDeleteBody(value: unknown): { endpoint: string } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== 'string' || v.endpoint.length === 0) return null;
  return { endpoint: v.endpoint };
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

  const body = parseBody(json);
  if (!body) {
    return NextResponse.json({ error: 'Expected {endpoint, keys:{p256dh, auth}}' }, { status: 400 });
  }

  const { error } = await admin()
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.user_agent ?? null,
        last_error: null,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
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

  const body = parseDeleteBody(json);
  if (!body) {
    return NextResponse.json({ error: 'Expected {endpoint}' }, { status: 400 });
  }

  const { error } = await admin().from('push_subscriptions').delete().eq('endpoint', body.endpoint);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
