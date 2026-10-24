import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { PageContextProvider } from '@/components/chat/page-context';
import { StatusProvider } from '@/components/status/StatusProvider';
import { listStatuses } from '@/lib/domain/statuses';
import { AppShell } from '@/components/shell/AppShell';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const statuses = await listStatuses();
  return (
    <StatusProvider statuses={statuses}>
      <PageContextProvider>
        <AppShell>{children}</AppShell>
      </PageContextProvider>
    </StatusProvider>
  );
}
