// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SplitEditor, startingParts, type DraftPart } from '@/components/money/SplitEditor';

function Harness({ total }: { total: number }) {
  const [parts, setParts] = useState<DraftPart[]>(startingParts(total));
  return <SplitEditor total={total} parts={parts} onChange={setParts} categories={[{ value: 'f', label: 'Food' }]} labels={[]} />;
}

describe('SplitEditor', () => {
  it('starts as two halves and can grow beyond two parts', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<Harness total={100} />);
    expect(screen.getByText(/All ₹100 assigned/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add a part/i }));
    expect(screen.getByLabelText('Part 3 amount')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Part 1 amount'), { target: { value: '30' } });
    expect(screen.getByText(/left of ₹100/)).toBeTruthy();
  });
});
