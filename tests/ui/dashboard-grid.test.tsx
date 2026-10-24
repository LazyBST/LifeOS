// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { DashboardGrid, DEFAULT_LG } from '@/components/dashboard/DashboardGrid';

vi.mock('react-grid-layout/css/styles.css', () => ({}));
vi.mock('react-resizable/css/styles.css', () => ({}));

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

describe('DashboardGrid', () => {
  it('renders every widget without a hooks error, also after a re-render', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
    const widgets = DEFAULT_LG.map((l) => ({ id: l.i, node: <div data-testid={l.i}>{l.i}</div> }));
    const { rerender, container } = render(<DashboardGrid widgets={widgets} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    rerender(<DashboardGrid widgets={widgets} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    spy.mockRestore();
    expect(errors.map(String).join('\n')).not.toMatch(/310|more hooks|fewer hooks|Rendered/);
    expect(container.querySelectorAll('[data-testid]').length).toBe(widgets.length);
  });
});
