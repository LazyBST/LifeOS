// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const create = vi.fn(async () => ({ ok: true, data: { id: 't1' } }));
vi.mock('@/app/actions/tasks', () => ({ createTaskAction: (...a: unknown[]) => (create as (...x: unknown[]) => unknown)(...a) }));
vi.mock('@/app/actions/lookup', () => ({
  listAreasAction: vi.fn(async () => ({ ok: true, data: [{ id: 'a1', name: 'Business' }] })),
  listGoalsAction: vi.fn(async () => ({ ok: true, data: [{ id: 'g1', title: 'Deal', emoji: null, area_id: 'a1' }] })),
  listProjectsAction: vi.fn(async () => ({ ok: true, data: [{ id: 'p1', title: 'Deal project', emoji: null }] })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { TaskCreateForm } from '@/components/dashboard/TaskCreateForm';
import { StatusProvider } from '@/components/status/StatusProvider';

afterEach(() => { cleanup(); create.mockClear(); });

describe('TaskCreateForm', () => {
  it('creates a timed task with everything filled in, like an event', async () => {
    const onCreated = vi.fn();
    render(<StatusProvider statuses={[]}><TaskCreateForm date="2026-10-28" hour={15} onCreated={onCreated} onCancel={() => undefined} /></StatusProvider>);
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Send the deal draft' } });
    await screen.findByText('Business');
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'g1' } });
    await screen.findByText('Deal project');
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'deal, mail' } });
    fireEvent.click(screen.getByText('Add task'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const input = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(input).toMatchObject({ title: 'Send the deal draft', due_date: '2026-10-28', due_at: '2026-10-28T09:30:00.000Z', duration_min: 60, area_id: 'a1', goal_id: 'g1', project_id: 'p1', priority: 'P1', tags: ['deal', 'mail'] });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
  it('refuses an end before the start', () => {
    render(<StatusProvider statuses={[]}><TaskCreateForm date="2026-10-28" hour={15} onCreated={() => undefined} onCancel={() => undefined} /></StatusProvider>);
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '14:00' } });
    expect((screen.getByText('Add task') as HTMLButtonElement).disabled).toBe(true);
  });
});
