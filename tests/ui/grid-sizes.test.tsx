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
    expect(m.sm).toHaveLength(3); // the too-wide saved item is replaced by the defaults
    expect(m.sm.every((l) => l.w === 1)).toBe(true);
    expect(m.xl).toBe(d.xl);
  });
});

describe('a widget added or removed since the layout was saved', () => {
  // defaults always describe the widgets that exist now (a, b and the new c)
  const d = defaultsFrom(packLayout([{ id: 'a', w: 6, h: 4 }, { id: 'b', w: 6, h: 4 }, { id: 'c', w: 6, h: 4 }]));
  const saved = { lg: [{ i: 'b', x: 0, y: 0, w: 12, h: 3 }, { i: 'a', x: 0, y: 3, w: 12, h: 3 }, { i: 'gone', x: 0, y: 6, w: 12, h: 3 }] };
  it('keeps the arrangement of the rest, drops the removed one and puts a new one at the bottom', () => {
    const m = merge(d, saved, ['a', 'b', 'c']).lg;
    expect(m.map((l) => l.i)).toEqual(['b', 'a', 'c']);
    expect(m.find((l) => l.i === 'c')!.y).toBe(6);
    expect(merge(d, saved, ['a', 'b', 'c']).lg.map((l) => l.i)).not.toContain('gone');
  });
});
