'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createCategoryAction, createLabelAction, deleteCategoryAction, deleteLabelAction, renameCategoryAction, updateLabelAction } from '@/app/actions/money';
import type { Category, TxLabel } from '@/lib/types/db';

const COLORS = ['#10b981', '#a855f7', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#64748b'];

/** Add, rename and delete categories and labels. Deleting one leaves your transactions in place, just without it. */
export function CategoriesDialog({ categories, labels }: { categories: Category[]; labels: TxLabel[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Categories &amp; labels</Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader><DialogTitle>Categories &amp; labels</DialogTitle></DialogHeader>
            <Section title="Categories" hint="What a transaction is for: Food, Rent, Health…">
              <ManageList kind="category" items={categories.map((c) => ({ id: c.id, name: c.name }))} />
            </Section>
            <Section title="Labels" hint="How you see it: Necessity, Luxury… A transaction can have several.">
              <ManageList kind="label" items={labels} />
            </Section>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <div><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{hint}</p></div>
      {children}
    </section>
  );
}

type Item = { id: string; name: string; color?: string };

function ManageList({ kind, items }: { kind: 'category' | 'label'; items: Item[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[2]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const noun = kind === 'category' ? 'category' : 'label';

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const r = kind === 'category' ? await createCategoryAction(name) : await createLabelAction(name, color);
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setName('');
    router.refresh();
  }
  async function rename(it: Item, next: string) {
    if (!next.trim() || next.trim() === it.name) return;
    const r = kind === 'category' ? await renameCategoryAction(it.id, next) : await updateLabelAction(it.id, { name: next });
    if (!r.ok) toast.error(r.error); else router.refresh();
  }
  async function recolor(it: Item, c: string) {
    const r = await updateLabelAction(it.id, { color: c });
    if (!r.ok) toast.error(r.error); else router.refresh();
  }
  async function remove(it: Item) {
    const r = kind === 'category' ? await deleteCategoryAction(it.id) : await deleteLabelAction(it.id);
    setConfirm(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data.transactions ? `Deleted “${it.name}”. ${r.data.transactions} transaction${r.data.transactions === 1 ? '' : 's'} no longer ${kind === 'category' ? 'have a category' : 'carry it'}.` : `Deleted “${it.name}”.`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.length === 0 && <li className="text-sm text-muted-foreground">None yet.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            {kind === 'label' && <ColorDot color={it.color ?? COLORS[7]} onPick={(c) => void recolor(it, c)} />}
            <Input key={it.name} defaultValue={it.name} aria-label={`Rename ${it.name}`} className="h-8 flex-1" onBlur={(e) => void rename(it, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            {confirm === it.id ? (
              <span className="flex items-center gap-1 text-xs">
                <Button size="sm" variant="destructive" onClick={() => void remove(it)}>Delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm(it.id)} aria-label={`Delete ${it.name}`} title={`Delete ${it.name}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        {kind === 'label' && <ColorDot color={color} onPick={setColor} />}
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder={`New ${noun}`} aria-label={`New ${noun} name`} className="h-8 flex-1" />
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => void add()}>Add</Button>
      </div>
    </div>
  );
}

function ColorDot({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Pick a colour" className="size-6 rounded-full border-2 border-card shadow ring-1 ring-border" style={{ background: color }} />
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-50 cursor-default" onClick={() => setOpen(false)} />
          <span className="absolute left-0 z-[60] mt-1 flex gap-1 rounded-lg border bg-card p-1.5 shadow-xl">
            {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { onPick(c); setOpen(false); }} className="size-5 rounded-full" style={{ background: c }} />)}
          </span>
        </>
      )}
    </span>
  );
}
