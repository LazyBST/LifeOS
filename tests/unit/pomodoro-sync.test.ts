import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ admin: () => ({}) }));
let stored: unknown = null;
vi.mock('@/lib/domain/uistate', () => ({ getUiState: async () => stored, setUiState: async (_k: string, v: unknown) => { stored = v; } }));

import { saveRun } from '@/lib/domain/pomodoro';

const timer = (status: string) => ({ runId: 'r', phaseStartedAt: 1, status, cfg: { workMin: 25, breakMin: 5 } });

describe('saveRun: a phase ending automatically must not undo a pause made meanwhile', () => {
  beforeEach(() => { stored = null; });

  it('takes a normal newer write', async () => {
    await saveRun(timer('running'), 100);
    const r = await saveRun(timer('paused'), 200);
    expect(r.rev).toBe(200);
  });

  it('refuses an automatic change when the timer was changed after the revision it started from', async () => {
    await saveRun(timer('running'), 100); // both devices saw rev 100
    await saveRun(timer('paused'), 200); // device A pauses
    // device B (background) sees the phase run out and stamps it with the old end time 300, based on rev 100
    const r = await saveRun(timer('running'), 300, 100);
    expect(r.rejected).toBe(true);
    expect(r.rev).toBe(200);
    expect((stored as { timer: { status: string } }).timer.status).toBe('paused');
  });

  it('accepts an automatic change when nothing happened in between', async () => {
    await saveRun(timer('running'), 100);
    const r = await saveRun(timer('running'), 300, 100);
    expect(r.rejected).toBeUndefined();
    expect(r.rev).toBe(300);
  });

  it('a second device ending the same phase is refused harmlessly', async () => {
    await saveRun(timer('running'), 100);
    await saveRun(timer('running'), 300, 100);
    const r = await saveRun(timer('running'), 300, 100);
    expect(r.rev).toBe(300);
  });
});
