'use client';
import { createContext, useContext, useState } from 'react';

/** True inside the full-screen view of a chart: charts grow and their legends shrink. */
export const ZoomContext = createContext(false);
export const useZoomed = () => useContext(ZoomContext);

export type SeriesState = 'normal' | 'focus' | 'hidden';
const NEXT: Record<SeriesState, SeriesState> = { normal: 'focus', focus: 'hidden', hidden: 'normal' };

/**
 * What clicking a legend entry does: the first click highlights it (everything else fades), the second hides it, the
 * third puts it back. Click several to highlight several together; they all stay bright while the rest fade.
 */
export function useLegend(keys: string[]) {
  const [st, setSt] = useState<Record<string, SeriesState>>({});
  const state = (k: string): SeriesState => st[k] ?? 'normal';
  const anyFocus = keys.some((k) => state(k) === 'focus');
  return {
    state,
    cycle: (k: string) => setSt((s) => ({ ...s, [k]: NEXT[s[k] ?? 'normal'] })),
    reset: () => setSt({}),
    hidden: (k: string) => state(k) === 'hidden',
    /** 1 for a highlighted or ordinary series, faded while something else is highlighted */
    opacity: (k: string) => (state(k) === 'focus' || !anyFocus ? 1 : 0.2),
    touched: keys.some((k) => state(k) !== 'normal'),
  };
}
export type Legend = ReturnType<typeof useLegend>;

export const HINT = 'Click to highlight, again to hide, again to show it normally';

/** A row of legend buttons driven by `useLegend`. */
export function LegendBar({ items, legend }: { items: { key: string; label: string; color: string; dashed?: boolean }[]; legend: Legend }) {
  const zoomed = useZoomed();
  return (
    <div className={`no-drag flex flex-wrap items-center justify-center gap-x-1 gap-y-1 ${zoomed ? 'pt-2 text-[10px]' : 'pt-1 text-xs'}`}>
      {items.map((it) => {
        const s = legend.state(it.key);
        return (
          <button key={it.key} type="button" onClick={() => legend.cycle(it.key)} title={HINT} aria-pressed={s === 'focus'}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${s === 'focus' ? 'border-foreground/40 bg-muted font-semibold' : 'border-transparent hover:bg-muted/60'} ${s === 'hidden' ? 'opacity-45' : ''}`}>
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: it.color, height: it.dashed ? 0 : undefined, borderTop: it.dashed ? `2px dashed ${it.color}` : undefined }} />
            <span className={s === 'hidden' ? 'line-through' : ''}>{it.label}</span>
          </button>
        );
      })}
      {legend.touched && <button type="button" onClick={legend.reset} className="rounded-full px-2 py-0.5 text-muted-foreground underline">reset</button>}
    </div>
  );
}
