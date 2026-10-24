'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { type ActionResult, run } from './_result';
import { getJournal, listAllJournal, listJournal, setMood, writeJournal } from '@/lib/domain/journal';
import { summariseJournals } from '@/lib/domain/journal-summary';
import { istDate } from '@/lib/time';
import type { JournalEntry } from '@/lib/types/db';

export async function getJournalAction(date?: string): Promise<ActionResult<JournalEntry | null>> {
  return run(async () => {
    await requireUser();
    return getJournal(date ?? istDate());
  });
}

export async function writeJournalAction(input: {
  date?: string;
  body_md: string;
  mood?: number | null;
  mode?: 'append' | 'replace';
}): Promise<ActionResult<JournalEntry>> {
  return run(async () => {
    await requireUser();
    const entry = await writeJournal(input);
    revalidatePath('/', 'layout');
    return entry;
  });
}

export async function setMoodAction(date: string, mood: number): Promise<ActionResult<JournalEntry>> {
  return run(async () => {
    await requireUser();
    const entry = await setMood(date, mood);
    revalidatePath('/', 'layout');
    return entry;
  });
}

export async function listJournalAction(from: string, to: string): Promise<ActionResult<JournalEntry[]>> {
  return run(async () => {
    await requireUser();
    return listJournal(from, to);
  });
}

/** Pointwise summary of the whole journal history (how life is going, big ups and downs). */
export async function summariseJournalsAction(): Promise<ActionResult<{ summary: string; entries: number; usedModel: boolean }>> {
  return run(async () => {
    await requireUser();
    return summariseJournals(await listAllJournal());
  });
}
