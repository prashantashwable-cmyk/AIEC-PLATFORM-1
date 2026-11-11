import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { getT } from '@/i18n/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { portalsFor, type Ctx, type Portal } from '@/server/ctx';
import { unreadCount } from '@/server/services/notifications';
import { navFor } from './nav';
import { NavLinks } from './nav-links';
import { LogoutButton } from './logout-button';

export async function AppShell({ portal, ctx, children }: { portal: Portal; ctx: Ctx; children: ReactNode }) {
  const { t } = await getT();
  const unread = await unreadCount(ctx);
  const items = navFor(portal, ctx).map((item) => ({ ...item, label: t(`nav.${item.key}`) }));
  const portals = portalsFor(ctx);
  const subtitle = portal === 'partner' || portal === 'tech' ? ctx.companyName : t(`portal.${portal}`);
  const roleLabel = (portal === 'admin' ? ctx.roles.filter((r) => !['CUSTOMER'].includes(r) && !ctx.companyRoles.includes(r)) : portal === 'customer' ? ['CUSTOMER' as const] : ctx.companyRoles)
    .map((r) => t(`e.role.${r}`)).join(', ');

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-950 lg:flex">
        <div className="px-4 py-4">
          <Link href={`/${portal}`}><Logo dark tagline={t(`portal.${portal}`)} /></Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label={t('common.menu')}>
          <NavLinks items={items} unread={unread} />
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href={`/${portal}`} className="lg:hidden"><Logo /></Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900" data-testid="user-name">{ctx.name}</p>
                <p className="truncate text-xs text-slate-500">{[subtitle, roleLabel].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden md:block"><LanguageSwitcher /></div>
              {portals.length > 1 && (
                <Link href="/app?choose=1" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <ArrowLeftRight className="size-3.5" aria-hidden /> <span className="hidden sm:inline">{t('auth.switchPortal')}</span>
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
          <div className="border-t border-slate-100 px-4 py-1.5 md:hidden"><LanguageSwitcher /></div>
          <nav className="bg-brand-950 lg:hidden" aria-label={t('common.menu')}>
            <NavLinks items={items} unread={unread} horizontal />
          </nav>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
