'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Responsive, useContainerWidth, type Layout, type ResponsiveLayouts } from 'react-grid-layout';
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
const stack = (items: Item[]): Item[] => items.map((it, n) => ({ ...it, x: 0, w: 1, y: n * 100 }));

/**
 * A page of draggable, resizable widgets (drag the card header, resize from the corner). The arrangement is saved to
 * the database under `layoutKey`, so it is the same on every device.
 */
export function WidgetGrid({ items, layoutKey, initial }: { items: GridItem[]; layoutKey: string; initial?: ResponsiveLayouts | null }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const defaults = packLayout(items);
  const [layouts, setLayouts] = useState<ResponsiveLayouts>({ lg: defaults, md: defaults, sm: stack(defaults), xs: stack(defaults), xxs: stack(defaults) });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  const lsKey = `lifeos:grid:${layoutKey}`;

  useEffect(() => {
    if (initial) setLayouts((cur) => ({ ...cur, ...initial }));
    else {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) { const local = JSON.parse(raw) as ResponsiveLayouts; setLayouts((cur) => ({ ...cur, ...local })); void saveUiStateAction(layoutKey, local); }
      } catch {}
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback((_c: Layout, all: ResponsiveLayouts) => {
    if (!loaded.current) return;
    try { localStorage.setItem(lsKey, JSON.stringify(all)); } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveUiStateAction(layoutKey, all); }, 800);
  }, [layoutKey, lsKey]);

  return (
    <div ref={containerRef}>
      {mounted && (
        <Responsive
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1100, md: 900, sm: 640, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 1, xs: 1, xxs: 1 }}
          rowHeight={30}
          margin={[16, 16]}
          dragConfig={{ enabled: true, handle: '.drag-handle', cancel: '.no-drag' }}
          onLayoutChange={onChange}
        >
          {items.map((it) => <div key={it.id}>{it.node}</div>)}
        </Responsive>
      )}
    </div>
  );
}
