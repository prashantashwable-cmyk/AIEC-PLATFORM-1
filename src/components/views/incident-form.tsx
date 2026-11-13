'use client';

import { useState } from 'react';
import { reportIncidentAction } from '@/app/actions/app';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert } from '@/components/ui';
import { useT } from '@/i18n/client';
import { SEVERITY } from '@/lib/enums';
import { nowMs } from '@/lib/format';

/** Incident / hazard report. HIGH and CRITICAL reports escalate immediately and stop work on the project. */
export function IncidentForm({ projects }: { projects: Array<{ id: string; label: string }> }) {
  const t = useT();
  const [now] = useState(() => new Date(nowMs() + 5.5 * 3600_000).toISOString().slice(0, 16));
  return (
    <ActionForm action={reportIncidentAction} className="space-y-3">
      <Alert tone="red">{t('m.emergencyFirst')}</Alert>
      <SelectField name="projectId" label={t('f.project')} placeholder={t('common.none')} options={projects.map((p) => ({ value: p.id, label: p.label }))} />
      <Field name="occurredAt" type="datetime-local" label={t('f.occurredAt')} required defaultValue={now} />
      <SelectField name="severity" label={t('f.severity')} required options={SEVERITY.map((s) => ({ value: s, label: t(`e.severity.${s}`) }))} defaultValue="MEDIUM" hint={t('m.severityHint')} />
      <TextareaField name="description" label={t('f.whatHappened')} required />
      <TextareaField name="immediateAction" label={t('f.immediateAction')} rows={2} />
      <Field name="affectedPersonNote" label={t('f.affectedPerson')} hint={t('m.minimumPersonalData')} />
      <SubmitButton variant="danger" data-testid="incident-submit">{t('a.reportIncident')}</SubmitButton>
    </ActionForm>
  );
}
