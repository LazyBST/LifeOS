'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import {
  type ProjectInput,
  type ProjectPatch,
  createProject,
  deleteProject,
  updateProject,
} from '@/lib/domain/projects';
import type { Project } from '@/lib/types/db';

export async function createProjectAction(input: ProjectInput): Promise<ActionResult<Project>> {
  return run(async () => {
    await requireUser();
    const project = await createProject(input);
    revalidatePath('/', 'layout');
    return project;
  });
}

export async function updateProjectAction(
  id: string,
  patch: ProjectPatch,
): Promise<ActionResult<Project>> {
  return run(async () => {
    await requireUser();
    const project = await updateProject(id, patch);
    revalidatePath('/', 'layout');
    return project;
  });
}

export async function deleteProjectAction(id: string): Promise<ActionResult<Project>> {
  return run(async () => {
    await requireUser();
    const project = await deleteProject(id);
    revalidatePath('/', 'layout');
    return project;
  });
}
