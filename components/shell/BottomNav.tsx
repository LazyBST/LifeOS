'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListTodo, MessageCircle, Wallet, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/?preset=today', label: 'Tasks', icon: ListTodo },
  { href: '/money', label: 'Money', icon: Wallet },
  { href: '/settings', label: 'More', icon: MoreHorizontal },
] as const;

function isActive(pathname: string, href: string): boolean {
  const base = href.split('?')[0];
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  function toggleChat() {
    // The chat panel (owned by another worker) listens for this event to
    // open its mobile full-screen tab. Decoupled so this nav never has to
    // know the chat panel's internal state.
    window.dispatchEvent(new CustomEvent('lifeos:toggle-chat'));
  }

  return (
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
      <button
        type="button"
        onClick={toggleChat}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] text-muted-foreground touch-target"
      >
        <MessageCircle className="size-5" />
        Chat
      </button>
      <Link
        href={ITEMS[2].href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target',
          isActive(pathname, ITEMS[2].href) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Wallet className="size-5" />
        {ITEMS[2].label}
      </Link>
      <Link
        href={ITEMS[3].href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] touch-target',
          isActive(pathname, ITEMS[3].href) ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <MoreHorizontal className="size-5" />
        {ITEMS[3].label}
      </Link>
    </nav>
  );
}

export default BottomNav;
