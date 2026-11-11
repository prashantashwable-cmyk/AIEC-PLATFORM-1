import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, HardHat, LayoutDashboard, UserRound } from 'lucide-react';
import { getT } from '@/i18n/server';
import { Logo } from '@/components/logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LogoutButton } from '@/components/shell/logout-button';
import { Card } from '@/components/ui';
import { PORTAL_HOME, requireUser } from '@/server/auth';
import { portalsFor } from '@/server/ctx';

const ICONS = { admin: LayoutDashboard, partner: Building2, tech: HardHat, customer: UserRound };

/** Post sign-in landing: goes straight to the user's workspace, or offers a choice when there are several. */
export default async function AppHome({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const ctx = await requireUser();
  const { t } = await getT();
  const portals = portalsFor(ctx);
  const { choose } = await searchParams;
  if (portals.length === 1 && !choose) redirect(PORTAL_HOME[portals[0]]);

  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Logo tagline={t('common.brandFull')} />
        <div className="flex items-center gap-2"><LanguageSwitcher /><LogoutButton /></div>
      </div>
      <h1 className="mt-8 text-xl font-semibold">{t('auth.choosePortal')}</h1>
      <p className="mt-1 text-sm text-slate-600">{portals.length ? t('auth.choosePortalBody') : t('common.forbiddenBody')}</p>
      <div className="mt-5 grid gap-3">
        {portals.map((portal) => {
          const Icon = ICONS[portal];
          return (
            <Link key={portal} href={PORTAL_HOME[portal]} data-testid={`portal-${portal}`}>
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
                <span className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-6" aria-hidden /></span>
                <span>
                  <span className="block font-semibold text-slate-900">{t(`portal.${portal}`)}</span>
                  <span className="block text-sm text-slate-600">{t(`portal.${portal}Hint`)}</span>
                </span>
              </Card>
            </Link>
          );
        })}
        <Link href="/partner/onboarding" className="text-sm font-medium text-brand-700 hover:underline">{t('portal.registerPartner')}</Link>
      </div>
    </main>
  );
}
