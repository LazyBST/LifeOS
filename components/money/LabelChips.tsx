'use client';
import { useState } from 'react';
import type { TxLabel } from '@/lib/types/db';

/** The colour a label name gets: its own colour from the list, grey if it is no longer there. */
export function labelColor(labels: TxLabel[], name: string): string {
  return labels.find((l) => l.name === name)?.color ?? '#64748b';
}

export function Chip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: `${color}66`, background: `${color}1f`, color }}>
      {name}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="-mr-0.5 leading-none opacity-70 hover:opacity-100">×</button>}
    </span>
  );
}

/**
 * Pick any number of labels. `value` is a list of label names; each tap adds or removes one.
 * `inline` shows every label as a toggle chip (forms); otherwise the chips open a small menu (table cells).
 */
export function LabelPicker({ labels, value, onChange, inline, disabled }: { labels: TxLabel[]; value: string[]; onChange: (next: string[]) => void; inline?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  if (labels.length === 0 && !value.length) return inline ? <p className="text-xs text-muted-foreground">No labels yet. Add some under “Categories &amp; labels”.</p> : <span className="text-muted-foreground">—</span>;

  if (inline) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => {
          const on = value.includes(l.name);
          return (
            <button key={l.id} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(l.name)}
              className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={on ? { borderColor: l.color, background: `${l.color}26`, color: l.color } : undefined}>
              {l.name}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <span className="relative inline-block max-w-full">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Edit labels" title="Click to edit labels"
        className="-mx-1 flex max-w-full cursor-pointer flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/80 disabled:opacity-50">
        {value.length ? value.map((n) => <Chip key={n} name={n} color={labelColor(labels, n)} />) : <span className="text-muted-foreground">+ label</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 z-40 mt-1 min-w-40 space-y-0.5 rounded-xl border bg-card p-1.5 shadow-xl">
            {labels.map((l) => {
              const on = value.includes(l.name);
              return (
                <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(l.name)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="flex size-4 items-center justify-center rounded border text-[10px]" style={on ? { background: l.color, borderColor: l.color, color: '#fff' } : undefined}>{on ? '✓' : ''}</span>
                  <span style={{ color: l.color }}>{l.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
