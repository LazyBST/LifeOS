'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { InlineSelect } from './InlineSelect';
import { updateTaskAction } from '@/app/actions/tasks';

type Opt = { id: string; title: string; goal_id?: string };

/**
 * Where a task sits in goal > project > task. Picking a project fills in its goal; picking only a goal clears a
 * project that belongs to another goal; the subtasks follow. A subtask takes both from its parent task, so they are read-only there.
 */
export function TaskLinks({ taskId, projectId, goalId, projects, goals, inherited }: { taskId: string; projectId: string | null; goalId: string | null; projects: Opt[]; goals: Opt[]; inherited: boolean }) {
  const router = useRouter();
  const [links, setLinks] = useState({ project_id: projectId, goal_id: goalId });
  const goalName = (id?: string) => goals.find((g) => g.id === id)?.title;

  async function save(patch: { project_id?: string | null; goal_id?: string | null }) {
    const res = await updateTaskAction(taskId, patch);
    if (res.ok) {
      setLinks({ project_id: res.data.project_id, goal_id: res.data.goal_id });
      router.refresh(); // the trail above and the lists below follow
      window.dispatchEvent(new Event('lifeos:changed'));
    } else toast.error(res.error);
    return res;
  }

  return (
    <>
      <span className="field" title={inherited ? 'A subtask belongs to the same goal and project as its parent task' : undefined}>
        Goal
        <InlineSelect value={links.goal_id} clearable disabled={inherited} placeholder="No goal" options={goals.map((g) => ({ value: g.id, label: g.title }))} onSave={(v) => save({ goal_id: v || null })} />
      </span>
      <span className="field" title={inherited ? 'A subtask belongs to the same goal and project as its parent task' : undefined}>
        Project
        <InlineSelect value={links.project_id} clearable disabled={inherited} placeholder="No project" options={projects.map((p) => ({ value: p.id, label: p.goal_id && goalName(p.goal_id) ? `${p.title} · ${goalName(p.goal_id)}` : p.title }))} onSave={(v) => save({ project_id: v || null })} />
      </span>
    </>
  );
}
