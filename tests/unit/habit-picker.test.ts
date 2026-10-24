import { describe, expect, it } from 'vitest';
import { matchHabits } from '@/components/habits/HabitPicker';

const habits = [
  { id: '1', name: 'Vitamin D', emoji: null }, { id: '2', name: 'Vitamin B', emoji: null }, { id: '3', name: '🏋 Gym class', emoji: '🏋' },
  { id: '4', name: 'Read non fictional', emoji: null }, { id: '5', name: 'Face Care Morning', emoji: null },
];
describe('habit picker matching', () => {
  it('finds habits by any typed words, in any order, ignoring case and punctuation', () => {
    expect(matchHabits('vit', habits).map((h) => h.id)).toEqual(['1', '2']);
    expect(matchHabits('VITAMIN d', habits).map((h) => h.id)).toEqual(['1']);
    expect(matchHabits('morning face', habits).map((h) => h.id)).toEqual(['5']);
    expect(matchHabits('gym!', habits).map((h) => h.id)).toEqual(['3']);
  });
  it('matches nothing for an empty or unknown query, so "create" is offered', () => {
    expect(matchHabits('', habits)).toEqual([]);
    expect(matchHabits('   ', habits)).toEqual([]);
    expect(matchHabits('juggling', habits)).toEqual([]);
  });
});
