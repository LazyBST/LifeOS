// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/calweek', () => ({ getCalendarWeekAction: vi.fn(async () => ({ ok: true, data: { blocks: [], allDay: [], bars: [], untimed: [], sync: null, weekStart: '2026-10-26' } })) }));
vi.mock('@/app/actions/pomodoro', () => ({
  logPomodoroSegmentAction: vi.fn(async () => ({ ok: true, data: null })),
  focusDayAction: vi.fn(async () => ({ ok: true, data: { date: '2026-10-26', ready: true, segments: [], plannedWorkMin: 0, summary: { workSessions: 0, workStarted: 0, pauses: 0, pausedSec: 0, workSec: 0, breakSec: 0, allottedSec: 0, coverage: null, focusShare: null }, week: [] } })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { PomodoroRoot } from '@/components/pomodoro/PomodoroRoot';

// a stand-in for /api/pomodoro/run: one shared timer with a version number
let server: { timer: unknown; ver: number; saves: { timer: { status?: string } | null; baseVer: number }[] };
beforeEach(() => {
  server = { timer: null, ver: 0, saves: [] };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const received = Date.now();
    let body: Record<string, unknown>;
    if (init?.method === 'POST') {
      const req = JSON.parse(String(init.body)) as { timer: { status?: string } | null; baseVer: number; op: string };
      server.saves.push({ timer: req.timer, baseVer: req.baseVer });
      if (req.baseVer !== server.ver) body = { ok: false, doc: { timer: server.timer, ver: server.ver } };
      else { server.timer = req.timer; server.ver += 1; body = { ok: true, ver: server.ver }; }
    } else body = { ok: true, timer: server.timer, ver: server.ver };
    return { ok: true, json: async () => ({ ...body, received, sent: Date.now() }) } as Response;
  }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('PomodoroRoot', () => {
  it('shows a timer that was started on another device and saves what you do to the shared copy', async () => {
    const remote = { runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cfg: { workMin: 25, breakMin: 5, repeats: null }, phase: 'work', cycle: 1, phaseStartedAt: Date.now() - 5 * 60_000, pausedAt: null, pausedMs: 0, pauses: 0, label: 'Laptop task', status: 'running', doneWork: 0, focusedSec: 0 };
    server.timer = remote; server.ver = 7;
    render(<PomodoroRoot />);
    await act(async () => {});
    await screen.findByLabelText('Open the timer'); // the round timer appears on this device
    fireEvent.click(screen.getByLabelText('Open the timer'));
    fireEvent.click(await screen.findByLabelText('Pause'));
    await act(async () => {});
    expect(server.saves.at(-1)?.timer?.status).toBe('paused');
    expect(server.saves.at(-1)?.baseVer).toBe(7); // saved on top of the version it saw
    expect(server.ver).toBe(8);
  });
  it('shows the clock icon, asks for work, break and repeats, then runs, pauses and stops', async () => {
    render(<PomodoroRoot />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('Start a Pomodoro'));
    await screen.findByText('How long is a work session?');
    screen.getByText('How long is a break?');
    screen.getByText('Until I stop');
    fireEvent.click(screen.getByText('Repeat a set number'));
    fireEvent.click(screen.getByText('Start'));
    await act(async () => {});
    screen.getByText('25:00');
    screen.getByText(/Focus 1 of 4/);
    fireEvent.click(screen.getByLabelText('Pause'));
    screen.getByLabelText('Resume');
    expect(JSON.parse(localStorage.getItem('lifeos:pomo:timer2')!).timer.status).toBe('paused');
    fireEvent.click(screen.getByLabelText('Full screen'));
    await screen.findByLabelText('Exit full screen');
    fireEvent.click(screen.getByLabelText('Exit full screen'));
    fireEvent.click(screen.getByLabelText('Stop'));
    await screen.findByLabelText('Start a Pomodoro');
    expect(JSON.parse(localStorage.getItem('lifeos:pomo:timer2')!).timer).toBeNull();
  });
  it('can be hidden and brought back', async () => {
    render(<PomodoroRoot />);
    await act(async () => {});
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:pomodoro', { detail: 'hide' })); });
    expect(screen.queryByLabelText('Start a Pomodoro')).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent('lifeos:pomodoro', { detail: 'show' })); });
    screen.getByLabelText('Start a Pomodoro');
  });
});
