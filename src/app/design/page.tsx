import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/site/landing-sections';
import { Badge, Card, Stat, StatusBadge, Table, Td, Th, buttonClass } from '@/components/ui';
import { getT } from '@/i18n/server';
import { isSandbox } from '@/lib/config';
import { DEFAULT_THEME, THEMES, THEME_COOKIE, isTheme } from '@/lib/themes';
import { ThemeButton } from './theme-button';

/** Design options gallery (sandbox only): the same hero and dashboard sample in every theme. */
export default async function DesignPage({ searchParams }: { searchParams: Promise<{ only?: string }> }) {
  if (!isSandbox()) notFound();
  const { t, locale } = await getT();
  const { only } = await searchParams;
  const cookie = (await cookies()).get(THEME_COOKIE)?.value;
  const active = isTheme(cookie) ? cookie : DEFAULT_THEME;
  const list = THEMES.filter((theme) => !only || theme.id === only);
  return (
    <main id="main" className="mx-auto max-w-[1400px] space-y-10 px-4 py-8">
      {list.map((theme, i) => (
        <section key={theme.id} data-theme={theme.id} data-testid={`option-${theme.id}`} className="overflow-hidden rounded-3xl border border-slate-200 text-slate-900 shadow-lg" style={{ background: 'var(--page-bg)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-surface px-5 py-3">
            <p className="text-lg font-extrabold">{THEMES.indexOf(theme) + 1}. {theme.name}{theme.id === DEFAULT_THEME ? <Badge tone="blue" className="ml-2">default</Badge> : null}</p>
            <ThemeButton id={theme.id} label={theme.id === active ? 'In use' : 'Preview whole site'} active={theme.id === active} />
          </div>
          <Hero t={t} locale={locale} compact />
          <div className="grid gap-4 p-5 lg:grid-cols-[14rem_1fr]">
            <div className="rounded-xl border border-slate-200 bg-sidebar p-3 text-sm text-sidebar-fg">
              {['dashboard', 'leads', 'partners', 'quotations', 'projects', 'commissions'].map((k, n) => (
                <p key={k} className={`rounded-lg px-3 py-2 ${n === 1 ? 'bg-sidebar-active font-semibold text-sidebar-strong' : ''}`}>{t(`nav.${k}`)}</p>
              ))}
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label={t('e.leadStatus.NEW')} value="12" tone="blue" />
                <Stat label={t('e.leadStatus.QUALIFIED')} value="7" tone="green" />
                <Stat label={t('e.projectStatus.ON_HOLD')} value="1" tone="amber" />
                <Stat label={t('e.projectStatus.STOP_WORK')} value="0" tone="red" />
              </div>
              <Card className="p-4">
                <Table>
                  <thead><tr><Th>{t('nav.leads')}</Th><Th>{t('enquiry.zone')}</Th><Th>{t('common.status')}</Th><Th>{t('common.actions')}</Th></tr></thead>
                  <tbody>
                    {(['NEW', 'CUSTOMER_REVIEW', 'CONFIRMED', 'ON_HOLD'] as const).map((s, n) => (
                      <tr key={s}><Td className="font-medium text-brand-700">LD-2026-0000{n + 1}</Td><Td>{t(`zone.${['WAKAD', 'BANER', 'PUNE', 'PCMC'][n]}`)}</Td>
                        <Td><StatusBadge value={s} label={t(`e.leadStatus.${s}`)} /></Td>
                        <Td><span className={buttonClass(n === 0 ? 'primary' : 'secondary', 'sm')}>{t('common.open')}</span></Td></tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </div>
          </div>
          <span className="sr-only">{i}</span>
        </section>
      ))}
    </main>
  );
}
