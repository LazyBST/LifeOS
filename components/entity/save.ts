import { updateGoalAction } from '@/app/actions/goals';
import { updateProjectAction } from '@/app/actions/projects';
import { updateTaskAction } from '@/app/actions/tasks';
import { updateBookAction } from '@/app/actions/books';
import type { ActionResult } from '@/app/actions/_result';

/**
 * A plain, serialisable description of "save this value to that field". Server pages pass this to the
 * client Inline* components instead of a function (functions cannot cross the server/client boundary).
 */
export type FieldSave = {
  entity: 'goal' | 'project' | 'task' | 'book';
  id: string;
  field: string;
  /** text: as typed · nullable: empty string becomes null · int: empty → null, else a non-negative integer · tags: comma list */
  mode?: 'text' | 'nullable' | 'int' | 'tags';
};

export function saveField(spec: FieldSave, raw: string | null): Promise<ActionResult<unknown>> {
  const v = raw ?? '';
  let value: unknown = v;
  if (spec.mode === 'nullable') value = v === '' ? null : v;
  else if (spec.mode === 'int') value = v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);
  else if (spec.mode === 'tags') value = v.split(',').map((t) => t.trim()).filter(Boolean);
  const patch = { [spec.field]: value };
  if (spec.entity === 'goal') return updateGoalAction(spec.id, patch);
  if (spec.entity === 'project') return updateProjectAction(spec.id, patch);
  if (spec.entity === 'book') return updateBookAction(spec.id, patch);
  return updateTaskAction(spec.id, patch);
}
