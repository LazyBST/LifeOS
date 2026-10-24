import type { JournalEntry } from '@/lib/types/db';

type Moody = Pick<JournalEntry, 'entry_date' | 'mood'>;

export type MoodStats = {
  count: number;
  average: number | null;
  distribution: number[]; // index 0 = mood 1
  monthly: { month: string; average: number; count: number }[];
  best: { date: string; mood: number } | null;
  worst: { date: string; mood: number } | null;
};

/** Mood trend: each logged day plus a trailing 7-entry average. */
export function moodTrend(entries: Moody[]): { date: string; mood: number; avg7: number }[] {
  const pts = entries
    .filter((e): e is { entry_date: string; mood: number } => e.mood != null)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  return pts.map((p, i) => {
    const win = pts.slice(Math.max(0, i - 6), i + 1);
    const avg7 = win.reduce((s, x) => s + x.mood, 0) / win.length;
    return { date: p.entry_date, mood: p.mood, avg7: Math.round(avg7 * 100) / 100 };
  });
}

export function moodStats(entries: Moody[]): MoodStats {
  const pts = moodTrend(entries);
  const distribution = [0, 0, 0, 0, 0];
  const byMonth = new Map<string, { sum: number; n: number }>();
  let best: MoodStats['best'] = null;
  let worst: MoodStats['worst'] = null;
  for (const p of pts) {
    distribution[Math.min(5, Math.max(1, Math.round(p.mood))) - 1]++;
    const m = byMonth.get(p.date.slice(0, 7)) ?? { sum: 0, n: 0 };
    m.sum += p.mood;
    m.n++;
    byMonth.set(p.date.slice(0, 7), m);
    if (!best || p.mood > best.mood) best = { date: p.date, mood: p.mood };
    if (!worst || p.mood < worst.mood) worst = { date: p.date, mood: p.mood };
  }
  return {
    count: pts.length,
    average: pts.length ? Math.round((pts.reduce((s, p) => s + p.mood, 0) / pts.length) * 100) / 100 : null,
    distribution,
    monthly: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, average: Math.round((v.sum / v.n) * 100) / 100, count: v.n })),
    best,
    worst,
  };
}
