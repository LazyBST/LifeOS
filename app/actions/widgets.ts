'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { updateConfig } from '@/lib/domain/config';
import { setPriority, togglePriority } from '@/lib/domain/priorities';
import { setImprovement, setImprovementFollowed } from '@/lib/domain/improvement';
import { istDate } from '@/lib/time';
import { type ActionResult, run } from './_result';

const pos = (n: number): 1 | 2 | 3 => {
  if (n !== 1 && n !== 2 && n !== 3) throw new Error('Position must be 1, 2 or 3');
  return n;
};

export async function setPriorityAction(position: number, text: string, taskId?: string | null): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setPriority(istDate(), pos(position), text, taskId);
    revalidatePath('/');
    return null;
  });
}

export async function togglePriorityAction(position: number): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await togglePriority(istDate(), pos(position));
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Tonight's improvement is saved on today's journal row and shown tomorrow morning. */
export async function setImprovementAction(text: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setImprovement(istDate(), text);
    revalidatePath('/');
    return null;
  });
}

export async function followImprovementAction(date: string, followed: boolean): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    await setImprovementFollowed(date, followed);
    revalidatePath('/');
    return null;
  });
}

/** Accepts only a calendar.google.com embed link; anything else is refused. */
export async function setCalendarEmbedAction(url: string): Promise<ActionResult<null>> {
  return run(async () => {
    await requireUser();
    const clean = url.trim();
    if (clean) {
      let u: URL;
      try { u = new URL(clean); } catch { throw new Error('That is not a valid link.'); }
      if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/embed')) {
        throw new Error('Use the embed link from Google Calendar: Settings → your calendar → Integrate calendar → Public URL / embed code (it starts with https://calendar.google.com/calendar/embed).');
      }
    }
    try {
      await updateConfig({ calendar_embed_url: clean || null });
    } catch {
      throw new Error('Could not save. Run supabase/migrations/0008_deadlines_priorities.sql first.');
    }
    revalidatePath('/');
    return null;
  });
}
