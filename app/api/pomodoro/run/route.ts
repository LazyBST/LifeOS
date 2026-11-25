// GET/POST /api/pomodoro/run: the one timer shared by every device. Plain requests (not server actions, which are queued
// one at a time) so the server's clock reading is taken the moment the request arrives and leaves.
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getRun, saveRun } from '@/lib/domain/pomodoro';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : 'Failed';
  return NextResponse.json({ ok: false, error: msg }, { status: msg === 'UNAUTHENTICATED' ? 401 : 500, headers: NO_STORE });
}

export async function GET() {
  const received = Date.now();
  try {
    await requireUser();
    const doc = await getRun();
    return NextResponse.json({ ok: true, timer: doc.timer, ver: doc.ver, op: doc.op ?? null, received, sent: Date.now() }, { headers: NO_STORE });
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const received = Date.now();
  try {
    await requireUser();
    const body = (await req.json()) as { timer: Record<string, unknown> | null; baseVer: number; op: string };
    const r = await saveRun(body.timer ?? null, Number(body.baseVer), String(body.op));
    return NextResponse.json({ ...r, received, sent: Date.now() }, { headers: NO_STORE });
  } catch (e) { return fail(e); }
}
