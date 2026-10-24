import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { PageContextProvider } from '@/components/chat/page-context';
import { AppShell } from '@/components/shell/AppShell';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <PageContextProvider>
      <AppShell>{children}</AppShell>
    </PageContextProvider>
  );
}
