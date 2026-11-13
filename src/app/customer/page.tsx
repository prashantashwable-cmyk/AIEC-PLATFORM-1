import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getCustomerHome } from '@/server/services/customer';

export default async function CustomerHome() {
  const { ctx, t, locale } = await pageCtx('customer');
  const { leads } = await load(() => getCustomerHome(ctx));
  return (
    <>
      <PageHeader title={t('nav.myProjects')} subtitle={t('p.customerHome.subtitle')}
        actions={<LinkButton href="/customer/new" size="sm"><Plus className="size-4" aria-hidden />{t('nav.newRequirement')}</LinkButton>} />
      {leads.length === 0 ? (
        <Card><EmptyState title={t('p.customerHome.empty')} hint={t('p.customerHome.emptyHint')} action={<LinkButton href="/customer/new">{t('nav.newRequirement')}</LinkButton>} /></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">{leads.map((l) => (
          <li key={l.id}>
            <Link href={`/customer/projects/${l.id}`} className="block">
              <Card className="h-full p-5 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{l.project_name}</p>
                  <StatusBadge value={l.status} label={t(`e.leadStatus.${l.status}`)} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{t(`e.liftCategory.${l.lift_category}`)} · {t(`zone.${l.zone_code}`)}</p>
                <p className="mt-3 text-xs text-slate-500">{l.lead_number} · {formatDate(l.created_at, locale)}</p>
                {Number(l.quotations) > 0 && <p className="mt-2 text-sm font-medium text-brand-700">{t('p.customerHome.quotationsReady', { count: l.quotations })}</p>}
                {l.project_status && <p className="mt-2 text-sm">{t('f.projectStatus')}: <StatusBadge value={l.project_status} label={t(`e.projectStatus.${l.project_status}`)} /></p>}
              </Card>
            </Link>
          </li>
        ))}</ul>
      )}
    </>
  );
}
