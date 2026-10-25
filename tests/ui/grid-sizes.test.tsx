// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { defaultsFrom, merge, packLayout, sizeFor } from '@/components/widgets/WidgetGrid';

vi.mock('react-grid-layout/css/styles.css', () => ({}));
vi.mock('react-resizable/css/styles.css', () => ({}));

describe('grid sizes', () => {
  it('maps widths to four sizes', () => {
    expect([360, 767, 768, 1099, 1100, 1535, 1536].map(sizeFor)).toEqual(['sm', 'sm', 'md', 'md', 'lg', 'lg', 'xl']);
  });
  const lg = packLayout([{ id: 'a', w: 8, h: 6 }, { id: 'b', w: 4, h: 6 }, { id: 'c', w: 12, h: 4 }]);
  const d = defaultsFrom(lg);
  it('derives a one-column and an 8-column default', () => {
    expect(d.sm.every((l) => l.x === 0 && l.w === 1)).toBe(true);
    expect(d.md.every((l) => l.x + l.w <= 8)).toBe(true);
  });
  it('keeps a saved arrangement per size and ignores one that does not fit', () => {
    const saved = { md: [{ i: 'a', x: 0, y: 0, w: 8, h: 3 }, { i: 'b', x: 0, y: 3, w: 8, h: 3 }, { i: 'c', x: 0, y: 6, w: 8, h: 3 }], sm: [{ i: 'a', x: 0, y: 0, w: 12, h: 3 }] };
    const m = merge(d, saved, ['a', 'b', 'c']);
    expect(m.md[0].h).toBe(3);
    expect(m.sm).toBe(d.sm); // wrong widget list / too wide: default kept
    expect(m.xl).toBe(d.xl);
  });
});
