'use server';

import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import { listAreas } from '@/lib/domain/areas';
import { listGoals } from '@/lib/domain/goals';
import { listProjects } from '@/lib/domain/projects';
import type { Area, Goal, Project } from '@/lib/types/db';

export async function listAreasAction(): Promise<ActionResult<Area[]>> {
  return run(async () => {
    await requireUser();
    return listAreas();
  });
}

export async function listGoalsAction(): Promise<ActionResult<Goal[]>> {
  return run(async () => {
    await requireUser();
    return listGoals();
  });
}

export async function listProjectsAction(goalId?: string): Promise<ActionResult<Project[]>> {
  return run(async () => {
    await requireUser();
    return listProjects(goalId ? { goal_id: goalId } : {});
  });
}
