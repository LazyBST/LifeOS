// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editable } from '@/components/money/Editable';

afterEach(cleanup);

describe('Editable', () => {
  it('looks like text, becomes a box when clicked, and saves on Enter', async () => {
    const onCommit = vi.fn(async () => null);
    render(<Editable label="description" value="Lunch" onCommit={onCommit} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByLabelText('Edit description'));
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'Late lunch' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('Late lunch'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('Escape puts it back without saving', () => {
    const onCommit = vi.fn();
    render(<Editable label="description" value="Lunch" onCommit={onCommit} />);
    fireEvent.click(screen.getByLabelText('Edit description'));
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'Oops' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Edit description').textContent).toBe('Lunch');
  });
  it('turns into a drop-down when given options and saves the choice straight away', async () => {
    const onCommit = vi.fn(async () => null);
    render(<Editable label="category" value="a" display="Food" options={[{ value: 'a', label: 'Food' }, { value: 'b', label: 'Rent' }]} onCommit={onCommit} />);
    fireEvent.click(screen.getByLabelText('Edit category'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('b'));
  });
  it('shows the old value again when the save is refused', async () => {
    render(<Editable label="amount" type="number" value="100" display="₹100" onCommit={async () => 'Enter an amount'} />);
    fireEvent.click(screen.getByLabelText('Edit amount'));
    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.getByLabelText('Edit amount').textContent).toBe('₹100'));
  });
});
