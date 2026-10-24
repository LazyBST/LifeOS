import { getPriorities } from '@/lib/domain/priorities';
import { latestImprovement } from '@/lib/domain/improvement';
import { istDate } from '@/lib/time';
import { admin } from '@/lib/supabase/admin';
import { WidgetCard } from './WidgetCard';
import { TopThree } from './TopThree';
import { ImprovementPanel } from './ImprovementPanel';

export async function PrioritiesWidget() {
  const p = await getPriorities().catch(() => [null, null, null]);
  return (
    <WidgetCard title="Today’s top 3" sub="What must happen today">
      <TopThree initial={p} />
    </WidgetCard>
  );
}

export async function ImprovementWidget() {
  const today = istDate();
  const [last, mine] = await Promise.all([
    latestImprovement(today).catch(() => null),
    Promise.resolve(admin().from('journal_entries').select('improvement').eq('entry_date', today).maybeSingle()).then((r) => (r.data?.improvement as string | null) ?? '').catch(() => ''),
  ]);
  return (
    <WidgetCard title="Last night’s improvement" sub="From your journal — follow up on it">
      <ImprovementPanel last={last} tonight={mine} />
    </WidgetCard>
  );
}
