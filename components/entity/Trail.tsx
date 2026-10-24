import Link from 'next/link';
import { CheckSquare, FolderKanban, Library, Repeat, Target } from 'lucide-react';

export type TrailItem = { label: string; href?: string; kind?: 'area' | 'goal' | 'project' | 'task' | 'habit' | 'book' | 'books'; color?: string };
const ICON = { goal: Target, project: FolderKanban, task: CheckSquare, habit: Repeat, book: Library, books: Library } as const;

/** Where this item sits, as a small line under its title: Area · Goal › Project › parent task. */
export function Trail({ items }: { items: TrailItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Where this belongs" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {items.map((it, i) => {
        const Icon = it.kind && it.kind !== 'area' ? ICON[it.kind] : null;
        const inner = (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5">
            {it.kind === 'area' ? <span className="size-2 rounded-full" style={{ backgroundColor: it.color ?? '#94a3b8' }} /> : Icon ? <Icon className="size-3" aria-hidden /> : null}
            <span className="max-w-48 truncate">{it.label}</span>
          </span>
        );
        return (
          <span key={`${it.label}-${i}`} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-muted-foreground/50">{it.kind === 'area' || items[i - 1].kind === 'area' ? '·' : '›'}</span>}
            {it.href ? <Link href={it.href} className="hover:text-foreground">{inner}</Link> : inner}
          </span>
        );
      })}
    </nav>
  );
}
