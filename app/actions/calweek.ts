'use server';

import { requireUser } from '@/lib/auth';
import { weekData, type WeekData } from '@/lib/domain/calweek';
import { type ActionResult, run } from './_result';

export async function getCalendarWeekAction(weekStart: string): Promise<ActionResult<WeekData>> {
  return run(async () => {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('Bad week');
    return weekData(weekStart);
  });
}
