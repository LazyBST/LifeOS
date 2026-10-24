'use client';

import Link from 'next/link';
import {
  CheckSquare,
  Target,
  FolderKanban,
  Repeat,
  BookOpen,
  Wallet,
  FileBarChart,
  Info,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ToolResultCard as ToolResultCardType } from '@/lib/types/db';

const ICON_BY_KIND: Record<ToolResultCardType['kind'], LucideIcon> = {
  task: CheckSquare,
  goal: Target,
  project: FolderKanban,
  habit: Repeat,
  journal: BookOpen,
  money: Wallet,
  report: FileBarChart,
  info: Info,
  error: AlertTriangle,
};

export function ToolResultCard({ card }: { card: ToolResultCardType }) {
  const Icon = ICON_BY_KIND[card.kind] ?? Info;
  const isError = card.kind === 'error';

  const body = (
    <div
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isError
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-card hover:bg-muted/60',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', isError ? 'text-destructive' : 'text-muted-foreground')} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-snug font-medium text-foreground break-words">{card.title}</p>
        {card.subtitle ? (
          <p className="text-xs leading-snug text-muted-foreground break-words">{card.subtitle}</p>
        ) : null}
        {card.badges && card.badges.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {card.badges.map((b, i) => (
              <Badge key={`${b}-${i}`} variant="secondary" className="text-[10px]">
                {b}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (card.href) {
    return (
      <Link href={card.href} className="block">
        {body}
      </Link>
    );
  }

  return body;
}

export default ToolResultCard;
