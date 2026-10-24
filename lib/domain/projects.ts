import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { areaByName } from './areas';
import type { DateStr, EntityStatus, Priority, Project, UUID } from '@/lib/types/db';

export type ProjectInput = {
  goal_id: UUID;
  title: string;
  emoji?: string | null;
  description?: string | null;
  area?: string | null;
  area_id?: UUID | null;
  status?: EntityStatus;
  priority?: Priority;
  start_date?: DateStr | null;
  target_date?: DateStr | null;
  notes_md?: string;
};

export type ProjectPatch = Partial<ProjectInput>;

export async function listProjects(opts: { goal_id?: UUID; area_id?: UUID; status?: EntityStatus[] } = {}): Promise<Project[]> {
  let q = admin().from('projects').select('*').is('deleted_at', null);
  if (opts.goal_id) q = q.eq('goal_id', opts.goal_id);
  if (opts.area_id) q = q.eq('area_id', opts.area_id);
  if (opts.status?.length) q = q.in('status', opts.status);
  const { data, error } = await q.order('priority').order('created_at');
  if (error) throw new Error(`projects: ${error.message}`);
  return data as Project[];
}

export async function getProject(id: UUID): Promise<Project | null> {
  const { data } = await admin().from('projects').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return (data as Project) ?? null;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const area_id = input.area_id ?? (input.area ? (await areaByName(input.area))?.id ?? null : null);
  const row = {
    goal_id: input.goal_id,
    title: input.title,
    emoji: input.emoji ?? null,
    description: input.description ?? null,
    area_id,
    status: input.status ?? 'active',
    priority: input.priority ?? 'P1',
    start_date: input.start_date ?? null,
    target_date: input.target_date ?? null,
    notes_md: input.notes_md ?? '',
  };
  const { data, error } = await admin().from('projects').insert(row).select('*').single();
  if (error) throw new Error(`project_create: ${error.message}`);
  return data as Project;
}

/**
 * Updating `goal_id` moves the project; the composite foreign key
 * `tasks (project_id, goal_id) -> projects (id, goal_id) on update cascade`
 * moves its tasks' goal_id with it (spec section 4).
 */
export async function updateProject(id: UUID, patch: ProjectPatch): Promise<Project> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['goal_id', 'title', 'emoji', 'description', 'status', 'priority', 'start_date', 'target_date', 'notes_md'] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (patch.area_id !== undefined) row.area_id = patch.area_id;
  else if (patch.area !== undefined) row.area_id = patch.area ? (await areaByName(patch.area))?.id ?? null : null;
  const { data, error } = await admin().from('projects').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(`project_update: ${error.message}`);
  return data as Project;
}

export async function deleteProject(id: UUID): Promise<Project> {
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from('projects')
    .update({ deleted_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`project_delete: ${error.message}`);
  await admin().from('tasks').update({ deleted_at: now }).eq('project_id', id).is('deleted_at', null);
  return data as Project;
}

export async function restoreProject(id: UUID): Promise<void> {
  await admin().from('projects').update({ deleted_at: null }).eq('id', id);
}
