import Link from 'next/link';
import { respondInvitationAction } from '@/app/actions/app';
import { FileLink, Split } from '@/components/common';
import { ActionForm, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, DataList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx } from '@/server/page';
import { getInvitation } from '@/server/services/matching';

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('partner');
  const { match, lead, survey: s, evidence, quotation } = await load(() => getInvitation(ctx, id));
  const mm = (x: unknown) => (x === null || x === undefined ? '—' : `${x} mm`);
  return (
    <>
      <PageHeader title={lead ? `${lead.project_name} · ${lead.lead_number}` : t('nav.partnerLeads')} back={{ href: '/partner/leads', label: t('nav.partnerLeads') }}
        subtitle={<StatusBadge value={match.status} label={t(`e.matchStatus.${match.status}`)} />} />
      {!lead ? <Section><EmptyState title={t('p.partnerLeads.closed')} /></Section> : (
        <Split
          main={<>
            {lead.needs_technical_review && <Alert tone="amber">{t('m.technicalReviewNote')}</Alert>}
            <Section title={t('p.lead.requirement')}>
              <DataList columns={3} items={[
                { label: t('f.customer'), value: `${lead.customer_name} (${t(`e.customerType.${lead.customer_type}`)})` },
                { label: t('f.phone'), value: lead.customer_phone ? displayPhone(lead.customer_phone) : t('p.partnerLeads.phoneAfterAccept') },
                { label: t('f.zone'), value: t(`zone.${lead.zone_code}`) }, { label: t('f.address'), value: lead.address },
                { label: t('f.buildingType'), value: t(`e.buildingType.${lead.building_type}`) }, { label: t('f.liftCategory'), value: t(`e.liftCategory.${lead.lift_category}`) },
                { label: t('f.floors'), value: lead.floors ?? '—' }, { label: t('f.liftCount'), value: lead.lift_count },
                { label: t('f.timeline'), value: t(`e.timeline.${lead.timeline}`) }, { label: t('f.siteReadiness'), value: t(`e.siteReadiness.${lead.site_readiness}`) },
              ]} />
            </Section>
            <Section title={t('p.survey.measurements')} description={t('p.survey.notApproval')}>
              {!s ? <EmptyState title={t('p.lead.noSurvey')} /> : (
                <>
                  <DataList columns={3} items={[
                    { label: t('f.floors'), value: s.floors ?? '—' }, { label: t('f.stops'), value: s.stops ?? '—' },
                    { label: t('f.shaftWidthMm'), value: mm(s.shaft_width_mm) }, { label: t('f.shaftDepthMm'), value: mm(s.shaft_depth_mm) },
                    { label: t('f.pitDepthMm'), value: mm(s.pit_depth_mm) }, { label: t('f.overheadMm'), value: mm(s.overhead_mm) },
                    { label: t('f.machineRoom'), value: s.machine_room ? t('common.yes') : t('common.no') }, { label: t('f.powerSupply'), value: s.power_supply ?? '—' },
                    { label: t('f.civilReadiness'), value: s.civil_readiness ?? '—' }, { label: t('f.landingDetails'), value: s.landing_details ?? '—' },
                    { label: t('f.accessNotes'), value: s.access_notes ?? '—' }, { label: t('f.surveyorNotes'), value: s.notes ?? '—' },
                  ]} />
                  <ul className="mt-3 flex flex-wrap gap-3">{evidence.map((e) => <li key={e.file_id}><FileLink id={e.file_id} label={e.caption || t('f.photo')} /></li>)}</ul>
                </>
              )}
            </Section>
          </>}
          side={<Section title={t('p.partnerLeads.respond')}>
            {match.status === 'INVITED' ? (
              <ActionForm action={respondInvitationAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <p className="text-sm text-slate-600">{t('p.partnerLeads.respondNote', { date: formatDateTime(match.respond_due_at, locale) })}</p>
                <TextareaField name="reason" label={t('f.declineReason')} rows={2} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="accept" variant="success" data-testid="accept-invite">{t('a.acceptAndQuote')}</SubmitButton>
                  <SubmitButton name="decision" value="decline" variant="secondary">{t('a.decline')}</SubmitButton>
                </div>
              </ActionForm>
            ) : quotation ? (
              <p className="text-sm">{t('f.quotationNumber')}: <Link href={`/partner/quotations/${quotation.id}`} className="font-medium text-brand-700 hover:underline">{quotation.quotation_number}</Link> <StatusBadge value={quotation.status} label={t(`e.quotationStatus.${quotation.status}`)} /></p>
            ) : <p className="text-sm text-slate-600">{match.decline_reason ?? t(`e.matchStatus.${match.status}`)}</p>}
          </Section>}
        />
      )}
    </>
  );
}
