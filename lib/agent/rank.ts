// Pure ranking for the entity resolver (spec section 7). Kept free of I/O so
// the thresholds can be unit-tested.

export type Candidate = {
  id: string;
  type: 'goal' | 'project' | 'task' | 'habit';
  title: string;
  path?: string;
  /** trigram similarity 0..1 from Postgres */
  similarity: number;
  status?: string;
  updated_at?: string;
  due_date?: string | null;
  /** matches the entity on the current page or one mentioned recently */
  inContext?: boolean;
};

export type Scored = Candidate & { score: number };

export const AUTO_PICK_MIN = 0.6;
export const AUTO_PICK_MARGIN = 0.15;

/**
 * Boosts: open items, recently updated items, items due soon, and items that
 * are the page entity or were touched earlier in the conversation.
 */
export function scoreCandidate(c: Candidate, now = new Date()): number {
  let s = c.similarity;
  if (c.status && c.status !== 'done' && c.status !== 'dropped') s += 0.08;
  if (c.updated_at) {
    const days = (now.getTime() - Date.parse(c.updated_at)) / 86_400_000;
    if (days <= 1) s += 0.08;
    else if (days <= 7) s += 0.04;
  }
  if (c.due_date) {
    const days = (Date.parse(`${c.due_date}T00:00:00Z`) - now.getTime()) / 86_400_000;
    if (days <= 7) s += 0.05;
  }
  if (c.inContext) s += 0.25;
  return Math.min(1, Math.round(s * 1000) / 1000);
}

export function rank(candidates: Candidate[], now = new Date()): Scored[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c, now) }))
    .sort((a, b) => b.score - a.score);
}

export type Resolution =
  | { kind: 'auto'; pick: Scored; options: Scored[] }
  | { kind: 'ask'; options: Scored[] }
  | { kind: 'none' };

/**
 * Auto-pick only when the top score is at least 0.6 and beats the runner-up by
 * 0.15; otherwise ask with a short numbered list (spec section 7).
 */
export function resolveRanked(candidates: Candidate[], now = new Date(), limit = 5): Resolution {
  const scored = rank(candidates, now);
  if (scored.length === 0) return { kind: 'none' };
  const [top, second] = scored;
  const margin = second ? top.score - second.score : Infinity;
  if (top.score >= AUTO_PICK_MIN && margin >= AUTO_PICK_MARGIN) {
    return { kind: 'auto', pick: top, options: scored.slice(0, limit) };
  }
  return { kind: 'ask', options: scored.slice(0, limit) };
}
