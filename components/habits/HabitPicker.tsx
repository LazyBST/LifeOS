'use client';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createAndLinkHabitAction, linkHabitAction } from '@/app/actions/habits';
import type { HabitLinkType } from '@/lib/domain/habits';

export type PickerHabit = { id: string; name: string; emoji: string | null };
const clean = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Every typed word must appear in a habit's name, in any order. */
export function matchHabits(query: string, habits: PickerHabit[]): PickerHabit[] {
  const words = clean(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  return habits.filter((h) => { const n = clean(h.name); return words.every((w) => n.includes(w)); });
}

/**
 * Type to find an existing habit and attach it; if nothing matches (or you want a new one anyway) it offers to
 * create the habit and attach it in one step.
 */
export function HabitPicker({ entityType, entityId, areaId, options }: { entityType: HabitLinkType; entityId: string; areaId?: string | null; options: PickerHabit[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [i, setI] = useState(0);
  const [, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => matchHabits(q, options).slice(0, 6), [q, options]);
  const exact = options.some((h) => clean(h.name) === clean(q));
  const canCreate = q.trim().length > 0 && !exact;
  const rows = [...matches.map((h) => ({ kind: 'link' as const, h })), ...(canCreate ? [{ kind: 'new' as const }] : [])];

  function choose(row: (typeof rows)[number] | undefined) {
    if (!row) return;
    start(async () => {
      const r = row.kind === 'link' ? await linkHabitAction(row.h.id, entityType, entityId) : await createAndLinkHabitAction(q, entityType, entityId, areaId);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(row.kind === 'link' ? `Linked “${row.h.name}”.` : `Created “${q.trim()}” and linked it.`);
      setQ(''); setI(0); router.refresh();
    });
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(rows.length - 1, x + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(rows[i]); }
          else if (e.key === 'Escape') setQ('');
        }}
        placeholder="Add a habit: type to find one or create it"
        className="h-9 w-full rounded-lg border border-input bg-transparent pr-8 pl-3 text-sm outline-none focus:border-ring"
        role="combobox"
        aria-expanded={focus && rows.length > 0}
        aria-controls="habit-picker-list"
      />
      {q && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); setI(0); ref.current?.focus(); }} aria-label="Clear the search" title="Clear" className="absolute top-2.5 right-2 flex size-4 items-center justify-center rounded-full bg-muted-foreground/25 text-[11px] leading-none text-foreground/70 hover:bg-muted-foreground/45">×</button>
      )}
      {focus && rows.length > 0 && (
        <ul id="habit-picker-list" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
          {rows.map((r, n) => (
            <li key={r.kind === 'link' ? r.h.id : 'new'} role="option" aria-selected={n === i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setI(n)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${n === i ? 'bg-accent text-accent-foreground' : ''}`}
              >
                {r.kind === 'link' ? <><span className="truncate">{r.h.emoji ? `${r.h.emoji} ` : ''}{r.h.name}</span><span className="ml-auto text-xs text-muted-foreground">Link</span></> : <><span className="font-medium">+ Create “{q.trim()}”</span><span className="ml-auto text-xs text-muted-foreground">New habit</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
