'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { updateConfig } from '@/lib/domain/config';
import { daySummaries, lifeCalendarSettings } from '@/lib/domain/lifecal';
import type { DayStat } from '@/lib/domain/lifecal-math';
import { istDate } from '@/lib/time';
import { type ActionResult, run } from './_result';

export type LifeCalendarData = {
  birth_date: string | null;
  lifespan_years: number;
  today: string;
  days: Record<string, DayStat>;
};

export async function getLifeCalendarAction(range?: { from: string; to: string }): Promise<ActionResult<LifeCalendarData>> {
  return run(async () => {
    await requireUser();
    const s = await lifeCalendarSettings();
    const today = istDate();
    const days = range ? await daySummaries(range.from, range.to) : {};
    return { ...s, today, days };
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
