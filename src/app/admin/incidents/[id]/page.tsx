import { correctiveActionAction, incidentUpdateAction } from '@/app/actions/app';
import { Split, Timeline } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, DataList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui';
import type { IncidentStatus } from '@/lib/enums';
import { formatDate, formatDateTime } from '@/lib/format';
import { INCIDENT_MACHINE } from '@/lib/state';
import { load, pageCtx } from '@/server/page';
import { getIncident } from '@/server/services/quality';

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const { incident: i, events, actions } = await load(() => getIncident(ctx, id));
  const manage = ctx.permissions.has('incident.manage');
  const next = INCIDENT_MACHINE[i.status as IncidentStatus];
  return (
    <>
      <PageHeader title={`${t('f.incident')} ${i.incident_number}`} back={{ href: '/admin/incidents', label: t('nav.incidents') }}
        subtitle={<span className="flex gap-2"><StatusBadge value={i.severity} label={t(`e.severity.${i.severity}`)} /><StatusBadge value={i.status} label={t(`e.incidentStatus.${i.status}`)} /></span>} />
      <Alert tone="blue" className="mb-4">{t('p.incidents.immutable')}</Alert>
      <Split
        main={<>
          <Section title={t('p.incidents.report')}>
            <DataList columns={2} items={[
              { label: t('f.occurredAt'), value: formatDateTime(i.occurred_at, locale) }, { label: t('f.reportedBy'), value: `${i.reporter ?? '—'} · ${formatDateTime(i.created_at, locale)}` },
              { label: t('f.project'), value: i.project_number ?? '—' }, { label: t('f.partner'), value: i.legal_name ?? '—' },
              { label: t('f.whatHappened'), value: i.description }, { label: t('f.immediateAction'), value: i.immediate_action ?? '—' },
              { label: t('f.affectedPerson'), value: i.affected_person_note ?? '—' }, { label: t('f.findings'), value: i.findings ?? '—' },
              { label: t('f.authorityNotified'), value: i.authority_notified ? t('common.yes') : t('common.no') }, { label: t('f.insurerNotified'), value: i.insurer_notified ? t('common.yes') : t('common.no') },
            ]} />
          </Section>
          <Section title={t('p.qc.corrective')}>
            {actions.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <ul className="space-y-2 text-sm">{actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2"><span>{a.description}{a.due_date && <span className="block text-xs text-slate-500">{formatDate(a.due_date, locale)}</span>}</span>
                  <span className="flex items-center gap-2"><StatusBadge value={a.status} label={t(`e.correctiveStatus.${a.status}`)} />
                    {manage && a.status !== 'VERIFIED' && (
                      <ActionForm action={correctiveActionAction} hideSuccess className="flex gap-1.5"><input type="hidden" name="id" value={a.id} />
                        {a.status === 'OPEN' ? <SubmitButton size="sm" variant="secondary" name="step" value="done">{t('a.markDone')}</SubmitButton>
                          : <SubmitButton size="sm" variant="success" name="step" value="verify">{t('a.verify')}</SubmitButton>}</ActionForm>
                    )}</span></li>
              ))}</ul>
            )}
          </Section>
          <Section title={t('p.lead.history')}>
            <Timeline items={events.map((e) => ({
              key: e.id, title: e.kind === 'STATUS' ? t(`e.incidentStatus.${e.to_status}`) : t(`m.incidentEvent.${e.kind}`),
              meta: `${formatDateTime(e.created_at, locale)} · ${e.actor ?? t('common.system')}`, body: e.note ?? undefined,
            }))} />
          </Section>
        </>}
        side={i.status === 'CLOSED' ? <span /> : (
          <Section title={t('p.incidents.update')}>
            <ActionForm action={incidentUpdateAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              {manage && <SelectField name="to" label={t('f.newStatus')} placeholder={t('m.noStatusChange')} options={next.map((s) => ({ value: s, label: t(`e.incidentStatus.${s}`) }))} />}
              <SelectField name="kind" label={t('f.entryType')} options={[{ value: 'NOTE', label: t('m.incidentEvent.NOTE') }, { value: 'CORRECTION', label: t('m.incidentEvent.CORRECTION') }]} />
              <TextareaField name="note" label={t('common.notes')} required />
              {manage && <>
                <TextareaField name="findings" label={t('f.findings')} rows={2} defaultValue={i.findings ?? ''} />
                <CheckboxField name="authorityNotified" label={t('f.authorityNotified')} defaultChecked={i.authority_notified} />
                <CheckboxField name="insurerNotified" label={t('f.insurerNotified')} defaultChecked={i.insurer_notified} />
                <Field name="correctiveAction" label={t('f.newCorrectiveAction')} />
                <Field name="correctiveDue" type="date" label={t('f.dueDate')} />
              </>}
              <SubmitButton>{t('common.save')}</SubmitButton>
            </ActionForm>
          </Section>
        )}
      />
    </>
  );
}
