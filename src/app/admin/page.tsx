import { expirySweepAction } from '@/app/actions/app';
import { ActionForm, SubmitButton } from '@/components/ui/form';
import { Alert, PageHeader, Stat } from '@/components/ui';
import { formatINR, formatNumber } from '@/lib/format';
import { pageCtx, load } from '@/server/page';
import { getAdminDashboard } from '@/server/services/admin';

export default async function AdminDashboard() {
  const { ctx, t, locale } = await pageCtx('admin');
  const d = await load(() => getAdminDashboard(ctx));
  const can = (p: string) => ctx.permissions.has(p);
  const n = (v: unknown) => formatNumber(Number(v ?? 0), locale);
  const tone = (v: unknown, bad: 'red' | 'amber' = 'amber') => (Number(v) > 0 ? bad : 'green');
  const full = d.projects.active >= d.max;
  const conversion = Number(d.leads.total) ? Math.round((Number(d.leads.won) / Number(d.leads.total)) * 100) : 0;

  return (
    <>
      <PageHeader title={t('p.dashboard.title')} subtitle={t('p.dashboard.subtitle')}
        actions={<ActionForm action={expirySweepAction} hideSuccess><SubmitButton variant="secondary" size="sm">{t('a.runHousekeeping')}</SubmitButton></ActionForm>} />

      {Number(d.risk.incidents_emergency) > 0 && <Alert tone="red" className="mb-4" title={t('p.dashboard.emergency', { count: d.risk.incidents_emergency })} />}
      {Number(d.projects.stop_work) > 0 && <Alert tone="red" className="mb-4" title={t('p.dashboard.stopWork', { count: d.projects.stop_work })} />}

      <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('p.dashboard.business')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('p.dashboard.newLeads')} value={n(d.leads.new_leads)} tone={tone(d.leads.response_overdue, 'red')} href="/admin/leads?status=NEW"
          hint={t('p.dashboard.responseOverdue', { count: d.leads.response_overdue })} />
        <Stat label={t('p.dashboard.qualified')} value={n(d.leads.qualified)} hint={t('p.dashboard.ofLeads', { count: d.leads.total })} href="/admin/leads" />
        <Stat label={t('p.dashboard.surveys')} value={n(d.biz.surveys_open)} tone={tone(d.biz.surveys_to_review)} href="/admin/surveys"
          hint={t('p.dashboard.toReview', { count: d.biz.surveys_to_review })} />
        <Stat label={t('p.dashboard.activePartners')} value={n(d.biz.active_partners)} tone={tone(d.biz.partners_to_review)} href="/admin/partners"
          hint={t('p.dashboard.toReview', { count: d.biz.partners_to_review })} />
        <Stat label={t('p.dashboard.quotationsOpen')} value={n(d.biz.quotations_open)} href="/admin/quotations?status=SUBMITTED" />
        <Stat label={t('p.dashboard.wonLost')} value={`${n(d.leads.won)} / ${n(d.leads.lost)}`} hint={t('p.dashboard.conversion', { percent: conversion })} href="/admin/reports" />
        <Stat label={t('p.dashboard.ordersToConfirm')} value={n(d.biz.orders_to_confirm)} tone={tone(d.biz.orders_to_confirm)} href="/admin/orders?status=PARTNER_ACCEPTED"
          hint={t('p.dashboard.awaitingPartner', { count: d.biz.orders_awaiting_partner })} />
        <Stat label={t('p.dashboard.avgResponse')} value={d.leads.avg_response_hours === null ? '—' : t('p.dashboard.hours', { count: Number(d.leads.avg_response_hours).toFixed(1) })}
          hint={t('p.dashboard.responseTarget')} />
        {can('commission.view') && <>
          <Stat label={t('p.dashboard.grossOrderValue')} value={formatINR(d.biz.gross_order_value, locale)} hint={t('p.dashboard.notAiecRevenue')} href="/admin/orders" />
          <Stat label={t('p.dashboard.verifiedCollections')} value={formatINR(d.biz.verified_collections, locale)} href="/admin/collections" />
          <Stat label={t('p.dashboard.commissionEarned')} value={formatINR(d.biz.commission_earned, locale)} tone="blue" href="/admin/commissions" />
          <Stat label={t('p.dashboard.commissionCollected')} value={formatINR(d.biz.commission_collected, locale)} tone="green" href="/admin/commissions" />
        </>}
      </div>

      <h2 className="mt-7 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('p.dashboard.projectControl')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('p.dashboard.capacity')} value={`${d.projects.active} / ${d.max}`} tone={full ? 'red' : 'green'} href="/admin/projects"
          hint={full ? t('p.dashboard.capacityFull') : t('p.dashboard.capacityFree', { count: d.max - d.projects.active })} />
        <Stat label={t('p.dashboard.notReady')} value={n(d.projects.not_ready)} tone={tone(d.projects.not_ready)} href="/admin/projects?status=PLANNING" />
        <Stat label={t('p.dashboard.delayed')} value={n(d.projects.delayed)} tone={tone(d.projects.delayed, 'red')} href="/admin/projects"
          hint={t('p.dashboard.milestonesOverdue', { count: d.projects.milestones_overdue })} />
        <Stat label={t('p.dashboard.nearHandover')} value={n(d.projects.near_handover)} href="/admin/projects?status=QC" hint={t('p.dashboard.onHold', { count: d.projects.on_hold })} />
      </div>

      <h2 className="mt-7 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('p.dashboard.risk')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('p.dashboard.licenceInvalid')} value={n(d.risk.licence_invalid)} tone={tone(d.risk.licence_invalid, 'red')} href="/admin/compliance?tab=partners"
          hint={t('p.dashboard.expiringSoon', { count: Number(d.risk.licences_expiring) + Number(d.risk.insurance_expiring) })} />
        <Stat label={t('p.dashboard.docsPending')} value={n(d.risk.docs_pending)} tone={tone(d.risk.docs_pending)} href="/admin/compliance" />
        <Stat label={t('p.dashboard.collectionsToReview')} value={n(d.risk.collections_to_review)} tone={tone(d.risk.collections_to_review)} href="/admin/collections"
          hint={t('p.dashboard.paymentDisputes', { count: d.risk.payment_disputes })} />
        <Stat label={t('p.dashboard.commissionOverdue')} value={n(d.risk.commission_overdue)} tone={tone(d.risk.commission_overdue, 'red')} href="/admin/commissions?tab=invoices" />
        <Stat label={t('p.dashboard.incidentsOpen')} value={n(d.risk.incidents_open)} tone={tone(d.risk.incidents_open, 'red')} href="/admin/incidents" />
        <Stat label={t('p.dashboard.defectsOpen')} value={n(d.risk.defects_open)} tone={tone(d.risk.defects_open)} href="/admin/qc" />
        <Stat label={t('p.dashboard.ticketsOpen')} value={n(d.risk.tickets_open)} tone={tone(d.risk.tickets_overdue, 'red')} href="/admin/service"
          hint={t('p.dashboard.ackOverdue', { count: d.risk.tickets_overdue })} />
        <Stat label={t('p.dashboard.disputesOpen')} value={n(d.risk.disputes_open)} tone={tone(d.risk.disputes_open)} href="/admin/disputes" />
        <Stat label={t('p.dashboard.partnersBlocked')} value={n(d.risk.partners_blocked)} tone={tone(d.risk.partners_blocked, 'red')} href="/admin/partners?status=SUSPENDED" />
        <Stat label={t('p.dashboard.duplicatesOpen')} value={n(d.risk.duplicates_open)} tone={tone(d.risk.duplicates_open)} href="/admin/leads" />
        <Stat label={t('p.dashboard.failedLogins')} value={n(d.risk.failed_logins)} tone={Number(d.risk.failed_logins) > 10 ? 'red' : 'gray'} href="/admin/audit?action=auth.otp_failed"
          hint={t('p.dashboard.last24h')} />
      </div>
    </>
  );
}
