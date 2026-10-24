import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import { forecast, type Forecast } from './progress';
import type { CompletedDailyRow, GoalProgressRow, ProjectProgressRow, UUID } from '@/lib/types/db';

export type GoalForecast = GoalProgressRow & Forecast;
export type ProjectForecast = ProjectProgressRow & Forecast;

export async function goalProgressRows(): Promise<GoalProgressRow[]> {
  const { data, error } = await admin().from('v_goal_progress').select('*');
  if (error) throw new Error(`v_goal_progress: ${error.message}`);
  return (data ?? []) as GoalProgressRow[];
}

export async function projectProgressRows(goalId?: UUID): Promise<ProjectProgressRow[]> {
  let q = admin().from('v_project_progress').select('*');
  if (goalId) q = q.eq('goal_id', goalId);
  const { data, error } = await q;
  if (error) throw new Error(`v_project_progress: ${error.message}`);
  return (data ?? []) as ProjectProgressRow[];
}

export async function goalVelocities(): Promise<Record<string, number>> {
  const { data, error } = await admin().from('v_goal_velocity').select('*');
  if (error) throw new Error(`v_goal_velocity: ${error.message}`);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { goal_id: string | null; min_per_day: number }[]) {
    if (r.goal_id) out[r.goal_id] = Number(r.min_per_day);
  }
  return out;
}

export async function globalVelocity(): Promise<number> {
  const { data } = await admin().from('v_global_velocity').select('min_per_day').maybeSingle();
  return Number(data?.min_per_day ?? 0);
}

/** Progress + forecast for every goal, the numbers the goals strip shows. */
export async function goalForecasts(today = istDate()): Promise<GoalForecast[]> {
  const [rows, vel, global] = await Promise.all([goalProgressRows(), goalVelocities(), globalVelocity()]);
  return rows.map((r) => ({
    ...r,
    ...forecast(r, {
      goalVelocity: vel[r.goal_id],
      globalVelocity: global,
      today,
      targetDate: r.target_date,
    }),
  }));
}

export async function goalForecast(goalId: UUID, today = istDate()): Promise<GoalForecast | null> {
  return (await goalForecasts(today)).find((g) => g.goal_id === goalId) ?? null;
}

export async function projectForecasts(goalId?: UUID, today = istDate()): Promise<ProjectForecast[]> {
  const [rows, global] = await Promise.all([projectProgressRows(goalId), globalVelocity()]);
  return rows.map((r) => ({
    ...r,
    ...forecast(r, { goalVelocity: null, globalVelocity: global, today, targetDate: r.target_date }),
  }));
}

export async function completedDaily(sinceDays: number): Promise<CompletedDailyRow[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin()
    .from('v_completed_daily')
    .select('*')
    .gte('day', since)
    .order('day');
  if (error) throw new Error(`v_completed_daily: ${error.message}`);
  return (data ?? []) as CompletedDailyRow[];
}
