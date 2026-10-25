'use client';
import type { ReactNode } from 'react';
import { WidgetGrid, type GridItem } from '@/components/widgets/WidgetGrid';
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

/** The home page: the shared widget grid with its large-screen arrangement above; other sizes derive from it. */
export function DashboardGrid({ widgets, initial }: { widgets: GridWidget[]; /** layout saved in the database, if any */ initial?: unknown }) {
  const items: GridItem[] = widgets.map((w) => {
    const l = DEFAULT_LG.find((d) => d.i === w.id);
    return { id: w.id, node: w.node, w: l?.w ?? 4, h: l?.h ?? 8, minW: l?.minW, minH: l?.minH };
  });
  return <WidgetGrid items={items} layoutKey="dashboard-layout" initial={initial} lgLayout={DEFAULT_LG.filter((l) => widgets.some((w) => w.id === l.i))} />;
}
