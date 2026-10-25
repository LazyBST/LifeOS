// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/app/actions/order', () => ({ saveOrderAction: vi.fn(async () => ({ ok: true, data: null })) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { Reorderable, applyOrder } from '@/components/widgets/Reorderable';

afterEach(cleanup);

describe('Reorderable', () => {
  it('applies a saved order, leaving unknown ids at the end in their natural order', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    expect(applyOrder(items, ['c', 'a']).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(items, ['zzz', 'd']).map((i) => i.id)).toEqual(['d', 'a', 'b', 'c']);
    expect(applyOrder(items, []).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('renders rows in the saved order, each with a drag grip', () => {
    const { container, getAllByLabelText } = render(
      <Reorderable orderKey="t" order={['y', 'x']} items={[{ id: 'x', node: <p>first</p> }, { id: 'y', node: <p>second</p> }, { id: 'z', node: <p>third</p> }]} />,
    );
    expect(Array.from(container.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['second', 'first', 'third']);
    expect(getAllByLabelText('Drag to reorder')).toHaveLength(3);
  });
});
