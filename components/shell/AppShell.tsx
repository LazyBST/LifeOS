import { listAreas, areaSlug, areaColor } from '@/lib/domain/areas';
import { Sidebar, type NavArea } from '@/components/shell/Sidebar';
import { BottomNav } from '@/components/shell/BottomNav';
import { ChatPanel } from '@/components/chat/ChatPanel';

/**
 * Server component: desktop sidebar + mobile bottom nav + page content +
 * chat panel. Fetches the Areas once here so both nav variants share the
 * same list.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const areas = await listAreas();
  const navAreas: NavArea[] = areas.map((area) => ({
    id: area.id,
    name: area.name,
    slug: areaSlug(area.name),
    color: areaColor(area),
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar areas={navAreas} />
      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
      </div>
      <ChatPanel />
    </div>
  );
}

export default AppShell;
