'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Responsive, useContainerWidth, type Layout } from 'react-grid-layout';
import { saveUiStateAction } from '@/app/actions/uistate';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export type GridItem = { id: string; node: ReactNode; w: number; h: number; minW?: number; minH?: number };
type Item = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

/** Lay items out left to right on a 12-column grid, wrapping to a new row when one does not fit. */
export function packLayout(items: Pick<GridItem, 'id' | 'w' | 'h' | 'minW' | 'minH'>[], cols = 12): Item[] {
  const out: Item[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    const w = Math.min(it.w, cols);
    if (x + w > cols) { x = 0; y += rowH; rowH = 0; }
    out.push({ i: it.id, x, y, w, h: it.h, minW: it.minW, minH: it.minH });
    x += w; rowH = Math.max(rowH, it.h);
  }
  return out;
}

/** Four screen sizes, each with its own saved arrangement. */
export const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type Size = (typeof SIZES)[number];
const BREAKPOINTS: Record<Size, number> = { xl: 1536, lg: 1100, md: 768, sm: 0 };
const COLS: Record<Size, number> = { xl: 12, lg: 12, md: 8, sm: 1 };
export const sizeFor = (width: number): Size => (width >= 1536 ? 'xl' : width >= 1100 ? 'lg' : width >= 768 ? 'md' : 'sm');

type SizedLayouts = Record<Size, Item[]>;

/** Medium screens have 8 columns: keep reading order, scale widths down. */
function mediumFrom(lg: Item[]): Item[] {
  const ordered = [...lg].sort((a, b) => a.y - b.y || a.x - b.x);
  return packLayout(ordered.map((it) => ({ id: it.i, w: Math.min(8, Math.max(it.minW ? Math.min(it.minW, 8) : 3, Math.round((it.w * 8) / 12))), h: it.h, minW: it.minW && Math.min(it.minW, 8), minH: it.minH })), 8);
}
/** Small screens: one column, in reading order. */
function smallFrom(lg: Item[]): Item[] {
  return [...lg].sort((a, b) => a.y - b.y || a.x - b.x).reduce<Item[]>((acc, it) => {
    const y = acc.length ? acc[acc.length - 1].y + acc[acc.length - 1].h : 0;
    acc.push({ i: it.i, x: 0, y, w: 1, h: it.h, minH: it.minH });
    return acc;
  }, []);
}

export function defaultsFrom(lg: Item[]): SizedLayouts {
  return { sm: smallFrom(lg), md: mediumFrom(lg), lg, xl: lg };
}

/**
 * A saved arrangement is used for the widgets that still exist and fit that size's columns. A widget that was added
 * since (or does not fit) takes its default place below the rest, so adding or archiving one never resets the layout.
 */
function fit(saved: unknown, fallback: Item[], cols: number, ids: string[]): Item[] {
  const want = new Set(ids);
  const kept: Item[] = [];
  if (Array.isArray(saved)) {
    for (const l of saved as Item[]) {
      if (l && want.has(l.i) && Number.isFinite(l.x) && Number.isFinite(l.y) && l.w >= 1 && l.h >= 1 && l.x + l.w <= cols) { kept.push(l); want.delete(l.i); }
    }
  }
  if (kept.length === 0) return fallback;
  let y = Math.max(0, ...kept.map((l) => l.y + l.h));
  const missing = fallback.filter((l) => want.has(l.i));
  for (const l of missing) { kept.push({ ...l, x: 0, y }); y += l.h; }
  return kept;
}

export function merge(defaults: SizedLayouts, saved: unknown, ids: string[]): SizedLayouts {
  const out = { ...defaults };
  const src = (saved ?? {}) as Partial<Record<Size, unknown>>;
  for (const size of SIZES) {
    const candidate = src[size] ?? (size === 'xl' ? src.lg : undefined);
    if (candidate !== undefined) out[size] = fit(candidate, defaults[size], COLS[size], ids);
  }
  return out;
}

/**
 * A page of draggable, resizable widgets (drag the card header, resize from the corner). There is a separate
 * arrangement for small, medium, large and extra-large screens, saved to the database under `layoutKey`
 * (only when you drag or resize), so each device keeps the layout you gave its size.
 */
export function WidgetGrid({ items, layoutKey, initial, lgLayout }: { items: GridItem[]; layoutKey: string; initial?: unknown; /** explicit large-screen positions; otherwise items are packed in order */ lgLayout?: Item[] }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const ids = items.map((i) => i.id);
  const [layouts, setLayouts] = useState<SizedLayouts>(() => merge(defaultsFrom(lgLayout ?? packLayout(items)), initial, ids));
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lsKey = `lifeos:grid:${layoutKey}`;
  const size = sizeFor(width);

  // On a touch screen the widgets stay put (so the page scrolls freely) until you press and hold a widget's title:
  // that opens arrange mode, where titles drag and the corner resizes, until you tap Done.
  const [coarse, setCoarse] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    const f = () => setCoarse(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  useEffect(() => {
    const el = wrap.current;
    if (!el || !coarse || editing) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let x0 = 0, y0 = 0;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const start = (e: TouchEvent) => {
      if (!(e.target as HTMLElement).closest('.drag-handle')) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      timer = setTimeout(() => { try { navigator.vibrate?.(20); } catch { /* not supported */ } setEditing(true); }, 450);
    };
    const move = (e: TouchEvent) => { if (timer && Math.hypot(e.touches[0].clientX - x0, e.touches[0].clientY - y0) > 8) clear(); };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', clear);
    el.addEventListener('touchcancel', clear);
    return () => { clear(); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', clear); el.removeEventListener('touchcancel', clear); };
  }, [coarse, editing, mounted]);
  const locked = coarse && !editing;

  // no entrance animation: widgets appear where they belong instead of sliding into place
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => setReady(true), 150);
    return () => clearTimeout(t);
  }, [mounted]);

  useEffect(() => {
    if (initial) return;
    try { // a layout only in this browser (from before syncing) is uploaded once
      const raw = localStorage.getItem(lsKey);
      if (raw) { const local = JSON.parse(raw); setLayouts((cur) => merge(cur, local, ids)); void saveUiStateAction(layoutKey, local); localStorage.removeItem(lsKey); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(layout: Layout) {
    const next = { ...layouts, [size]: layout.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH })) } as SizedLayouts;
    if (size === 'lg') next.xl = layouts.xl === layouts.lg ? next.lg : layouts.xl; // xl follows lg until it is arranged on its own
    setLayouts(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveUiStateAction(layoutKey, next); }, 600);
  }

  return (
    <div ref={(n) => { containerRef.current = n; wrap.current = n; }} className={`${ready ? '' : '[&_.react-grid-item]:!transition-none'} ${editing ? 'lifeos-editing' : ''}`}>
      {coarse && (editing ? (
        <div className="sticky top-0 z-30 mb-3 flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm shadow">
          <span>Arranging: drag a title to move, pull the corner to resize.</span>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Done</button>
        </div>
      ) : <p className="mb-2 text-center text-[11px] text-muted-foreground">Press and hold a widget title to rearrange</p>)}
      {mounted && (
        <Responsive
          width={width}
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={30}
          margin={[16, 16]}
          dragConfig={{ enabled: !locked, handle: '.drag-handle', cancel: '.no-drag' }}
          resizeConfig={{ enabled: !locked, handles: ['se'] }}
          onDragStop={(l) => persist(l)}
          onResizeStop={(l) => persist(l)}
        >
          {items.map((it) => <div key={it.id}>{it.node}</div>)}
        </Responsive>
      )}
    </div>
  );
}
