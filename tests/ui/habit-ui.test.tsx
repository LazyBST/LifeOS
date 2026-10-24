// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { toggle, checkin, link, create } = vi.hoisted(() => ({
  toggle: vi.fn(async (_id: string, _date: string) => ({ ok: true, data: { done: true } })),
  checkin: vi.fn(async () => ({ ok: true, data: {} })),
  link: vi.fn(async (_h: string, _t: string, _e: string) => ({ ok: true, data: null })),
  create: vi.fn(async (_n: string, _t: string, _e: string, _a?: string) => ({ ok: true, data: { id: 'new' } })),
}));
vi.mock('@/app/actions/habits', () => ({ toggleHabitDayAction: toggle, checkinHabitAction: checkin, linkHabitAction: link, createAndLinkHabitAction: create, unlinkHabitAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HabitRow, type HabitRowData } from '@/components/habits/HabitRow';
import { HabitPicker } from '@/components/habits/HabitPicker';

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
const habit: HabitRowData = {
  id: 'h1', name: 'Vitamin D', emoji: null, kind: 'boolean', target: 1, unit: null, value: 0, done: false, streak: 3, longest: 9,
  schedule: 'Every day', today: '2026-10-25', week: days.map((date, i) => ({ date, due: true, done: i < 3 })),
};

afterEach(cleanup);
beforeEach(() => { toggle.mockClear(); link.mockClear(); create.mockClear(); });

describe('HabitRow', () => {
  it('is one line with streak, and details are tucked away until asked for', () => {
    render(<HabitRow h={habit} />);
    expect(screen.getByText('Vitamin D')).toBeTruthy();
    expect(screen.getByText('🔥3')).toBeTruthy();
    expect(screen.queryByText(/Longest streak/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Details'));
    expect(screen.getByText(/Longest streak 9/)).toBeTruthy();
  });
  it('tapping a past day corrects it, and the circle checks in today', async () => {
    render(<HabitRow h={habit} />);
    const squares = screen.getAllByRole('button').filter((b) => b.getAttribute('title')?.includes('tap to change'));
    expect(squares).toHaveLength(7);
    await act(async () => { fireEvent.click(squares[3]); });
    expect(toggle).toHaveBeenCalledWith('h1', '2026-10-22');
    await act(async () => { fireEvent.click(screen.getByLabelText('Check Vitamin D for today')); });
    expect(toggle).toHaveBeenCalledWith('h1', '2026-10-25');
  });
});

describe('HabitPicker', () => {
  const options = [{ id: 'a', name: 'Vitamin D', emoji: null }, { id: 'b', name: 'Vitamin B', emoji: null }, { id: 'c', name: 'Gym', emoji: null }];
  it('offers existing matches while typing and links the chosen one', async () => {
    render(<HabitPicker entityType="goal" entityId="g1" options={options} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'vit' } });
    expect(screen.getByText('Vitamin D')).toBeTruthy();
    expect(screen.getByText('Vitamin B')).toBeTruthy();
    expect(screen.queryByText('Gym')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Vitamin B')); });
    expect(link).toHaveBeenCalledWith('b', 'goal', 'g1');
  });
  it('offers to create a new habit when nothing matches, and creates and links it', async () => {
    render(<HabitPicker entityType="task" entityId="t1" areaId="ar" options={options} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Juggling' } });
    expect(screen.getByText(/Create “Juggling”/)).toBeTruthy();
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(create).toHaveBeenCalledWith('Juggling', 'task', 't1', 'ar');
    expect(link).not.toHaveBeenCalled();
  });
  it('does not offer to create a habit that already exists exactly', () => {
    render(<HabitPicker entityType="goal" entityId="g1" options={options} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'gym' } });
    expect(screen.queryByText(/Create/)).toBeNull();
  });
});
