// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const addTransferAction = vi.fn(async () => ({ ok: true as const, data: {} }));
vi.mock('@/app/actions/money', () => ({
  addExpenseAction: vi.fn(), addIncomeAction: vi.fn(), settleAction: vi.fn(), addTransferAction: (...a: unknown[]) => (addTransferAction as unknown as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AddTransactionForm } from '@/components/money/AddTransactionForm';

afterEach(cleanup);

describe('Add a record: Transfer tab', () => {
  it('asks for both accounts and an amount before it adds anything', async () => {
    render(<AddTransactionForm categories={[]} accounts={[{ id: 'a', name: 'Federal', opening_balance: 0, is_default: true, archived_at: null }, { id: 'b', name: 'HDFC', opening_balance: 0, is_default: false, archived_at: null }]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Transfer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add transfer' }));
    await waitFor(() => expect(addTransferAction).not.toHaveBeenCalled());
  });
});
