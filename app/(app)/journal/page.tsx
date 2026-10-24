import { listAllJournal } from '@/lib/domain/journal';
import { istDate } from '@/lib/time';
import { SetPageContext } from '@/components/chat/page-context';
import { JournalWorkspace } from '@/components/journal/JournalWorkspace';

export default async function JournalPage() {
  const entries = await listAllJournal();
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <SetPageContext ctx={{ route: '/journal', entity_type: 'none' }} />
      <h1 className="text-xl font-semibold">Journal</h1>
      <JournalWorkspace entries={entries} today={istDate()} />
    </div>
  );
}
