import { listAreas, areaSlug, areaColor } from '@/lib/domain/areas';
import { Sidebar, type NavArea } from '@/components/shell/Sidebar';
import { BottomNav } from '@/components/shell/BottomNav';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PomodoroRoot } from '@/components/pomodoro/PomodoroRoot';

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
    <div className="flex min-h-dvh">
      <Sidebar areas={navAreas} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
      </div>
      <ChatPanel />
      <PomodoroRoot />
    </div>
  );
}

export default AppShell;
