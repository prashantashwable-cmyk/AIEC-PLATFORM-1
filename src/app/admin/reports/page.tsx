import { Alert, PageHeader, Section, Stat, Table, Td, Th } from '@/components/ui';
import { commissionFor } from '@/lib/commission';
import { LEAD_STATUS } from '@/lib/enums';
import { formatINR } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getReports } from '@/server/services/admin';

export default async function ReportsPage() {
  const { ctx, t, locale } = await pageCtx('admin');
  const r = await load(() => getReports(ctx));
  const counts = new Map(r.funnel.map((f) => [f.status as string, Number(f.n)]));
  const max = Math.max(1, ...counts.values());
  const targets: Array<[string, number, string]> = [
    ['partnersScreened', r.targets.partners_screened, '10'], ['partnersActive', r.targets.partners_active, '5–10'], ['leads', r.targets.leads, '50'],
    ['qualified', r.targets.qualified, '30'], ['surveys', r.targets.surveys, '15'], ['quotations', r.targets.quotations, '10–20'], ['orders', r.targets.orders, '5–8'],
    ['activeProjects', r.targets.active_projects, `≤ ${r.max}`], ['lendersApproached', r.targets.lenders_approached, '3'], ['lendersSigned', r.targets.lenders_signed, '1'],
  ];
  const m = r.money;
  const avgCommission = m && Number(m.orders) > 0 ? commissionFor((Number(m.eligible_value) / Number(m.orders)).toFixed(2), m.rate) : null;
  const breakEven = avgCommission && Number(avgCommission) > 0 ? Math.ceil(Number(r.fixedCost) / Number(avgCommission)) : null;
  return (
    <>
      <PageHeader title={t('nav.reports')} subtitle={t('p.reports.subtitle')} />
      {m && (
        <>
          <Alert tone="blue" className="mb-4">{t('p.reports.revenueNote')}</Alert>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('f.grossOrderValue')} value={formatINR(m.gross_order_value, locale)} hint={t('p.dashboard.notAiecRevenue')} />
            <Stat label={t('f.eligibleValue')} value={formatINR(m.eligible_value, locale)} />
            <Stat label={t('p.dashboard.verifiedCollections')} value={formatINR(m.collections, locale)} hint={`${t('f.refunded')}: ${formatINR(m.refunds, locale)}`} />
            <Stat label={t('f.commissionEarned')} value={formatINR(m.earned, locale)} tone="blue" />
            <Stat label={t('f.invoiced')} value={formatINR(m.invoiced, locale)} />
            <Stat label={t('f.commissionPaid')} value={formatINR(m.collected, locale)} tone="green" />
            <Stat label={t('f.overdue')} value={formatINR(m.overdue, locale)} tone={Number(m.overdue) > 0 ? 'red' : 'gray'} />
            <Stat label={t('p.reports.breakEven')} value={breakEven ?? '—'} hint={t('p.reports.breakEvenHint', { cost: formatINR(r.fixedCost, locale), avg: avgCommission ? formatINR(avgCommission, locale) : '—' })} />
          </div>
        </>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t('p.reports.funnel')}>
          <ul className="space-y-1.5">{LEAD_STATUS.map((s) => (
            <li key={s} className="grid grid-cols-[11rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate text-slate-700">{t(`e.leadStatus.${s}`)}</span>
              <span className="h-2.5 rounded-full bg-slate-100"><span className="block h-2.5 rounded-full bg-brand-500" style={{ width: `${((counts.get(s) ?? 0) / max) * 100}%` }} /></span>
              <span className="text-right font-medium">{counts.get(s) ?? 0}</span>
            </li>
          ))}</ul>
        </Section>
        <Section title={t('p.reports.targets')} description={t('p.reports.targetsNote')}>
          <Table className="min-w-0"><thead><tr><Th>{t('f.kpi')}</Th><Th>{t('f.actual')}</Th><Th>{t('f.target')}</Th></tr></thead>
            <tbody>{targets.map(([key, actual, target]) => <tr key={key}><Td>{t(`p.reports.kpi.${key}`)}</Td><Td className="font-semibold">{actual}</Td><Td>{target}</Td></tr>)}</tbody></Table>
        </Section>
        <Section title={t('p.reports.bySource')}>
          <Table className="min-w-0"><thead><tr><Th>{t('f.source')}</Th><Th>{t('nav.leads')}</Th><Th>{t('e.leadStatus.CONFIRMED')}</Th></tr></thead>
            <tbody>{r.sources.map((s) => <tr key={s.source}><Td>{t(`e.leadSource.${s.source}`)}</Td><Td>{s.n}</Td><Td>{s.won}</Td></tr>)}</tbody></Table>
        </Section>
        <Section title={t('p.reports.byZone')}>
          <Table className="min-w-0"><thead><tr><Th>{t('f.zone')}</Th><Th>{t('nav.leads')}</Th></tr></thead>
            <tbody>{r.zones.map((z) => <tr key={z.code}><Td>{t(`zone.${z.code}`)}</Td><Td>{z.n}</Td></tr>)}</tbody></Table>
        </Section>
      </div>
    </>
  );
}
