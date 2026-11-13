import Link from 'next/link';
import { addSurveyEvidenceAction, reviewSurveyAction, saveSurveyAction } from '@/app/actions/app';
import { FileLink, Split } from '@/components/common';
import { GeoFields } from '@/components/views/geo-fields';
import { ActionForm, CheckboxField, Field, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, DataList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx } from '@/server/page';
import { getSurvey } from '@/server/services/surveys';

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const { survey: s, evidence } = await load(() => getSurvey(ctx, id));
  const mine = s.surveyor_id === ctx.userId && ctx.permissions.has('survey.perform');
  const editable = mine && ['SCHEDULED', 'IN_PROGRESS', 'REWORK_REQUIRED'].includes(s.status);
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  const mm = (x: unknown) => (x === null || x === undefined ? '—' : `${x} mm`);

  return (
    <>
      <PageHeader title={<>{t('p.survey.title')} · {s.project_name}</>} back={{ href: '/admin/surveys', label: t('nav.surveys') }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge value={s.status} label={t(`e.surveyStatus.${s.status}`)} />
          <Link href={`/admin/leads/${s.lead_id}`} className="text-brand-700 hover:underline">{s.lead_number}</Link></span>} />
      <Alert tone="blue" className="mb-4">{t('p.survey.notApproval')}</Alert>
      {s.status === 'REWORK_REQUIRED' && s.review_note && <Alert tone="amber" className="mb-4" title={t('e.surveyStatus.REWORK_REQUIRED')}>{s.review_note}</Alert>}

      <Split
        main={<>
          <Section title={t('p.survey.site')}>
            <DataList columns={3} items={[
              { label: t('f.customer'), value: s.customer_name }, { label: t('f.phone'), value: displayPhone(s.customer_phone) },
              { label: t('f.zone'), value: t(`zone.${s.zone_code}`) }, { label: t('f.address'), value: s.address },
              { label: t('f.liftCategory'), value: t(`e.liftCategory.${s.lift_category}`) }, { label: t('f.surveyor'), value: s.surveyor },
              { label: t('f.scheduledAt'), value: formatDateTime(s.scheduled_at, locale) }, { label: t('f.visitedAt'), value: formatDateTime(s.visited_at, locale) },
              { label: t('f.submittedAt'), value: formatDateTime(s.submitted_at, locale) },
            ]} />
          </Section>

          {editable ? (
            <Section title={t('p.survey.measurements')} description={t('p.survey.measurementsNote')}>
              <ActionForm action={saveSurveyAction} resetOnSuccess={false} className="space-y-5">
                <input type="hidden" name="id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <GeoFields latitude={v(s.latitude)} longitude={v(s.longitude)} accuracy={v(s.accuracy_m)} />
                  <Field name="floors" label={t('f.floors')} type="number" min={1} max={100} defaultValue={v(s.floors ?? s.lead_floors)} required />
                  <Field name="stops" label={t('f.stops')} type="number" min={2} max={100} defaultValue={v(s.stops)} required />
                  <Field name="shaftWidthMm" label={t('f.shaftWidthMm')} type="number" defaultValue={v(s.shaft_width_mm)} required />
                  <Field name="shaftDepthMm" label={t('f.shaftDepthMm')} type="number" defaultValue={v(s.shaft_depth_mm)} required />
                  <Field name="pitDepthMm" label={t('f.pitDepthMm')} type="number" defaultValue={v(s.pit_depth_mm)} required />
                  <Field name="overheadMm" label={t('f.overheadMm')} type="number" defaultValue={v(s.overhead_mm)} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextareaField name="landingDetails" label={t('f.landingDetails')} defaultValue={v(s.landing_details)} />
                  <TextareaField name="powerSupply" label={t('f.powerSupply')} defaultValue={v(s.power_supply)} required />
                  <TextareaField name="civilReadiness" label={t('f.civilReadiness')} defaultValue={v(s.civil_readiness)} required />
                  <TextareaField name="accessNotes" label={t('f.accessNotes')} defaultValue={v(s.access_notes)} />
                  <div className="space-y-2">
                    <CheckboxField name="machineRoom" label={t('f.machineRoom')} defaultChecked={Boolean(s.machine_room)} />
                    <TextareaField name="machineRoomNotes" label={t('f.machineRoomNotes')} defaultValue={v(s.machine_room_notes)} rows={2} />
                  </div>
                  <Field name="drawingsRef" label={t('f.drawingsRef')} defaultValue={v(s.drawings_ref)} />
                  <Field name="customerAckName" label={t('f.customerAckName')} defaultValue={v(s.customer_ack_name)} required hint={t('f.customerAckHint')} />
                  <TextareaField name="notes" label={t('f.surveyorNotes')} defaultValue={v(s.notes)} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <SubmitButton variant="secondary">{t('a.saveDraft')}</SubmitButton>
                  <SubmitButton name="submit" value="1" confirm={t('m.confirmSubmitSurvey')}>{t('a.submitSurvey')}</SubmitButton>
                </div>
              </ActionForm>
            </Section>
          ) : (
            <Section title={t('p.survey.measurements')}>
              <DataList columns={3} items={[
                { label: t('f.floors'), value: s.floors ?? '—' }, { label: t('f.stops'), value: s.stops ?? '—' },
                { label: t('f.shaftWidthMm'), value: mm(s.shaft_width_mm) }, { label: t('f.shaftDepthMm'), value: mm(s.shaft_depth_mm) },
                { label: t('f.pitDepthMm'), value: mm(s.pit_depth_mm) }, { label: t('f.overheadMm'), value: mm(s.overhead_mm) },
                { label: t('f.coordinates'), value: s.latitude ? `${s.latitude}, ${s.longitude} (±${s.accuracy_m ?? '?'} m)` : '—' },
                { label: t('f.machineRoom'), value: s.machine_room === null ? '—' : s.machine_room ? t('common.yes') : t('common.no') },
                { label: t('f.machineRoomNotes'), value: s.machine_room_notes ?? '—' },
                { label: t('f.landingDetails'), value: s.landing_details ?? '—' }, { label: t('f.powerSupply'), value: s.power_supply ?? '—' },
                { label: t('f.civilReadiness'), value: s.civil_readiness ?? '—' }, { label: t('f.accessNotes'), value: s.access_notes ?? '—' },
                { label: t('f.drawingsRef'), value: s.drawings_ref ?? '—' },
                { label: t('f.customerAckName'), value: s.customer_ack_name ? `${s.customer_ack_name} · ${formatDateTime(s.customer_ack_at, locale)}` : '—' },
                { label: t('f.surveyorNotes'), value: s.notes ?? '—' },
              ]} />
            </Section>
          )}
        </>}
        side={<>
          <Section title={t('p.survey.evidence')} description={t('p.survey.evidenceNote')}>
            {evidence.length === 0 ? <EmptyState title={t('p.survey.noEvidence')} /> : (
              <ul className="space-y-2">{evidence.map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                  <FileLink id={e.file_id} label={e.caption || e.filename} />
                  <p className="mt-0.5 text-xs text-slate-500">{t('f.deviceTime')}: {formatDateTime(e.captured_at_device, locale)} · {t('f.serverTime')}: {formatDateTime(e.received_at, locale)}</p>
                </li>
              ))}</ul>
            )}
            {editable && (
              <ActionForm action={addSurveyEvidenceAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="capturedAt" value={new Date().toISOString()} />
                <Field name="file" type="file" accept="image/*,application/pdf" capture="environment" label={t('f.photo')} required hint={t('f.fileHint')} />
                <Field name="caption" label={t('f.caption')} />
                <SubmitButton variant="secondary">{t('common.upload')}</SubmitButton>
              </ActionForm>
            )}
          </Section>

          {s.status === 'SUBMITTED' && ctx.permissions.has('survey.review') && (
            <Section title={t('p.survey.review')}>
              <ActionForm action={reviewSurveyAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <TextareaField name="note" label={t('f.reviewNote')} />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve" variant="success">{t('a.acceptSurvey')}</SubmitButton>
                  <SubmitButton name="decision" value="rework" variant="secondary">{t('a.requestRework')}</SubmitButton>
                </div>
              </ActionForm>
            </Section>
          )}
          {s.reviewed_at && <Section title={t('p.survey.review')}><p className="text-sm">{formatDateTime(s.reviewed_at, locale)}</p>{s.review_note && <p className="mt-1 text-sm text-slate-700">{s.review_note}</p>}</Section>}
        </>}
      />
    </>
  );
}
