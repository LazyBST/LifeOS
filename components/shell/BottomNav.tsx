'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Home, ListTodo, MessageCircle, Wallet, MoreHorizontal, CalendarDays, CheckCircle2, Library, BookOpen, BarChart3, Settings, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'More', icon: MoreHorizontal },
] as const;

/** Everything that does not fit in the bar. */
const MORE = [
  { href: '/money', label: 'Money', icon: Wallet },
  { href: '/habits', label: 'Habits', icon: CheckCircle2 },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/books', label: 'Books', icon: Library },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  const base = href.split('?')[0];
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  function toggleChat() {
    // The chat panel (owned by another worker) listens for this event to
    // open its mobile full-screen tab. Decoupled so this nav never has to
    // know the chat panel's internal state.
    window.dispatchEvent(new CustomEvent('lifeos:toggle-chat'));
  }

  return (
    <>
      {more && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)} />
          <div className="fixed inset-x-3 bottom-16 z-50 grid grid-cols-3 gap-1 rounded-2xl border bg-card p-2 shadow-lg md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <button type="button" onClick={() => { setMore(false); window.dispatchEvent(new CustomEvent('lifeos:pomodoro', { detail: 'show' })); }} className="flex flex-col items-center gap-1 rounded-xl py-3 text-xs text-muted-foreground">
              <Timer className="size-5" />
              Pomodoro
            </button>
            {MORE.map((m) => (
              <Link key={m.href} href={m.href} onClick={() => setMore(false)} className={cn('flex flex-col items-center gap-1 rounded-xl py-3 text-xs', isActive(pathname, m.href) ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                <m.icon className="size-5" />
                {m.label}
              </Link>
            ))}
          </div>
        </>
      )}
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-background md:hidden">
      <Link
        href={ITEMS[0].href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target',
          isActive(pathname, ITEMS[0].href) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Home className="size-5" />
        {ITEMS[0].label}
      </Link>
      <Link
        href={ITEMS[1].href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target',
          isActive(pathname, ITEMS[1].href) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <ListTodo className="size-5" />
        {ITEMS[1].label}
      </Link>
      <Link
        href={ITEMS[2].href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target',
          isActive(pathname, ITEMS[2].href) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <CalendarDays className="size-5" />
        {ITEMS[2].label}
      </Link>
      <button
        type="button"
        onClick={toggleChat}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] text-muted-foreground touch-target"
      >
        <MessageCircle className="size-5" />
        Chat
      </button>
      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target', more || moreActive ? 'text-foreground' : 'text-muted-foreground')}
      >
        <MoreHorizontal className="size-5" />
        More
      </button>
    </nav>
    </>
  );
}

export default BottomNav;
