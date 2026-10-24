'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { unlinkHabitAction } from '@/app/actions/habits';
import type { HabitLinkType } from '@/lib/domain/habits';
import { HabitRow, type HabitRowData } from './HabitRow';

export function LinkedHabitRow({ h, entityType, entityId }: { h: HabitRowData; entityType: HabitLinkType; entityId: string }) {
  const router = useRouter();
  return <HabitRow h={h} onUnlink={async () => { const r = await unlinkHabitAction(h.id, entityType, entityId); if (!r.ok) toast.error(r.error); router.refresh(); }} />;
}
