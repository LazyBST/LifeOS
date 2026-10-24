import type { ReactNode } from 'react';
import { WidgetCard } from './WidgetCard';

/**
 * Runs an async server widget and, if it throws, renders the message inside the card instead of
 * taking the whole page down. Production hides Server Component error text, so catching here is
 * what keeps the real reason (a missing migration, a bad query) visible.
 */
export function safe(title: string, fn: () => Promise<ReactNode>) {
  return async function SafeWidget() {
    try {
      return await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[dashboard] ${title} failed:`, message);
      return (
        <WidgetCard title={title} sub="Could not load">
          <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
          <p className="mt-2 text-xs text-muted-foreground">If this mentions a missing column or table, run the newest migrations in supabase/migrations.</p>
        </WidgetCard>
      );
    }
  };
}
