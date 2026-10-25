// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Gauge } from '@/components/money/Gauge';

afterEach(cleanup);

describe('Gauge', () => {
  it('shows the label and value, and clamps the needle', () => {
    const { container, getByText } = render(<Gauge label="Balance" position={9} value="₹1,000" />);
    getByText('Balance'); getByText('₹1,000');
    const needle = container.querySelector('line')!;
    expect(Number(needle.getAttribute('x2'))).toBeGreaterThan(160); // pinned to the right end, not beyond
  });
  it('points left for a low value and handles NaN', () => {
    const { container } = render(<Gauge label="x" position={Number.NaN} value="0" />);
    expect(Number(container.querySelector('line')!.getAttribute('x2'))).toBeLessThan(40);
  });
});
