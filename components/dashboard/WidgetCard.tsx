import type { ReactNode } from 'react';
import { WidgetFrame } from './WidgetFrame';
import { ZoomableCard } from './ZoomableCard';

/** Card chrome for a dashboard widget. `expandable` adds a button that opens the chart full screen. */
export function WidgetCard({ expandable, ...props }: {
  title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; bodyClassName?: string; expandable?: boolean;
}) {
  return expandable ? <ZoomableCard {...props} /> : <WidgetFrame {...props} />;
}
