// Matching a Google Task to a habit by title. Pure, so it is unit-tested.

/** "🏋️ Gym!" and "gym" are the same habit: lower-case, drop emoji, punctuation and spacing. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export type MatchableHabit = { id: string; name: string; gtask_title?: string | null };

/** The habit whose name (or title override) equals the task title; null when none or ambiguous. */
export function matchHabit(taskTitle: string, habits: MatchableHabit[]): MatchableHabit | null {
  const t = normalizeTitle(taskTitle);
  if (!t) return null;
  const hits = habits.filter((h) => normalizeTitle(h.gtask_title || h.name) === t);
  return hits.length === 1 ? hits[0] : null;
}
