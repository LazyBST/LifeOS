// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/uistate', () => ({ saveUiStateAction: vi.fn() }));
vi.mock('react-grid-layout/css/styles.css', () => ({}));
vi.mock('react-resizable/css/styles.css', () => ({}));
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

import { ActivityHeat, Donut, ExecutionWeeks, HourBars, StatTiles, StreakBars } from '@/components/analytics/Insights';
import { packLayout } from '@/components/widgets/WidgetGrid';

afterEach(cleanup);
const days = Array.from({ length: 182 }, (_, i) => ({ date: new Date(Date.UTC(2026, 3, 26 + i)).toISOString().slice(0, 10), count: i % 7 }));

describe('analytics widgets', () => {
  it('heatmap draws one square per day and explains itself', () => {
    const { container } = render(<ActivityHeat days={days} />);
    expect(container.querySelectorAll('[title*="completed"]').length).toBe(182);
    expect(screen.getByText(/units completed in the last 26 weeks/)).toBeTruthy();
  });
  it('every chart has a friendly empty state instead of an empty box', () => {
    render(<><ActivityHeat days={days.map((d) => ({ ...d, count: 0 }))} /><Donut data={[]} /><ExecutionWeeks weeks={[]} /><HourBars hours={[]} /></>);
    expect(screen.getAllByText(/./).length).toBeGreaterThan(0);
    expect(screen.getByText(/Complete a few tasks/)).toBeTruthy();
    expect(screen.getByText(/Schedule and finish tasks/)).toBeTruthy();
  });
  it('donut lists shares of the total', () => {
    render(<Donut data={[{ name: 'Business', value: 3 }, { name: 'Health', value: 1 }]} />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });
  it('streak bars and stat tiles render their numbers', () => {
    render(<><StreakBars streaks={[{ name: 'Gym', current: 5, longest: 12 }]} /><StatTiles items={[{ label: 'Daily score', value: '72%', tone: 'good' }]} /></>);
    expect(screen.getByText('Gym')).toBeTruthy();
    expect(screen.getByText('72%')).toBeTruthy();
  });
});

describe('packLayout', () => {
  it('flows widgets left to right and wraps rows', () => {
    const l = packLayout([{ id: 'a', w: 8, h: 7 }, { id: 'b', w: 4, h: 5 }, { id: 'c', w: 6, h: 4 }, { id: 'd', w: 6, h: 9 }, { id: 'e', w: 12, h: 3 }]);
    expect(l.map((x) => [x.i, x.x, x.y])).toEqual([['a', 0, 0], ['b', 8, 0], ['c', 0, 7], ['d', 6, 7], ['e', 0, 16]]);
  });
  it('never exceeds 12 columns', () => {
    expect(packLayout([{ id: 'a', w: 20, h: 4 }])[0].w).toBe(12);
  });
});
