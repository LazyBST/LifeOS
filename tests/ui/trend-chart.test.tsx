// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { TrendChart } from '@/components/dashboard/TrendChart';

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

describe('TrendChart', () => {
  it('renders actual + forecast series twice without a hooks error', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.map(String).join(' ')); });
    const props = { weeks: ['2026-10-05', '2026-10-12', '2026-10-19'], ahead: 2, series: [{ id: 'a', name: 'A', color: '#f00', actual: [1, 2, 3], forecast: [4, 5] }] };
    const { rerender } = render(<TrendChart {...props} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    rerender(<TrendChart {...props} height={300} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    spy.mockRestore();
    expect(errors.join('\n')).not.toMatch(/310|hooks|Rendered/i);
  });
});
