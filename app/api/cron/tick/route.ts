// POST/GET /api/cron/tick — the one cron entry point (spec section 8,
// CONTRACTS.md "Part 2 contracts"). pg_cron hits this every minute with the
// `x-cron-secret` header; GET with the same header is for manual testing.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { runTick } from '@/lib/jobs/tick';

function validSecret(header: string | null): boolean {
  if (!header) return false;
  let secret: string;
  try {
    secret = env.cronSecret;
  } catch {
    // CRON_SECRET not configured — fail closed.
    return false;
  }
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!validSecret(req.headers.get('x-cron-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Every job is wrapped in its own try/catch inside runTick, so one broken
  // job never stops the others. The outer catch covers the setup runTick does
  // before that — reading app_config — so a database outage still answers
  // with a readable body instead of an empty 500.
  try {
    const result = await runTick(new Date());
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ran: [], skipped: [], errors: [{ job: 'tick', error: message }] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
