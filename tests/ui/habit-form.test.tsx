// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/habits', () => ({ createHabitAction: vi.fn(), updateHabitAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HabitForm } from '@/components/habits/HabitForm';

afterEach(cleanup);

describe('HabitForm', () => {
  it('shows the area by name, not by its id, and the readable time of day and kind', async () => {
    const habit = { id: 'h1', name: 'Breakfast', emoji: null, time_of_day: 'morning', kind: 'boolean', target_value: 1, unit: null, days_of_week: null, reminder_time: null, area_id: '94c04e9f-92b4-4213-bf14-3286dc4e5a25', goal_id: null, archived_at: null, created_at: '2026-01-01', start_time: '08:40:00', end_time: '09:00:00', gtask_title: null } as never;
    render(<HabitForm open onOpenChange={() => undefined} mode="edit" habit={habit} areas={[{ id: '94c04e9f-92b4-4213-bf14-3286dc4e5a25', name: 'Health & Fitness' } as never]} onSaved={() => undefined} />);
    await screen.findByText('Edit habit');
    expect(screen.getByText('Health & Fitness')).toBeTruthy();
    expect(screen.queryByText('94c04e9f-92b4-4213-bf14-3286dc4e5a25')).toBeNull();
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('Tick (yes/no)')).toBeTruthy();
  });
});
