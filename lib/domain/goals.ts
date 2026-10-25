import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { areaByName } from './areas';
import type { DateStr, EntityStatus, Goal, Priority, UUID } from '@/lib/types/db';

const LIVE = 'deleted_at.is.null';

export type GoalInput = {
  title: string;
  emoji?: string | null;
  description?: string | null;
  /** Area name or id; names are resolved loosely. */
  area?: string | null;
  area_id?: UUID | null;
  status?: EntityStatus;
  priority?: Priority;
  start_date?: DateStr | null;
  target_date?: DateStr | null;
  notes_md?: string;
};

export type GoalPatch = Partial<GoalInput> & { original_target_date?: DateStr | null; completed_on?: DateStr | null };

async function resolveAreaId(input: { area?: string | null; area_id?: UUID | null }) {
  if (input.area_id) return input.area_id;
  if (input.area) return (await areaByName(input.area))?.id ?? null;
  return undefined;
}

export async function listGoals(opts: { status?: EntityStatus[]; area_id?: UUID } = {}): Promise<Goal[]> {
  let q = admin().from('goals').select('*').is('deleted_at', null);
  if (opts.status?.length) q = q.in('status', opts.status);
  if (opts.area_id) q = q.eq('area_id', opts.area_id);
  const { data, error } = await q.order('priority').order('created_at');
  if (error) throw new Error(`goals: ${error.message}`);
  return data as Goal[];
}

export async function getGoal(id: UUID): Promise<Goal | null> {
  const { data } = await admin().from('goals').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return (data as Goal) ?? null;
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const area_id = await resolveAreaId(input);
  const row = {
    title: input.title,
    emoji: input.emoji ?? null,
    description: input.description ?? null,
    area_id: area_id ?? null,
    status: input.status ?? 'active',
    priority: input.priority ?? 'P1',
    start_date: input.start_date ?? null,
    target_date: input.target_date ?? null,
    notes_md: input.notes_md ?? '',
  };
  const { data, error } = await admin().from('goals').insert(row).select('*').single();
  if (error) throw new Error(`goal_create: ${error.message}`);
  return data as Goal;
}

export async function updateGoal(id: UUID, patch: GoalPatch): Promise<Goal> {
  const area_id = await resolveAreaId(patch);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'emoji', 'description', 'status', 'priority', 'start_date', 'target_date', 'notes_md', 'original_target_date', 'completed_on'] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (area_id !== undefined) row.area_id = area_id;
  const { data, error } = await admin().from('goals').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`goal_update: ${error.message}`);
  return data as Goal;
}

/** Soft delete (spec section 4). Children stay but are hidden with their goal. */
export async function deleteGoal(id: UUID): Promise<Goal> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from('goals')
    .update({ deleted_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`goal_delete: ${error.message}`);
  await admin().from('projects').update({ deleted_at: now }).eq('goal_id', id).is('deleted_at', null);
  await admin().from('tasks').update({ deleted_at: now }).eq('goal_id', id).is('deleted_at', null);
  return data as Goal;
}

export async function restoreGoal(id: UUID): Promise<void> {
  await admin().from('goals').update({ deleted_at: null }).eq('id', id);
}

export { LIVE };
