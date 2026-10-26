// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClearableInput } from '@/components/ui/clearable-input';

afterEach(cleanup);

describe('ClearableInput', () => {
  it('shows a cross only when there is something to clear, and clears on click', () => {
    const onClear = vi.fn();
    const { rerender } = render(<ClearableInput value="" onChange={() => undefined} onClear={onClear} clearLabel="Remove the date" type="date" />);
    expect(screen.queryByLabelText('Remove the date')).toBeNull();
    rerender(<ClearableInput value="2026-10-26" onChange={() => undefined} onClear={onClear} clearLabel="Remove the date" type="date" />);
    fireEvent.click(screen.getByLabelText('Remove the date'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
  it('hides the cross while the field is disabled', () => {
    render(<ClearableInput value="x" disabled onChange={() => undefined} onClear={() => undefined} />);
    expect(screen.queryByLabelText('Clear')).toBeNull();
  });
});
