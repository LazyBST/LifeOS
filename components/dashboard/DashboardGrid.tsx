'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { resetUiStateAction, saveUiStateAction } from '@/app/actions/uistate';
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
  { i: 'books', x: 0, y: 76, w: 6, h: 12, minW: 3, minH: 6 },
  { i: 'journal', x: 6, y: 76, w: 6, h: 12, minW: 3, minH: 5 },
];
const STACK = (items: Item[]): Item[] => items.map((it, n) => ({ ...it, x: 0, w: 1, y: n * 100 }));
const KEY = 'lifeos:dash:layout:v2';

/** Drag the header, resize from the corner. The arrangement is remembered in this browser. */
export function DashboardGrid({ widgets, initial }: { widgets: GridWidget[]; /** layout saved in the database, if any */ initial?: ResponsiveLayouts | null }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layouts, setLayouts] = useState<ResponsiveLayouts>({ lg: DEFAULT_LG, md: DEFAULT_LG, sm: STACK(DEFAULT_LG), xs: STACK(DEFAULT_LG), xxs: STACK(DEFAULT_LG) });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    // the database copy is the source of truth, so every device shows the same layout;
    // a layout only in this browser (from before syncing) is uploaded once
    if (initial) {
      setLayouts((cur) => ({ ...cur, ...initial }));
    } else {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const local = JSON.parse(raw) as ResponsiveLayouts;
          setLayouts((cur) => ({ ...cur, ...local }));
          void saveUiStateAction('dashboard-layout', local);
        }
      } catch {}
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback((_cur: Layout, all: ResponsiveLayouts) => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveUiStateAction('dashboard-layout', all); }, 800);
  }, []);

  function reset() {
    try { localStorage.removeItem(KEY); } catch {}
    void resetUiStateAction('dashboard-layout');
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
          dragConfig={{ enabled: true, handle: '.drag-handle', cancel: '.no-drag' }}
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
