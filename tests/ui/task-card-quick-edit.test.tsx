// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const create = vi.fn(async (...args: unknown[]) => (void args, ({ ok: true, data: { id: "new" } })));
vi.mock('@/app/actions/tasks', () => ({
  createTaskAction: (i: unknown) => create(i),
  completeTaskAction: vi.fn(async () => ({ ok: true, data: {} })),
  reopenTaskAction: vi.fn(async () => ({ ok: true, data: {} })),
  listTasksAction: vi.fn(async () => ({ ok: true, data: [{ id: 's1', title: 'Draft outline', status: 'todo', due_date: null }] })),
}));
vi.mock('@/app/actions/lookup', () => ({
  listAreasAction: vi.fn(async () => ({ ok: true, data: [{ id: 'a1', name: 'Business', color: '#2563eb' }] })),
  listGoalsAction: vi.fn(async () => ({ ok: true, data: [{ id: 'g1', title: 'Launch the product' }] })),
  listProjectsAction: vi.fn(async () => ({ ok: true, data: [{ id: 'p1', title: 'Website', goal_id: 'g1', emoji: null }, { id: 'p2', title: 'Pricing page', goal_id: 'g1', emoji: null }] })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { TaskCard } from '@/components/tasks/TaskCard';
import { dueText } from '@/components/tasks/QuickEdit';
import { StatusProvider } from '@/components/status/StatusProvider';
import type { TaskListItem } from '@/app/actions/tasks';

const task = { id: 't1', task_no: 7, title: 'Write the report', status: 'todo', priority: 'P2', due_date: '2026-10-30', due_at: null, duration_min: null, estimate_min: null, tags: [], area_id: 'a1', area_name: 'Business', area_color: '#2563eb', goal_title: null, project_title: null, parent_task_id: null, parent_title: null, subtask_total: 0, subtask_done: 0 } as unknown as TaskListItem;
afterEach(() => { cleanup(); create.mockClear(); });
const card = (onUpdate = vi.fn(), onChanged = vi.fn()) => render(<StatusProvider statuses={[]}><TaskCard task={task} onUpdate={onUpdate} onSubtasksChanged={onChanged} /></StatusProvider>);

describe('TaskCard quick edit', () => {
  it('changes the priority from the card', async () => {
    const onUpdate = vi.fn();
    card(onUpdate);
    fireEvent.click(screen.getByLabelText(/Priority P2/));
    fireEvent.click(await screen.findByText(/P0 · Highest/));
    expect(onUpdate).toHaveBeenCalledWith('t1', { priority: 'P0' });
  });

  it('links the task to a project from the card, and unlinks it', async () => {
    const onUpdate = vi.fn();
    card(onUpdate);
    fireEvent.click(screen.getByLabelText('Change project'));
    fireEvent.change(await screen.findByLabelText('Find a project'), { target: { value: 'pric' } });
    expect(screen.queryByText('Website')).toBeNull();
    fireEvent.click(await screen.findByText('Pricing page'));
    expect(onUpdate).toHaveBeenCalledWith('t1', { project_id: 'p2' });
  });

  it('renames the task by clicking its title, and ignores an empty title', () => {
    const onUpdate = vi.fn();
    card(onUpdate);
    fireEvent.click(screen.getByLabelText(/Rename/));
    const box = screen.getByLabelText('Task title');
    fireEvent.change(box, { target: { value: 'Write the Q4 report' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onUpdate).toHaveBeenCalledWith('t1', { title: 'Write the Q4 report' });
    onUpdate.mockClear();
    fireEvent.click(screen.getByLabelText(/Rename/));
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByLabelText('Task title'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('opens the subtasks under the card and adds one with Enter', async () => {
    const onChanged = vi.fn();
    card(vi.fn(), onChanged);
    fireEvent.click(screen.getByTitle('Add a subtask'));
    await screen.findByText('Draft outline');
    const box = screen.getByLabelText('New subtask title');
    fireEvent.change(box, { target: { value: 'Collect numbers' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledWith({ title: 'Collect numbers', parent_task_id: 't1' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe('dueText', () => {
  it('shows the day, then start and end when there is a time', () => {
    expect(dueText({ due_date: null, due_at: null, duration_min: null })).toBeNull();
    expect(dueText({ due_date: '2026-10-30', due_at: '2026-10-30T04:00:00.000Z', duration_min: 60 })).toMatch(/09:30–10:30$/);
    expect(dueText({ due_date: '2026-10-30', due_at: '2026-10-30T04:00:00.000Z', duration_min: null })).toMatch(/· 09:30$/);
  });
});
