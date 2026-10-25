import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { istDate } from '@/lib/time';
import { nextAfter, type Frequency, type ScheduledLike } from './money-forecast-math';
import { addExpense, addIncome, listCategories, spendByCategory } from './money';
import type { DateStr, UUID } from '@/lib/types/db';

// ---- budgets -----------------------------------------------------------------

export type BudgetRow = { category_id: UUID; category: string; budget: number | null; spent: number };

/** Every category with its monthly budget (if any) and what has been spent in the period (my share). */
export async function budgetStatus(from: DateStr, to: DateStr): Promise<{ rows: BudgetRow[]; ready: boolean }> {
  const [cats, spend, b] = await Promise.all([listCategories(), spendByCategory(from, to), admin().from('budgets').select('category_id,monthly_amount')]);
  const ready = !b.error; // false until migration 0016 is run
  const budget = new Map(((b.data ?? []) as { category_id: UUID; monthly_amount: number }[]).map((r) => [r.category_id, Number(r.monthly_amount)]));
  const spent = new Map(spend.map((s) => [s.category, s.amount]));
  const rows = cats.map((c) => ({ category_id: c.id, category: c.name, budget: budget.get(c.id) ?? null, spent: spent.get(c.name) ?? 0 }));
  return { rows: rows.filter((r) => r.budget !== null || r.spent > 0).sort((a, c) => (c.budget ?? 0) - (a.budget ?? 0) || c.spent - a.spent), ready };
}

export async function setBudget(categoryId: UUID, amount: number): Promise<void> {
  if (!(amount > 0)) {
    const { error } = await admin().from('budgets').delete().eq('category_id', categoryId);
    if (error) throw new Error(`budget_delete: ${error.message}`);
    return;
  }
  const { error } = await admin().from('budgets').upsert({ category_id: categoryId, monthly_amount: amount, updated_at: new Date().toISOString() }, { onConflict: 'category_id' });
  if (error) throw new Error(`budget_set: ${error.message}`);
}

// ---- scheduled payments ------------------------------------------------------

export type ScheduledPayment = ScheduledLike & {
  category_id: UUID | null; account_id: UUID | null; last_paid_on: DateStr | null; note: string | null;
};

export type ScheduledInput = {
  name: string; kind: 'expense' | 'income'; amount: number; frequency: Frequency; next_due: DateStr;
  end_date?: DateStr | null; category_id?: UUID | null; account_id?: UUID | null; note?: string | null;
};

export async function listScheduled(): Promise<{ items: ScheduledPayment[]; ready: boolean }> {
  const { data, error } = await admin().from('scheduled_payments').select('*').is('deleted_at', null).eq('active', true).order('next_due');
  if (error) return { items: [], ready: false };
  return { items: (data as ScheduledPayment[]).map((r) => ({ ...r, amount: Number(r.amount) })), ready: true };
}

export async function createScheduled(input: ScheduledInput): Promise<ScheduledPayment> {
  const { data, error } = await admin()
    .from('scheduled_payments')
    .insert({
      name: input.name.trim(), kind: input.kind, amount: input.amount, frequency: input.frequency, next_due: input.next_due,
      end_date: input.end_date ?? null, category_id: input.category_id ?? null, account_id: input.account_id ?? null, note: input.note ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`scheduled_create: ${error.message}`);
  return data as ScheduledPayment;
}

export async function deleteScheduled(id: UUID): Promise<void> {
  const { error } = await admin().from('scheduled_payments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`scheduled_delete: ${error.message}`);
}

async function advance(p: ScheduledPayment, paidOn: DateStr | null): Promise<void> {
  const next = nextAfter(p.next_due, p.frequency, p.end_date);
  const patch: Record<string, unknown> = next ? { next_due: next } : { active: false };
  if (paidOn) patch.last_paid_on = paidOn;
  const { error } = await admin().from('scheduled_payments').update(patch).eq('id', p.id);
  if (error) throw new Error(`scheduled_advance: ${error.message}`);
}

async function getScheduled(id: UUID): Promise<ScheduledPayment> {
  const { data, error } = await admin().from('scheduled_payments').select('*').eq('id', id).is('deleted_at', null).single();
  if (error) throw new Error(`scheduled_get: ${error.message}`);
  return { ...(data as ScheduledPayment), amount: Number((data as ScheduledPayment).amount) };
}

/** Record this payment as a real transaction (dated today) and move the schedule to its next date. */
export async function payScheduled(id: UUID, amount?: number): Promise<void> {
  const p = await getScheduled(id);
  const today = istDate();
  const input = { amount: amount ?? p.amount, description: p.name, category_id: p.category_id, account_id: p.account_id, date: today, note: p.note };
  if (p.kind === 'income') await addIncome(input);
  else await addExpense(input);
  await advance(p, today);
}

/** Skip this one without recording anything. */
export async function skipScheduled(id: UUID): Promise<void> {
  await advance(await getScheduled(id), null);
}
