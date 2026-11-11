import { Check } from '@/components/common';
import { Alert, PageHeader, Section, Stat, StatusBadge } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getPartnerDashboard } from '@/server/services/partnerhome';

export default async function PartnerDashboard() {
  const { ctx, t } = await pageCtx('partner');
  const { company: c, counts, facts } = await load(() => getPartnerDashboard(ctx));
  const can = (p: string) => ctx.permissions.has(p);
  const n = (v: unknown) => Number(v ?? 0);
  const tone = (v: unknown) => (n(v) > 0 ? 'amber' as const : 'gray' as const);
  const liftCo = c.category === 'ELEVATOR_COMPANY';
  return (
    <>
      <PageHeader title={c.legal_name} subtitle={<span className="flex items-center gap-2"><StatusBadge value={c.status} label={t(`e.partnerStatus.${c.status}`)} />{t(`e.companyCategory.${c.category}`)}</span>} />
      {c.status !== 'ACTIVE' && <Alert tone="amber" className="mb-4" title={t('p.partnerHome.notActiveTitle')}>{t('p.partnerHome.notActive')}</Alert>}
      {n(counts.stop_work) > 0 && <Alert tone="red" className="mb-4" title={t('p.dashboard.stopWork', { count: counts.stop_work })} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {can('quotation.submit') && <Stat label={t('p.partnerHome.invitations')} value={n(counts.invitations)} tone={tone(counts.invitations)} href="/partner/leads" hint={t('p.partnerHome.invitationsHint')} />}
        {can('quotation.submit') && <Stat label={t('p.partnerHome.quotationWork')} value={n(counts.drafts) + n(counts.requests)} tone={tone(counts.requests)} href="/partner/quotations" hint={t('p.partnerHome.requestsHint', { count: counts.requests })} />}
        {can('order.accept') && <Stat label={t('p.partnerHome.ordersPending')} value={n(counts.orders_pending)} tone={tone(counts.orders_pending)} href="/partner/orders" />}
        {can('project.assign') && <Stat label={t('p.dashboard.capacity')} value={`${c.active_projects} / ${c.max_concurrent_projects}`} href="/partner/projects" hint={t('p.partnerHome.tasksToReview', { count: counts.tasks_to_review })} />}
        {can('payment.evidence.submit') && <Stat label={t('p.partnerHome.evidencePending')} value={n(counts.evidence_pending)} tone={tone(counts.evidence_pending)} href="/partner/collections" />}
        {can('commission.view.own') && <Stat label={t('p.partnerHome.invoicesOpen')} value={n(counts.invoices_open)} tone={tone(counts.invoices_open)} href="/partner/commissions?tab=invoices" />}
        {can('service.perform') && <Stat label={t('p.dashboard.ticketsOpen')} value={n(counts.tickets_open)} tone={tone(counts.tickets_open)} href="/partner/service" />}
      </div>
      {liftCo && (
        <Section title={t('p.company.verification')} className="mt-5 max-w-xl">
          <ul className="space-y-1.5">
            <Check ok={facts.licenceDaysLeft !== null} label={t('og.licence')} hint={facts.licenceDaysLeft !== null ? t('common.days', { count: facts.licenceDaysLeft }) : t('err.LICENCE_INVALID')} />
            <Check ok={facts.insuranceDaysLeft !== null} label={t('og.insurance')} hint={facts.insuranceDaysLeft !== null ? t('common.days', { count: facts.insuranceDaysLeft }) : t('err.INSURANCE_INVALID')} />
            <Check ok={!c.safety_block} label={t('p.company.noSafetyBlock')} />
          </ul>
        </Section>
      )}
    </>
  );
}
