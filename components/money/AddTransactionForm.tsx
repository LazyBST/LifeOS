'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addExpenseAction, addIncomeAction, settleAction } from '@/app/actions/money';
import { splitEqually } from '@/lib/domain/money-math';
import { istDate } from '@/lib/time';
import type { Account, Category, TxLabel } from '@/lib/types/db';
import { LabelPicker } from './LabelChips';

type AddTransactionFormProps = {
  categories: Category[];
  accounts: Account[];
  labels?: TxLabel[];
  onSaved?: () => void;
};

const NONE = '__none__';

/** Tabs: Expense / Income / Settle (spec section 6). Every submit goes
 *  through the money server actions, which revalidate the whole app so the
 *  wallet card and dashboard stay in sync. */
export function AddTransactionForm({ categories, accounts, labels = [], onSaved }: AddTransactionFormProps) {
  const router = useRouter();
  const today = istDate();

  // expense state
  const [exAmount, setExAmount] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exShare, setExShare] = useState('');
  const [exPeople, setExPeople] = useState('2');
  const [exCounterparty, setExCounterparty] = useState('');
  const [exCategory, setExCategory] = useState(NONE);
  const [exAccount, setExAccount] = useState(NONE);
  const [exDate, setExDate] = useState(today);
  const [exLabels, setExLabels] = useState<string[]>([]);

  // income state
  const [inAmount, setInAmount] = useState('');
  const [inDesc, setInDesc] = useState('');
  const [inCategory, setInCategory] = useState(NONE);
  const [inAccount, setInAccount] = useState(NONE);
  const [inDate, setInDate] = useState(today);
  const [inLabels, setInLabels] = useState<string[]>([]);

  // settle state
  const [stDirection, setStDirection] = useState<'received' | 'paid'>('received');
  const [stAmount, setStAmount] = useState('');
  const [stCounterparty, setStCounterparty] = useState('');
  const [stAccount, setStAccount] = useState(NONE);
  const [stDate, setStDate] = useState(today);

  const [saving, setSaving] = useState(false);

  function splitHelper() {
    const amount = Number(exAmount);
    const people = Number(exPeople);
    if (!amount || !people) return;
    setExShare(String(splitEqually(amount, people)));
  }

  async function submitExpense() {
    const amount = Number(exAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSaving(true);
    const res = await addExpenseAction({
      amount,
      description: exDesc.trim() || null,
      my_share: exShare.trim() ? Number(exShare) : amount,
      counterparty: exCounterparty.trim() || null,
      category_id: exCategory === NONE ? null : exCategory,
      account_id: exAccount === NONE ? null : exAccount,
      date: exDate,
      labels: exLabels,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not add expense');
      return;
    }
    toast.success(`${res.data.owed === 0 ? 'Expense added' : res.data.owed > 0 ? `${res.data.counterparty ?? 'They'} owe you` : `You owe ${res.data.counterparty ?? 'them'}`}`);
    setExAmount('');
    setExDesc('');
    setExShare('');
    setExCounterparty('');
    setExLabels([]);
    router.refresh();
    onSaved?.();
  }

  async function submitIncome() {
    const amount = Number(inAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSaving(true);
    const res = await addIncomeAction({
      amount,
      description: inDesc.trim() || null,
      category_id: inCategory === NONE ? null : inCategory,
      account_id: inAccount === NONE ? null : inAccount,
      date: inDate,
      labels: inLabels,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not add income');
      return;
    }
    toast.success('Income added');
    setInAmount('');
    setInDesc('');
    setInLabels([]);
    router.refresh();
    onSaved?.();
  }

  async function submitSettle() {
    const amount = Number(stAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    if (!stCounterparty.trim()) {
      toast.error('Who are you settling with?');
      return;
    }
    setSaving(true);
    const res = await settleAction({
      amount,
      direction: stDirection,
      counterparty: stCounterparty.trim(),
      account_id: stAccount === NONE ? null : stAccount,
      date: stDate,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not settle');
      return;
    }
    toast.success('Settled');
    setStAmount('');
    setStCounterparty('');
    router.refresh();
    onSaved?.();
  }

  return (
    <div>
      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">Expense</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="settle">Settle</TabsTrigger>
        </TabsList>

        <TabsContent value="expense" className="space-y-3 pt-3">
          <div className="flex gap-2">
            <Field label="Amount" className="flex-1">
              <Input type="number" inputMode="decimal" value={exAmount} onChange={(e) => setExAmount(e.target.value)} placeholder="200" />
            </Field>
            <Field label="Date" className="flex-1">
              <Input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={exDesc} onChange={(e) => setExDesc(e.target.value)} placeholder="Lunch" />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="My share" className="flex-1">
              <Input
                type="number"
                inputMode="decimal"
                value={exShare}
                onChange={(e) => setExShare(e.target.value)}
                placeholder={exAmount || '0'}
              />
            </Field>
            <Field label="Split with (people)" className="w-32">
              <Input type="number" inputMode="numeric" value={exPeople} onChange={(e) => setExPeople(e.target.value)} />
            </Field>
            <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={splitHelper}>
              Split equally
            </Button>
          </div>
          <Field label="Counterparty (who else was involved)">
            <Input value={exCounterparty} onChange={(e) => setExCounterparty(e.target.value)} placeholder="brother" />
          </Field>
          <div className="flex gap-2">
            <Field label="Category" className="flex-1">
              <Select value={exCategory} onValueChange={(v) => setExCategory(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto">{(v: string) => (v === NONE ? 'Auto-detect' : categories.find((c) => c.id === v)?.name ?? 'Auto-detect')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Auto-detect</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account" className="flex-1">
              <Select value={exAccount} onValueChange={(v) => setExAccount(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Default">{(v: string) => (v === NONE ? 'Default' : accounts.find((a) => a.id === v)?.name ?? 'Default')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {labels.length > 0 && <Field label="Labels"><LabelPicker inline labels={labels} value={exLabels} onChange={setExLabels} /></Field>}
          <Button type="button" className="h-11 w-full sm:h-8" disabled={saving} onClick={submitExpense}>
            Add expense
          </Button>
        </TabsContent>

        <TabsContent value="income" className="space-y-3 pt-3">
          <div className="flex gap-2">
            <Field label="Amount" className="flex-1">
              <Input type="number" inputMode="decimal" value={inAmount} onChange={(e) => setInAmount(e.target.value)} placeholder="5000" />
            </Field>
            <Field label="Date" className="flex-1">
              <Input type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={inDesc} onChange={(e) => setInDesc(e.target.value)} placeholder="Salary" />
          </Field>
          <div className="flex gap-2">
            <Field label="Category" className="flex-1">
              <Select value={inCategory} onValueChange={(v) => setInCategory(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto">{(v: string) => (v === NONE ? 'Auto-detect' : categories.find((c) => c.id === v)?.name ?? 'Auto-detect')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Auto-detect</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account" className="flex-1">
              <Select value={inAccount} onValueChange={(v) => setInAccount(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Default">{(v: string) => (v === NONE ? 'Default' : accounts.find((a) => a.id === v)?.name ?? 'Default')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {labels.length > 0 && <Field label="Labels"><LabelPicker inline labels={labels} value={inLabels} onChange={setInLabels} /></Field>}
          <Button type="button" className="h-11 w-full sm:h-8" disabled={saving} onClick={submitIncome}>
            Add income
          </Button>
        </TabsContent>

        <TabsContent value="settle" className="space-y-3 pt-3">
          <div className="flex gap-2">
            <Field label="Direction" className="flex-1">
              <Select value={stDirection} onValueChange={(v) => setStDirection(v as 'received' | 'paid')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => (v === 'paid' ? 'I paid them' : 'They paid me')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">They paid me</SelectItem>
                  <SelectItem value="paid">I paid them</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Amount" className="flex-1">
              <Input type="number" inputMode="decimal" value={stAmount} onChange={(e) => setStAmount(e.target.value)} placeholder="100" />
            </Field>
          </div>
          <Field label="Counterparty">
            <Input value={stCounterparty} onChange={(e) => setStCounterparty(e.target.value)} placeholder="brother" />
          </Field>
          <div className="flex gap-2">
            <Field label="Account" className="flex-1">
              <Select value={stAccount} onValueChange={(v) => setStAccount(v ?? NONE)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Default">{(v: string) => (v === NONE ? 'Default' : accounts.find((a) => a.id === v)?.name ?? 'Default')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Default</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date" className="flex-1">
              <Input type="date" value={stDate} onChange={(e) => setStDate(e.target.value)} />
            </Field>
          </div>
          <Button type="button" className="h-11 w-full sm:h-8" disabled={saving} onClick={submitSettle}>
            Settle
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default AddTransactionForm;
