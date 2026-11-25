import { describe, expect, it } from 'vitest';
import { PomoSync, type Api, type Doc } from '@/lib/pomodoro-sync';
import { advance, extendBreak, pause, resume, settle, startRun, type PomoTimer } from '@/lib/domain/pomodoro-math';
import { canSave } from '@/lib/domain/pomodoro';

const MIN = 60_000;
const T0 = 1_000_000_000_000;
const cfg = { workMin: 25, breakMin: 5, repeats: 6 };
const fresh = (): PomoTimer => startRun(cfg, T0, 'run-1', 'Focus time');

/** An in-memory server with a version number, the way the real one behaves. */
function fakeServer(timer: PomoTimer | null = null) {
  const doc = { timer, ver: 1, op: null as string | null };
  let down = false;
  const api = (clock: () => number, offset = 0): Api => ({
    async get() { if (down) return null; return { doc: { timer: doc.timer, ver: doc.ver, op: doc.op }, sample: { sentAt: clock(), rtt: 40, netRtt: 40, serverMid: clock() + offset + 20 } }; },
    async save(t, baseVer, op) {
      if (down) return null;
      const sample = { sentAt: clock(), rtt: 40, netRtt: 40, serverMid: clock() + offset + 20 };
      if (baseVer !== doc.ver) return { ok: false as const, doc: { timer: doc.timer, ver: doc.ver, op: doc.op } as Doc, sample };
      doc.timer = t; doc.ver += 1; doc.op = op;
      return { ok: true as const, ver: doc.ver, sample };
    },
  });
  return { doc, api, setDown: (d: boolean) => { down = d; } };
}
const device = (srv: ReturnType<typeof fakeServer>, clock: { t: number }, offset = 0) => new PomoSync(srv.api(() => clock.t, offset), () => clock.t);
const idle = () => new Promise((r) => setTimeout(r, 0));

describe('settle: phases are closed from the timestamps alone', () => {
  it('does nothing while time is left', () => {
    expect(settle(fresh(), T0 + 24 * MIN, 'x').steps).toHaveLength(0);
  });
  it('moves from focus to break at exactly the end, whenever it is noticed', () => {
    const s = settle(fresh(), T0 + 25 * MIN + 3000, 'Focus time');
    expect(s.steps).toHaveLength(1);
    expect(s.timer.phase).toBe('break');
    expect(s.timer.phaseStartedAt).toBe(T0 + 25 * MIN); // the break began when focus ended, not when it was noticed
    expect(s.steps[0].segment.completed).toBe(true);
  });
  it('catches up through several phases when it was asleep a little', () => {
    const s = settle(fresh(), T0 + 25 * MIN + 5 * MIN + 2 * MIN, 'Focus time', 10 * MIN);
    expect(s.timer.phase).toBe('work');
    expect(s.timer.cycle).toBe(2);
    expect(s.steps).toHaveLength(2);
  });
  it('closes the run when it was left far past the end', () => {
    const s = settle(fresh(), T0 + 25 * MIN + 30 * MIN, 'x');
    expect(s.timer.status).toBe('done');
    expect(s.steps[0].away).toBe(true);
  });
  it('never moves a paused timer', () => {
    expect(settle(pause(fresh(), T0 + 20 * MIN), T0 + 90 * MIN, 'x').steps).toHaveLength(0);
  });
  it('gives every device the same answer', () => {
    const a = settle(fresh(), T0 + 26 * MIN, 'Focus time').timer, b = settle(fresh(), T0 + 26 * MIN + 1234, 'Focus time').timer;
    expect(a).toEqual(b);
  });
});

describe('save versions', () => {
  it('only saves on top of the version the device saw', () => {
    expect(canSave({ timer: null, ver: 4 }, 4)).toBe(true);
    expect(canSave({ timer: null, ver: 5 }, 4)).toBe(false);
  });
});

describe('PomoSync: several devices, one timer', () => {
  it('a pause made on one device is not undone by another device in the background that sees the phase run out', async () => {
    const srv = fakeServer(fresh());
    const clock = { t: T0 + 10 * MIN };
    const a = device(srv, clock), b = device(srv, clock);
    await a.sync(); await b.sync();
    // A pauses at minute 10
    a.apply({ guard: 'run', run: (t, n) => (t ? { timer: pause(t, n) } : null) });
    await idle();
    // minute 26: B (never looked at the server) sees the phase over and tries to end it
    clock.t = T0 + 26 * MIN;
    b.apply({ guard: 'none', run: (t, n) => { if (!t || t.status !== 'running') return null; const s = settle(t, n, 'x'); return s.steps.length ? { timer: s.timer } : null; } });
    await idle();
    expect(srv.doc.timer?.status).toBe('paused'); // the pause stands
    expect(b.timer?.status).toBe('paused'); // and B follows it
  });

  it('two devices ending the same phase give one break, not two', async () => {
    const srv = fakeServer(fresh());
    const clock = { t: T0 + 26 * MIN };
    const a = device(srv, clock), b = device(srv, clock);
    await a.sync(); await b.sync();
    const end = { guard: 'none' as const, run: (t: PomoTimer | null, n: number) => { if (!t || t.status !== 'running') return null; const s = settle(t, n, 'x'); return s.steps.length ? { timer: s.timer } : null; } };
    a.apply(end); b.apply(end);
    await idle(); await idle();
    expect(srv.doc.timer?.phase).toBe('break');
    expect(srv.doc.timer?.cycle).toBe(1);
    expect(srv.doc.ver).toBe(2); // one save, the other was dropped as already done
  });

  it('replays a change on top of what another device saved (extend the break after the other device paused)', async () => {
    const srv = fakeServer(null);
    const clock = { t: T0 };
    const a = device(srv, clock), b = device(srv, clock);
    await a.sync(); await b.sync();
    a.apply({ guard: 'none', run: (_t, n) => ({ timer: startRun({ ...cfg, repeats: null }, n, 'run-1', 'x') }) });
    await idle();
    clock.t = T0 + 26 * MIN;
    a.apply({ guard: 'none', run: (t, n) => (t ? { timer: settle(t, n, 'x').timer } : null) }); // into the break
    await idle();
    await b.sync(); // B is in the break too
    // A pauses; B, not yet aware, extends the break
    a.apply({ guard: 'run', run: (t, n) => (t ? { timer: pause(t, n) } : null) });
    await idle();
    b.apply({ guard: 'phase', run: (t) => (t ? { timer: extendBreak(t, 10) } : null) });
    await idle(); await idle();
    expect(srv.doc.timer?.status).toBe('paused');
    expect(srv.doc.timer?.extraMs).toBe(10 * MIN);
  });

  it('drops a skip that was meant for a phase another device already ended', async () => {
    const srv = fakeServer(fresh());
    const clock = { t: T0 + 10 * MIN };
    const a = device(srv, clock), b = device(srv, clock);
    await a.sync(); await b.sync();
    clock.t = T0 + 26 * MIN;
    a.apply({ guard: 'none', run: (t, n) => (t ? { timer: settle(t, n, 'x').timer } : null) }); // A: focus over, in the break
    await idle();
    b.apply({ guard: 'phase', run: (t, n) => (t ? { timer: advance(t, n, 'Break', false).next } : null) }); // B skips the focus it still sees
    await idle(); await idle();
    expect(srv.doc.timer?.phase).toBe('break'); // not skipped on again into session 2
    expect(srv.doc.timer?.cycle).toBe(1);
  });

  it('keeps working offline and saves when the server is back', async () => {
    const srv = fakeServer(fresh());
    const clock = { t: T0 + 5 * MIN };
    const a = device(srv, clock);
    await a.sync();
    srv.setDown(true);
    a.apply({ guard: 'run', run: (t, n) => (t ? { timer: pause(t, n) } : null) });
    await idle();
    expect(a.timer?.status).toBe('paused'); // shown at once
    expect(srv.doc.timer?.status).toBe('running');
    srv.setDown(false);
    await a.sync();
    await idle();
    expect(srv.doc.timer?.status).toBe('paused');
  });

  it('resume after a pause made elsewhere continues the same phase', async () => {
    const srv = fakeServer(fresh());
    const clock = { t: T0 + 10 * MIN };
    const a = device(srv, clock), b = device(srv, clock);
    await a.sync(); await b.sync();
    a.apply({ guard: 'run', run: (t, n) => (t ? { timer: pause(t, n) } : null) });
    await idle();
    clock.t = T0 + 14 * MIN;
    await b.sync();
    b.apply({ guard: 'run', run: (t, n) => (t ? { timer: resume(t, n) } : null) });
    await idle();
    expect(srv.doc.timer?.status).toBe('running');
    expect(srv.doc.timer?.pausedMs).toBe(4 * MIN);
  });
});

describe('PomoSync: the clock offset', () => {
  it('uses the quickest round trip, so one slow reply does not move the clock', async () => {
    const clock = { t: T0 };
    let netRtt = 30;
    const api: Api = {
      async get() { return { doc: { timer: null, ver: 1 }, sample: { sentAt: clock.t, rtt: netRtt + 5, netRtt, serverMid: clock.t + 2000 + (netRtt === 30 ? 17 : 4000) } }; },
      async save() { return null; },
    };
    const s = new PomoSync(api, () => clock.t);
    await s.sync(); // quick: the server is about 2 s ahead
    const good = s.now() - clock.t;
    netRtt = 3000; // a slow reply, queued somewhere: its reading is unreliable
    await s.sync();
    expect(s.now() - clock.t).toBe(good);
    expect(good).toBeGreaterThan(1900);
    expect(good).toBeLessThan(2100);
  });
});
