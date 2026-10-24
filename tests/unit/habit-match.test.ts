import { describe, expect, it } from 'vitest';
import { matchHabit, normalizeTitle } from '@/lib/google/habit-match';

const habits = [{ id: 'g', name: '🏋 Gym' }, { id: 'r', name: 'Read 20 pages' }, { id: 'm', name: 'Meditate', gtask_title: 'Morning sit' }];

describe('habit ↔ Google Task title matching', () => {
  it('ignores emoji, case, punctuation and spacing', () => {
    expect(normalizeTitle('🏋️ Gym!')).toBe('gym');
    expect(normalizeTitle('  Read   20 pages ')).toBe('read20pages');
  });
  it('matches by name or by the override title', () => {
    expect(matchHabit('gym', habits)?.id).toBe('g');
    expect(matchHabit('READ 20 PAGES', habits)?.id).toBe('r');
    expect(matchHabit('Morning sit', habits)?.id).toBe('m');
    expect(matchHabit('Meditate', habits)).toBeNull(); // overridden, so the name no longer matches
  });
  it('does not guess: unknown or ambiguous titles match nothing', () => {
    expect(matchHabit('Buy milk', habits)).toBeNull();
    expect(matchHabit('Gym', [{ id: 'a', name: 'Gym' }, { id: 'b', name: '🏋 gym' }])).toBeNull();
    expect(matchHabit('', habits)).toBeNull();
  });
});
