'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckCircle2,
  Wallet,
  BarChart3,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

export type NavArea = { id: string; name: string; slug: string; color: string };

const STATIC_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/habits', label: 'Habits', icon: CheckCircle2 },
  { href: '/money', label: 'Money', icon: Wallet },
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
}: {
  href: string;
  label: string;
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  dotColor?: string;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors touch-target',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
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
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-background md:shrink-0">
      <div className="flex h-14 items-center px-4 text-lg font-semibold">LifeOS</div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {STATIC_LINKS.slice(0, 1).map((link) => (
          <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
        ))}

        <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-muted-foreground">
          Areas
        </div>
        {areas.map((area) => (
          <NavLink
            key={area.id}
            href={`/area/${area.slug}`}
            label={area.name}
            dotColor={area.color}
            active={isActive(pathname, `/area/${area.slug}`)}
          />
        ))}

        <div className="pt-4" />
        {STATIC_LINKS.slice(1).map((link) => (
          <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
        ))}
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          active={isActive(pathname, '/settings')}
        />
      </nav>
      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export default Sidebar;
