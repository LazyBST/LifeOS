// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/calweek', () => ({ getCalendarWeekAction: vi.fn(async () => ({ ok: true, data: { blocks: [], allDay: [], bars: [], untimed: [], sync: null, weekStart: '2026-10-26' } })) }));
vi.mock('@/app/actions/pomodoro', () => ({
  logPomodoroSegmentAction: vi.fn(async () => ({ ok: true, data: null })),
  focusDayAction: vi.fn(async () => ({ ok: true, data: { date: '2026-10-26', ready: true, segments: [], plannedWorkMin: 0, summary: { workSessions: 0, workStarted: 0, pauses: 0, pausedSec: 0, workSec: 0, breakSec: 0, allottedSec: 0, coverage: null, focusShare: null }, week: [] } })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { PomodoroRoot } from '@/components/pomodoro/PomodoroRoot';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('PomodoroRoot', () => {
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
    expect(JSON.parse(localStorage.getItem('lifeos:pomo:timer')!).status).toBe('paused');
    fireEvent.click(screen.getByLabelText('Full screen'));
    await screen.findByLabelText('Exit full screen');
    fireEvent.click(screen.getByLabelText('Exit full screen'));
    fireEvent.click(screen.getByLabelText('Stop'));
    await screen.findByLabelText('Start a Pomodoro');
    expect(localStorage.getItem('lifeos:pomo:timer')).toBeNull();
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
