'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { updateConfig } from '@/lib/domain/config';
import { areaTotals, dayItems, detailItems, lifeCalendarSettings, summarise, type DetailItem } from '@/lib/domain/lifecal';
import type { DayStat } from '@/lib/domain/lifecal-math';
import { istDate } from '@/lib/time';
import { type ActionResult, run } from './_result';

export type LifeCalendarData = {
  birth_date: string | null;
  lifespan_years: number;
  today: string;
  days: Record<string, DayStat>;
  /** done/total per area (key = area id, or 'none') over the loaded span, up to today */
  areas: Record<string, DayStat>;
};

export async function getLifeCalendarAction(range?: { from: string; to: string }, areaId?: string | null): Promise<ActionResult<LifeCalendarData>> {
  return run(async () => {
    await requireUser();
    const s = await lifeCalendarSettings();
    const today = istDate();
    const items = range ? await dayItems(range.from, range.to) : [];
    return { ...s, today, days: summarise(items, areaId), areas: areaTotals(items, today) };
  });
}

export async function setBirthDateAction(birth: string, lifespanYears = 80): Promise<ActionResult<{ birth_date: string }>> {
  return run(async () => {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth > istDate()) throw new Error('Enter a valid birth date in the past.');
    try {
      await updateConfig({ birth_date: birth, lifespan_years: lifespanYears });
    } catch {
      throw new Error('Could not save. Run supabase/migrations/0007_life_calendar.sql first.');
    }
    revalidatePath('/');
    return { birth_date: birth };
  });
}

/** What is behind one dot: the tasks and habits scheduled in that day, week or month. */
export async function getDayDetailAction(from: string, to: string): Promise<ActionResult<DetailItem[]>> {
  return run(async () => {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Bad range');
    return detailItems(from, to);
  });
}
