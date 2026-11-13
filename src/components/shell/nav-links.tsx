'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell, Boxes, Building2, CalendarRange, ChartColumn, CirclePlus, ClipboardList, FileSpreadsheet, Gauge, Gavel, HardHat, IndianRupee, Landmark,
  LayoutDashboard, PackageCheck, RefreshCw, Ruler, Scale, ScrollText, SearchCheck, Settings, ShieldCheck, TriangleAlert,
  UserCog, Users, Wrench, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/format';

const ICONS: Record<string, LucideIcon> = {
  Bell, Boxes, Building2, CalendarRange, ChartColumn, CirclePlus, ClipboardList, FileSpreadsheet, Gauge, Gavel, HardHat, IndianRupee, Landmark,
  LayoutDashboard, PackageCheck, RefreshCw, Ruler, Scale, ScrollText, SearchCheck, Settings, ShieldCheck, TriangleAlert,
  UserCog, Users, Wrench,
};

export function NavLinks({
  items, unread, horizontal = false,
}: { items: Array<{ key: string; href: string; icon: string; label: string }>; unread: number; horizontal?: boolean }) {
  const pathname = usePathname();
  const roots = new Set(['/admin', '/partner', '/customer', '/tech']);
  return (
    <ul className={cn(horizontal ? 'flex gap-1 overflow-x-auto px-2 py-1.5' : 'space-y-0.5')}>
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = roots.has(item.href) ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.key} className={horizontal ? 'shrink-0' : undefined}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              data-nav={item.key}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-sidebar-active font-semibold text-sidebar-strong' : 'text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-strong',
                horizontal && 'whitespace-nowrap',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.key === 'notifications' && unread > 0 && (
                <span className="rounded-full bg-accent-500 px-1.5 text-xs font-semibold text-on-accent">{unread}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
