import { ScheduleLedger } from './ScheduleLedger';
import { InlineDate } from '@/components/entity/InlineDate';
import type { FieldSave } from '@/components/entity/save';
import { projectedEnd, type Ledger } from '@/lib/domain/ledger-math';
import { formatDate } from '@/lib/time';

type Stat = { label: string; value: string; sub: string; tone?: 'bad' | 'good' | 'warn'; edit?: { value: string | null; save: FieldSave } };
const toneCls = { bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300', good: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300', warn: 'text-amber-700 dark:text-amber-400' };

/** First agreed deadline / current / projected / completed, plus the two-way ledger. */
export function LedgerSection({ name, agreed, current, completedOn, ledger, slips, doneUnits, totalUnits, agreedSave, completedSave }: {
  name: string; agreed: string | null; current: string | null; completedOn: string | null;
  /** where the two editable dates are saved */
  agreedSave: FieldSave; completedSave: FieldSave;
  ledger: Ledger; slips: number; doneUnits?: number; totalUnits?: number;
}) {
  const proj = projectedEnd(agreed ?? current, ledger.net);
  const moved = agreed && current && current !== agreed;
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  const stats: Stat[] = [
    { label: 'First agreed deadline', value: agreed ? formatDate(agreed) : '—', sub: 'fixed when first set · click the date to correct it', edit: { value: agreed, save: agreedSave } },
    { label: 'Current deadline', value: current ? formatDate(current) : '—', sub: moved ? `${days(agreed!, current!) > 0 ? '+' : ''}${days(agreed!, current!)} days${slips ? ` · pushed ${slips}×` : ''}` : 'unchanged', tone: moved ? (days(agreed!, current!) > 0 ? 'bad' : 'good') : undefined },
    { label: 'Projected finish', value: proj ? formatDate(proj) : '—', sub: ledger.net === 0 ? 'on the agreed schedule' : `agreed ${ledger.net > 0 ? '+' : '−'}${Math.abs(ledger.net)} days from the ledger${totalUnits ? ` · ${doneUnits}/${totalUnits} units` : ''}`, tone: ledger.net > 0 ? 'warn' : ledger.net < 0 ? 'good' : undefined },
    { label: 'Completed on', value: completedOn ? formatDate(completedOn) : '—', sub: completedOn ? 'stamped automatically · click the date to correct it' : 'stamped when it is done · or enter it', edit: { value: completedOn, save: completedSave } },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.tone === 'bad' || s.tone === 'good' ? toneCls[s.tone] : 'border-border bg-card'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
            {s.edit ? <InlineDate value={s.edit.value} save={s.edit.save} className="mt-0.5 h-8 w-full text-base font-bold" /> : <div className={`text-lg font-bold ${s.tone === 'warn' ? toneCls.warn : ''}`}>{s.value}</div>}
            <div className="text-[12px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-0.5 text-sm font-semibold">Schedule ledger · every day gained or lost</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Each item moves {name} — late adds days, early subtracts them.</p>
        <ScheduleLedger ledger={ledger} parentName={name} />
      </section>
    </div>
  );
}
