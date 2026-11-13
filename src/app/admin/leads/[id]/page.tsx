import Link from 'next/link';
import {
  assignLeadAction, contactLeadAction, duplicateReviewAction, invitePartnersAction, leadExceptionAction, leadNoteAction, qualifyLeadAction,
  releaseQuotationsAction, runMatchingAction, scheduleSurveyAction,
} from '@/app/actions/app';
import { Check, Split, Timeline } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, DataList, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx } from '@/server/page';
import { getLead, listAssignableStaff } from '@/server/services/leads';
import { listSurveyors } from '@/server/services/surveys';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const can = (p: string) => ctx.permissions.has(p);
  const { lead, events, duplicates, surveys, matches, quotations, order } = await load(() => getLead(ctx, id));
  const [staff, surveyors] = await Promise.all([
    can('lead.assign') ? listAssignableStaff(ctx) : Promise.resolve([]),
    can('survey.schedule') ? listSurveyors(ctx) : Promise.resolve([]),
  ]);
  const s = lead.status as string;
  const open = !['CONFIRMED', 'LOST', 'DUPLICATE', 'DISQUALIFIED', 'CANCELLED'].includes(s);
  const eligible = matches.filter((m) => m.eligible);
  const invited = matches.filter((m) => ['INVITED', 'ACCEPTED'].includes(m.status)).length;
  const submitted = quotations.filter((q) => q.status === 'SUBMITTED' && q.submitted_at);
  const unreleased = submitted.filter((q) => !q.released_to_customer_at).length;

  return (
    <>
      <PageHeader
        title={<>{lead.project_name} <span className="text-base font-normal text-slate-500">· {lead.lead_number}</span></>}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <StatusBadge value={s} label={t(`e.leadStatus.${s}`)} />
          {lead.needs_technical_review && <Badge tone="amber">{t('m.technicalReview')}</Badge>}
          {!lead.zone_active && <Badge tone="red">{t('m.zoneInactive')}</Badge>}
        </span>}
        back={{ href: '/admin/leads', label: t('nav.leads') }}
      />
      {lead.needs_technical_review && <Alert tone="amber" className="mb-4">{t('m.technicalReviewNote')}</Alert>}

      <Split
        main={<>
          <Section title={t('p.lead.requirement')}>
            <DataList columns={3} items={[
              { label: t('f.customer'), value: lead.customer_name },
              { label: t('f.phone'), value: displayPhone(lead.customer_phone) },
              { label: t('f.customerType'), value: t(`e.customerType.${lead.customer_type}`) },
              { label: t('f.address'), value: lead.address },
              { label: t('f.zone'), value: t(`zone.${lead.zone_code}`) },
              { label: t('f.buildingType'), value: t(`e.buildingType.${lead.building_type}`) },
              { label: t('f.liftCategory'), value: t(`e.liftCategory.${lead.lift_category}`) },
              { label: t('f.floors'), value: lead.floors ?? '—' },
              { label: t('f.liftCount'), value: lead.lift_count },
              { label: t('f.budget'), value: formatINR(lead.budget_approx, locale) },
              { label: t('f.timeline'), value: t(`e.timeline.${lead.timeline}`) },
              { label: t('f.siteReadiness'), value: t(`e.siteReadiness.${lead.site_readiness}`) },
              { label: t('f.source'), value: t(`e.leadSource.${lead.source}`) },
              { label: t('f.financeInterest'), value: lead.finance_interest ? t('common.yes') : t('common.no') },
              { label: t('f.responseDue'), value: formatDateTime(lead.response_due_at, locale) },
              { label: t('f.assignedTo'), value: lead.assignee ?? '—' },
              { label: t('f.created'), value: formatDateTime(lead.created_at, locale) },
              { label: t('f.referralNote'), value: lead.referral_note ?? '—' },
            ]} />
          </Section>

          {duplicates.length > 0 && (
            <Section title={t('p.lead.duplicates')} description={t('p.lead.duplicatesNote')}>
              <ul className="space-y-3">
                {duplicates.map((d) => (
                  <li key={d.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm"><Link href={`/admin/leads/${d.duplicate_of_lead_id}`} className="font-medium text-brand-700 hover:underline">{d.lead_number}</Link> · {d.project_name} <StatusBadge value={d.other_status} label={t(`e.leadStatus.${d.other_status}`)} /></p>
                      <Badge tone={d.status === 'OPEN' ? 'amber' : 'gray'}>{t(`dup.status.${d.status}`)} · {d.score}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{(d.reasons as string[]).map((r) => t(`dup.${r}`)).join(' · ')}</p>
                    {d.status === 'OPEN' && can('lead.qualify') && (
                      <ActionForm action={duplicateReviewAction} hideSuccess className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={d.id} />
                        <SubmitButton size="sm" variant="secondary" name="decision" value="no">{t('a.notDuplicate')}</SubmitButton>
                        <SubmitButton size="sm" variant="danger" name="decision" value="yes" confirm={t('m.confirmDuplicate')}>{t('a.confirmDuplicate')}</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={t('nav.surveys')}>
            {surveys.length === 0 ? <EmptyState title={t('p.lead.noSurvey')} /> : (
              <Table>
                <thead><tr><Th>{t('f.scheduledAt')}</Th><Th>{t('f.surveyor')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
                <tbody>{surveys.map((sv) => (
                  <tr key={sv.id}><Td>{formatDateTime(sv.scheduled_at, locale)}</Td><Td>{sv.surveyor}</Td>
                    <Td><StatusBadge value={sv.status} label={t(`e.surveyStatus.${sv.status}`)} /></Td>
                    <Td><Link href={`/admin/surveys/${sv.id}`} className="font-medium text-brand-700 hover:underline">{t('common.open')}</Link></Td></tr>
                ))}</tbody>
              </Table>
            )}
          </Section>

          <Section title={t('p.lead.matching')} description={t('p.lead.matchingNote')}
            actions={can('matching.run') && ['SURVEY_COMPLETED', 'PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED', 'CUSTOMER_REVIEW'].includes(s)
              ? <ActionForm action={runMatchingAction} hideSuccess><input type="hidden" name="id" value={id} /><SubmitButton size="sm" variant="secondary">{t('a.runMatching')}</SubmitButton></ActionForm> : undefined}>
            {matches.length === 0 ? <EmptyState title={t('p.lead.noMatches')} /> : (
              <ActionForm action={invitePartnersAction}>
                <input type="hidden" name="id" value={id} />
                <Table>
                  <thead><tr><Th /><Th>{t('f.partner')}</Th><Th>{t('f.eligibility')}</Th><Th>{t('f.score')}</Th><Th>{t('f.breakdown')}</Th><Th>{t('common.status')}</Th></tr></thead>
                  <tbody>{matches.map((m) => (
                    <tr key={m.id}>
                      <Td>{m.eligible && ['SUGGESTED', 'EXPIRED'].includes(m.status) && can('quotation.invite') && ['PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED'].includes(s)
                        ? <input type="checkbox" name="companyIds[]" value={m.company_id} aria-label={m.legal_name} className="size-4 accent-brand-600" /> : null}</Td>
                      <Td><Link href={`/admin/partners/${m.company_id}`} className="font-medium text-brand-700 hover:underline">{m.legal_name}</Link></Td>
                      <Td>{m.eligible ? <Badge tone="green">{t('m.eligible')}</Badge>
                        : <><Badge tone="red">{t('m.notEligible')}</Badge><span className="mt-1 block text-xs text-slate-600">{(m.ineligibility_reasons as string[]).map((r) => t(`gate.${r}`)).join(' · ')}</span></>}</Td>
                      <Td className="font-semibold">{m.score ?? '—'}</Td>
                      <Td className="text-xs text-slate-600">{m.eligible ? t('m.scoreBreakdown', { a: Number(m.s_compliance), b: Number(m.s_capability), c: Number(m.s_capacity), d: Number(m.s_performance), e: Number(m.s_price), f: Number(m.s_response) }) : '—'}</Td>
                      <Td><StatusBadge value={m.status} label={t(`e.matchStatus.${m.status}`)} />{m.decline_reason && <span className="block text-xs text-slate-500">{m.decline_reason}</span>}</Td>
                    </tr>
                  ))}</tbody>
                </Table>
                {can('quotation.invite') && ['PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED'].includes(s) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <SubmitButton size="sm">{t('a.inviteSelected')}</SubmitButton>
                    <p className="text-xs text-slate-500">{t('m.inviteHint', { invited, eligible: eligible.length })}</p>
                  </div>
                )}
              </ActionForm>
            )}
          </Section>

          <Section title={t('nav.quotations')}
            actions={can('quotation.release') && unreleased > 0 && ['QUOTATION_RECEIVED', 'CUSTOMER_REVIEW', 'NEGOTIATION'].includes(s)
              ? <ActionForm action={releaseQuotationsAction} hideSuccess><input type="hidden" name="id" value={id} /><SubmitButton size="sm">{t('a.releaseToCustomer', { count: unreleased })}</SubmitButton></ActionForm> : undefined}>
            {quotations.length === 0 ? <EmptyState title={t('p.lead.noQuotations')} /> : (
              <>
                {submitted.length === 1 && <Alert tone="amber" className="mb-3">{t('m.singleQuote')}</Alert>}
                <Table>
                  <thead><tr><Th>{t('f.quotationNumber')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.version')}</Th><Th>{t('f.total')}</Th><Th>{t('f.validUntil')}</Th><Th>{t('common.status')}</Th></tr></thead>
                  <tbody>{quotations.map((q) => (
                    <tr key={q.id}>
                      <Td><Link href={`/admin/quotations/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.quotation_number}</Link></Td>
                      <Td>{q.legal_name}</Td><Td>{q.version_no ? `v${q.version_no}` : '—'}</Td><Td>{q.submitted_at ? formatINR(q.total_amount, locale) : '—'}</Td>
                      <Td>{formatDate(q.validity_date, locale)}</Td>
                      <Td><StatusBadge value={q.status} label={t(`e.quotationStatus.${q.status}`)} />{q.released_to_customer_at && <Badge tone="blue" className="ml-1">{t('m.released')}</Badge>}</Td>
                    </tr>
                  ))}</tbody>
                </Table>
              </>
            )}
            {order && <p className="mt-3 text-sm">{t('f.order')}: <Link href={`/admin/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">{order.order_number}</Link> <StatusBadge value={order.status} label={t(`e.orderStatus.${order.status}`)} /></p>}
          </Section>
        </>}
        side={<>
          <Section title={t('p.lead.nextStep')}>
            {s === 'NEW' && can('lead.update') && (
              <ActionForm action={contactLeadAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <TextareaField name="note" label={t('f.contactNote')} required />
                <SubmitButton>{t('a.markContacted')}</SubmitButton>
              </ActionForm>
            )}
            {s === 'CONTACTED' && can('lead.qualify') && (
              <ActionForm action={qualifyLeadAction} className="space-y-2.5">
                <input type="hidden" name="id" value={id} />
                <p className="text-sm text-slate-600">{t('p.lead.qualifyNote')}</p>
                <ul className="mb-1"><Check ok={lead.zone_active} label={t('q.inServiceArea')} hint={lead.zone_active ? undefined : t('err.ZONE_INACTIVE')} /></ul>
                {(['genuine', 'decisionMaker', 'scopeClear', 'surveyFeasible', 'contactConsent'] as const).map((k) => <CheckboxField key={k} name={k} label={t(`q.${k}`)} />)}
                <TextareaField name="note" label={t('common.notes')} />
                <SubmitButton>{t('a.qualify')}</SubmitButton>
              </ActionForm>
            )}
            {['QUALIFIED', 'SURVEY_PENDING'].includes(s) && can('survey.schedule') && (
              <ActionForm action={scheduleSurveyAction} className="space-y-3">
                <input type="hidden" name="leadId" value={id} />
                <SelectField name="surveyorId" label={t('f.surveyor')} required placeholder={t('common.select')} options={surveyors.map((u) => ({ value: u.id, label: u.full_name }))} />
                <Field name="scheduledAt" type="datetime-local" label={t('f.scheduledAt')} required />
                <SubmitButton>{t(s === 'QUALIFIED' ? 'a.scheduleSurvey' : 'a.rescheduleSurvey')}</SubmitButton>
              </ActionForm>
            )}
            {s === 'SURVEY_COMPLETED' && <p className="text-sm text-slate-700">{t('p.lead.stepMatching')}</p>}
            {s === 'PARTNER_MATCHING' && <p className="text-sm text-slate-700">{t('p.lead.stepInvite')}</p>}
            {s === 'QUOTATION_PENDING' && <p className="text-sm text-slate-700">{t('p.lead.stepAwaitQuotes')}</p>}
            {s === 'QUOTATION_RECEIVED' && <p className="text-sm text-slate-700">{t('p.lead.stepRelease')}</p>}
            {['CUSTOMER_REVIEW', 'NEGOTIATION'].includes(s) && <p className="text-sm text-slate-700">{t('p.lead.stepCustomer')}</p>}
            {['SELECTED', 'ORDER_PENDING'].includes(s) && <p className="text-sm text-slate-700">{t('p.lead.stepOrder')}</p>}
            {!open && <p className="text-sm text-slate-700">{t('p.lead.stepClosed')}</p>}
            {s === 'ON_HOLD' && can('lead.update') && (
              <ActionForm action={leadExceptionAction} hideSuccess className="mt-2">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="to" value="RESUME" />
                <SubmitButton>{t('a.resume')}</SubmitButton>
              </ActionForm>
            )}
          </Section>

          {can('lead.assign') && open && (
            <Section title={t('a.assign')}>
              <ActionForm action={assignLeadAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <SelectField name="userId" label={t('f.assignedTo')} required placeholder={t('common.select')} defaultValue={lead.assigned_to ?? ''} options={staff.map((u) => ({ value: u.id, label: u.full_name }))} />
                <SubmitButton variant="secondary">{t('a.assign')}</SubmitButton>
              </ActionForm>
            </Section>
          )}

          {can('lead.update') && (
            <Section title={t('p.lead.addNote')}>
              <ActionForm action={leadNoteAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <TextareaField name="note" label={t('common.notes')} required />
                <SubmitButton variant="secondary">{t('common.add')}</SubmitButton>
              </ActionForm>
            </Section>
          )}

          {can('lead.update') && open && s !== 'ON_HOLD' && (
            <Section title={t('p.lead.exception')}>
              <ActionForm action={leadExceptionAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <SelectField name="to" label={t('f.newStatus')} required placeholder={t('common.select')}
                  options={['ON_HOLD', 'LOST', 'DISQUALIFIED', 'CANCELLED'].map((v) => ({ value: v, label: t(`e.leadStatus.${v}`) }))} />
                <TextareaField name="reason" label={t('f.reason')} required />
                <SubmitButton variant="danger" confirm={t('m.confirmStatusChange')}>{t('a.changeStatus')}</SubmitButton>
              </ActionForm>
            </Section>
          )}

          <Section title={t('p.lead.history')}>
            <Timeline items={events.map((e) => ({
              key: e.id,
              title: e.source === 'NOTE' ? t('common.notes') : t(`e.leadStatus.${e.to_status}`),
              meta: `${formatDateTime(e.created_at, locale)} · ${e.actor ?? t('common.system')}`,
              body: [e.reason, e.note].filter(Boolean).join(' — ') || undefined,
            }))} />
          </Section>
        </>}
      />
    </>
  );
}
