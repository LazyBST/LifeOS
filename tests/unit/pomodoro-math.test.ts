import { describe, expect, it } from 'vitest';
import { advance, celebrationFor, clock, elapsedMs, endInstant, pause, remainingMs, resume, segmentOf, startRun, summariseDay } from '@/lib/domain/pomodoro-math';

const MIN = 60_000;
const cfg = { workMin: 25, breakMin: 5, repeats: 2 };

describe('pomodoro timer', () => {
  it('counts down from timestamps and ignores time spent paused', () => {
    let t = startRun(cfg, 0, 'r', 'Write');
    expect(remainingMs(t, 10 * MIN)).toBe(15 * MIN);
    t = pause(t, 10 * MIN);
    expect(t.pauses).toBe(1);
    expect(remainingMs(t, 40 * MIN)).toBe(15 * MIN); // frozen while paused
    t = resume(t, 40 * MIN);
    expect(remainingMs(t, 45 * MIN)).toBe(10 * MIN);
    expect(endInstant(t)).toBe(55 * MIN);
    expect(elapsedMs(t, 45 * MIN)).toBe(15 * MIN);
  });
  it('goes work, break, work, then stops after the last session without a final break', () => {
    let t = startRun(cfg, 0, 'r', 'a');
    let r = advance(t, endInstant(t), 'b');
    expect(r.segment).toMatchObject({ kind: 'work', planned_sec: 1500, actual_sec: 1500, completed: true });
    expect(r.next).toMatchObject({ phase: 'break', cycle: 1, status: 'running' });
    t = r.next; r = advance(t, endInstant(t), 'c');
    expect(r.next).toMatchObject({ phase: 'work', cycle: 2 });
    t = r.next; r = advance(t, endInstant(t), 'd');
    expect(r.next.status).toBe('done');
  });
  it('repeats forever when no count is given, and skips breaks of zero minutes', () => {
    let t = startRun({ workMin: 10, breakMin: 0, repeats: null }, 0, 'r', 'a');
    for (let i = 1; i <= 5; i++) { const r = advance(t, endInstant(t), 'a'); expect(r.next).toMatchObject({ phase: 'work', cycle: i + 1, status: 'running' }); t = r.next; }
  });
  it('records a skipped phase as not completed, with its pauses', () => {
    let t = startRun(cfg, 0, 'r', 'a');
    t = pause(t, 5 * MIN); t = resume(t, 8 * MIN);
    const s = segmentOf(t, 12 * MIN, false);
    expect(s).toMatchObject({ actual_sec: 9 * 60, paused_sec: 3 * 60, pauses: 1, completed: false });
  });
  it('formats the clock', () => { expect(clock(25 * MIN)).toBe('25:00'); expect(clock(61_001)).toBe('01:02'); expect(clock(-5)).toBe('00:00'); });
});

describe('day summary', () => {
  it('compares focus time with what the calendar planned', () => {
    const s = summariseDay([
      { kind: 'work', planned_sec: 1500, actual_sec: 1500, paused_sec: 0, pauses: 0, completed: true },
      { kind: 'break', planned_sec: 300, actual_sec: 300, paused_sec: 0, pauses: 0, completed: true },
      { kind: 'work', planned_sec: 1500, actual_sec: 600, paused_sec: 120, pauses: 2, completed: false },
    ], 100);
    expect(s).toMatchObject({ workSessions: 1, workStarted: 2, pauses: 2, pausedSec: 120, workSec: 2100, breakSec: 300, allottedSec: 3300 });
    expect(s.coverage).toBeCloseTo(0.35);
    expect(s.focusShare).toBeCloseTo(2100 / 2400);
    expect(summariseDay([], 0)).toMatchObject({ coverage: null, focusShare: null });
  });
});

describe('celebrations', () => {
  const run = { workMin: 25, breakMin: 5, repeats: null };
  it('sparkles after an ordinary session and goes big on the 4th in a row (100 focused minutes: a rocket)', () => {
    let t = startRun(run, 0, 'r', 'a');
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const w = advance(t, endInstant(t), 'a');
      seen.push(celebrationFor(t, w.next, () => 0));
      const b = advance(w.next, endInstant(w.next), 'a');
      seen.push(celebrationFor(w.next, b.next, () => 0)); // a break never celebrates
      t = b.next;
    }
    expect(seen).toEqual(['sparkle', null, 'sparkle', null, 'sparkle', null, 'rocket', null]);
  });
  it('goes big when a set number of sessions is finished, and scales with focused time', () => {
    let t = startRun({ workMin: 90, breakMin: 5, repeats: 2 }, 0, 'r', 'a');
    t = advance(advance(t, endInstant(t), 'a').next, 0, 'a', true).next; // first work + break
    const last = advance(t, endInstant(t), 'a');
    expect(last.next.status).toBe('done');
    expect(['diwali', 'rocket']).toContain(celebrationFor(t, last.next, () => 0.9));
  });
});
