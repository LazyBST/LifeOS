'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Responsive, useContainerWidth, type Layout, type ResponsiveLayouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export type GridWidget = { id: string; node: ReactNode };

type Item = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };

/** Default arrangement on a 12-column grid (row height 30px). */
export const DEFAULT_LG: Item[] = [
  { i: 'areas', x: 0, y: 0, w: 8, h: 10, minW: 4, minH: 6 },
  { i: 'goals', x: 8, y: 0, w: 4, h: 10, minW: 3, minH: 5 },
  { i: 'habits', x: 0, y: 10, w: 4, h: 12, minW: 3, minH: 6 },
  { i: 'top3', x: 4, y: 10, w: 4, h: 6, minW: 3, minH: 5 },
  { i: 'improve', x: 4, y: 16, w: 4, h: 7, minW: 3, minH: 5 },
  { i: 'money', x: 8, y: 10, w: 4, h: 12, minW: 3, minH: 7 },
  { i: 'projects', x: 0, y: 22, w: 4, h: 9, minW: 3, minH: 4 },
  { i: 'tasks', x: 4, y: 23, w: 8, h: 15, minW: 4, minH: 8 },
  { i: 'life', x: 0, y: 38, w: 12, h: 20, minW: 6, minH: 10 },
  { i: 'calendar', x: 0, y: 58, w: 12, h: 18, minW: 4, minH: 8 },
  { i: 'journal', x: 0, y: 76, w: 4, h: 8, minW: 3, minH: 5 },
];
const STACK = (items: Item[]): Item[] => items.map((it, n) => ({ ...it, x: 0, w: 1, y: n * 100 }));
const KEY = 'lifeos:dash:layout:v1';

/** Drag the header, resize from the corner. The arrangement is remembered in this browser. */
export function DashboardGrid({ widgets }: { widgets: GridWidget[] }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layouts, setLayouts] = useState<ResponsiveLayouts>({ lg: DEFAULT_LG, md: DEFAULT_LG, sm: STACK(DEFAULT_LG), xs: STACK(DEFAULT_LG), xxs: STACK(DEFAULT_LG) });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLayouts((cur) => ({ ...cur, ...(JSON.parse(raw) as ResponsiveLayouts) }));
    } catch {}
  }, []);

  const onChange = useCallback((_cur: Layout, all: ResponsiveLayouts) => {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  }, []);

  function reset() {
    try { localStorage.removeItem(KEY); } catch {}
    setLayouts({ lg: DEFAULT_LG, md: DEFAULT_LG, sm: STACK(DEFAULT_LG), xs: STACK(DEFAULT_LG), xxs: STACK(DEFAULT_LG) });
  }

  return (
    <div ref={containerRef}>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:underline">Reset layout</button>
      </div>
      {mounted && (
        <Responsive
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1100, md: 900, sm: 640, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 1, xs: 1, xxs: 1 }}
          rowHeight={30}
          margin={[16, 16]}
          dragConfig={{ enabled: true, handle: '.drag-handle' }}
          onLayoutChange={onChange}
        >
          {widgets.map((w) => (
            <div key={w.id}>{w.node}</div>
          ))}
        </Responsive>
      )}
    </div>
  );
}
