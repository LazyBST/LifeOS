'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckCircle2,
  Wallet,
  Library,
  ListTodo,
  CalendarDays,
  Timer,
  BookOpen,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

export type NavArea = { id: string; name: string; slug: string; color: string };

const STATIC_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/habits', label: 'Habits', icon: CheckCircle2 },
  { href: '/books', label: 'Books', icon: Library },
  { href: '/money', label: 'Money', icon: Wallet },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active,
  icon,
  dotColor,
  collapsed,
}: {
  href: string;
  collapsed: boolean;
  label: string;
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  dotColor?: string;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-lg py-2 text-sm font-medium transition-colors touch-target',
        collapsed ? 'justify-center px-0' : 'gap-3 px-3',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5',
      )}
    >
      {Icon ? (
        <Icon className="size-4 shrink-0" />
      ) : (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

const COLLAPSED_KEY = 'lifeos:sidebar:collapsed';

export function Sidebar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // set when the chat (not the user) folded the sidebar, so closing the chat can put it back
  const foldedByChat = useRef(false);
  const before = useRef(false);

  useEffect(() => {
    let manual = false;
    try { manual = localStorage.getItem(COLLAPSED_KEY) === '1'; } catch {}
    before.current = manual;
    const chatOpen = (window as unknown as { __lifeosChatOpen?: boolean }).__lifeosChatOpen === true;
    if (chatOpen) foldedByChat.current = true;
    setCollapsed(manual || chatOpen);
    function onChat(e: Event) {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open;
      if (open) {
        if (!foldedByChat.current) before.current = collapsedRef.current;
        foldedByChat.current = true;
        setCollapsed(true);
      } else if (foldedByChat.current) {
        foldedByChat.current = false;
        setCollapsed(before.current);
      }
    }
    window.addEventListener('lifeos:chat:state', onChat);
    return () => window.removeEventListener('lifeos:chat:state', onChat);
  }, []);

  const collapsedRef = useRef(collapsed);
  useEffect(() => { collapsedRef.current = collapsed; }, [collapsed]);

  const toggle = useCallback(() => {
    const next = !collapsedRef.current;
    foldedByChat.current = false; // the user decided: closing the chat no longer changes it
    before.current = next;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
  }, []);

  return (
    <aside
      className={cn(
        'hidden md:flex md:flex-col md:border-r md:bg-sidebar md:shrink-0 md:transition-[width] md:duration-200',
        collapsed ? 'md:w-14' : 'md:w-60',
      )}
    >
      <div className={cn('flex shrink-0 border-b', collapsed ? 'flex-col items-center gap-1 px-1 py-2' : 'h-14 items-center justify-between pr-2 pl-4')}>
        <div className="text-lg font-semibold">
          {collapsed ? <span aria-label="LifeOS" className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">L</span> : 'LifeOS'}
        </div>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5')}>
          <ThemeToggle />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2">
        {STATIC_LINKS.slice(0, 1).map((link) => (
          <NavLink key={link.href} {...link} collapsed={collapsed} active={isActive(pathname, link.href)} />
        ))}

        {collapsed ? <div className="mx-2 my-2 border-t" /> : (
          <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-muted-foreground">Areas</div>
        )}
        {areas.map((area) => (
          <NavLink
            key={area.id}
            href={`/area/${area.slug}`}
            label={area.name}
            dotColor={area.color}
            collapsed={collapsed}
            active={isActive(pathname, `/area/${area.slug}`)}
          />
        ))}

        <div className={collapsed ? 'mx-2 my-2 border-t' : 'pt-4'} />
        {STATIC_LINKS.slice(1).map((link) => (
          <NavLink key={link.href} {...link} collapsed={collapsed} active={isActive(pathname, link.href)} />
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('lifeos:pomodoro', { detail: 'show' }))}
          title={collapsed ? 'Pomodoro' : undefined}
          aria-label="Show the Pomodoro timer"
          className={cn('flex w-full items-center rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground touch-target dark:hover:bg-white/5', collapsed ? 'justify-center px-0' : 'gap-3 px-3')}
        >
          <Timer className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">Pomodoro</span>}
        </button>
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
          active={isActive(pathname, '/settings')}
        />
      </nav>
    </aside>
  );
}

export default Sidebar;
