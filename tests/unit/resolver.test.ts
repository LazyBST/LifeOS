import { describe, it, expect } from 'vitest';
import {
  rank,
  resolveRanked,
  scoreCandidate,
  AUTO_PICK_MIN,
  AUTO_PICK_MARGIN,
  type Candidate,
} from '@/lib/agent/rank';

const NOW = new Date('2026-10-24T12:00:00Z');

function candidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'similarity'>): Candidate {
  return { type: 'task', title: 'untitled', ...overrides };
}

describe('resolveRanked thresholds (spec section 7)', () => {
  it('auto-picks a clear winner: top >= 0.6 and margin >= 0.15', () => {
    const candidates = [
      candidate({ id: 'a', similarity: 0.9 }),
      candidate({ id: 'b', similarity: 0.5 }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('auto');
    if (res.kind === 'auto') {
      expect(res.pick.id).toBe('a');
      expect(res.options.map((o) => o.id)).toEqual(['a', 'b']);
    }
  });

  it('asks when two "login" candidates are near-identical (acceptance criteria case)', () => {
    const candidates = [
      candidate({ id: 'login-1', title: 'Fix login redirect', similarity: 0.82 }),
      candidate({ id: 'login-2', title: 'Fix login button', similarity: 0.8 }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('ask');
    if (res.kind === 'ask') {
      expect(res.options.map((o) => o.id).sort()).toEqual(['login-1', 'login-2']);
    }
  });

  it('asks when the top score is below 0.6 even with a big margin', () => {
    const candidates = [
      candidate({ id: 'a', similarity: 0.55 }),
      candidate({ id: 'b', similarity: 0.05 }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('ask');
  });

  it('returns kind "none" for empty input', () => {
    expect(resolveRanked([], NOW)).toEqual({ kind: 'none' });
  });

  it('boundary: top >= 0.6 and margin exactly 0.15 auto-picks', () => {
    const candidates = [
      candidate({ id: 'a', similarity: 0.75 }),
      candidate({ id: 'b', similarity: 0.6 }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('auto');
  });

  it('boundary: top just under 0.6 asks', () => {
    const candidates = [
      candidate({ id: 'a', similarity: 0.599 }),
      candidate({ id: 'b', similarity: 0.3 }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('ask');
  });

  it('boundary: margin just under 0.15 asks', () => {
    const candidates = [
      candidate({ id: 'a', similarity: 0.7 }),
      candidate({ id: 'b', similarity: 0.7 - (AUTO_PICK_MARGIN - 0.001) }),
    ];
    const res = resolveRanked(candidates, NOW);
    expect(res.kind).toBe('ask');
  });

  it('exposes the documented threshold constants', () => {
    expect(AUTO_PICK_MIN).toBe(0.6);
    expect(AUTO_PICK_MARGIN).toBe(0.15);
  });
});

describe('scoreCandidate boosts', () => {
  it('in-context boost raises the score', () => {
    const base = candidate({ id: 'a', similarity: 0.5 });
    const boosted = candidate({ id: 'a', similarity: 0.5, inContext: true });
    expect(scoreCandidate(boosted, NOW)).toBeGreaterThan(scoreCandidate(base, NOW));
  });

  it('open (non-done/dropped) status boosts the score over a done item', () => {
    const open = candidate({ id: 'a', similarity: 0.5, status: 'doing' });
    const done = candidate({ id: 'a', similarity: 0.5, status: 'done' });
    expect(scoreCandidate(open, NOW)).toBeGreaterThan(scoreCandidate(done, NOW));
  });

  it('recently updated items score higher than stale ones', () => {
    const recent = candidate({ id: 'a', similarity: 0.5, updated_at: new Date(NOW.getTime() - 3_600_000).toISOString() });
    const stale = candidate({ id: 'a', similarity: 0.5, updated_at: new Date(NOW.getTime() - 30 * 86_400_000).toISOString() });
    expect(scoreCandidate(recent, NOW)).toBeGreaterThan(scoreCandidate(stale, NOW));
  });

  it('due-soon items score higher than items due far away', () => {
    const soon = candidate({ id: 'a', similarity: 0.5, due_date: '2026-10-25' });
    const far = candidate({ id: 'a', similarity: 0.5, due_date: '2027-06-01' });
    expect(scoreCandidate(soon, NOW)).toBeGreaterThan(scoreCandidate(far, NOW));
  });

  it('rank sorts candidates by score descending', () => {
    const candidates = [
      candidate({ id: 'low', similarity: 0.2 }),
      candidate({ id: 'high', similarity: 0.9 }),
      candidate({ id: 'mid', similarity: 0.5 }),
    ];
    const ranked = rank(candidates, NOW);
    expect(ranked.map((c) => c.id)).toEqual(['high', 'mid', 'low']);
  });
});
