import Link from 'next/link';
import { correctiveActionAction, inspectionAction } from '@/app/actions/app';
import { Split, enumOptions } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { QC_RESULT, SEVERITY } from '@/lib/enums';
import { formatDate, isoDateIST } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { listQuality } from '@/server/services/quality';

export default async function QcPage() {
  const { ctx, t, locale } = await pageCtx('admin');
  const d = await load(() => listQuality(ctx));
  return (
    <>
      <PageHeader title={t('nav.qc')} subtitle={t('p.qc.subtitle')} />
      <Alert tone="amber" className="mb-4">{t('m.qcNotStatutory')}</Alert>
      <Split
        main={<>
          <Section title={t('p.qc.defects')}>
            {d.defects.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.project')}</Th><Th>{t('f.description')}</Th><Th>{t('f.severity')}</Th><Th>{t('common.status')}</Th><Th>{t('p.qc.corrective')}</Th></tr></thead>
                <tbody>{d.defects.map((df) => (
                  <tr key={df.id}>
                    <Td><Link href={`/admin/projects/${df.project_id}`} className="font-medium text-brand-700 hover:underline">{df.project_number}</Link><span className="block text-xs text-slate-500">{df.legal_name}</span></Td>
                    <Td>{df.description}</Td><Td><StatusBadge value={df.severity} label={t(`e.severity.${df.severity}`)} /></Td>
                    <Td><StatusBadge value={df.status} label={t(`e.defectStatus.${df.status}`)} /></Td>
                    <Td>{d.actions.filter((a) => a.defect_id === df.id).map((a) => (
                      <div key={a.id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <StatusBadge value={a.status} label={t(`e.correctiveStatus.${a.status}`)} />
                        {a.status !== 'VERIFIED' && (
                          <ActionForm action={correctiveActionAction} hideSuccess className="flex gap-1.5">
                            <input type="hidden" name="id" value={a.id} />
                            {a.status === 'OPEN' && <SubmitButton size="sm" variant="secondary" name="step" value="done">{t('a.markDone')}</SubmitButton>}
                            {a.status === 'DONE' && <><SubmitButton size="sm" variant="success" name="step" value="verify">{t('a.verify')}</SubmitButton>
                              <SubmitButton size="sm" variant="secondary" name="step" value="reopen">{t('a.reopen')}</SubmitButton></>}
                          </ActionForm>
                        )}
                      </div>
                    ))}</Td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
          <Section title={t('p.qc.inspections')}>
            {d.inspections.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('common.date')}</Th><Th>{t('f.project')}</Th><Th>{t('f.inspector')}</Th><Th>{t('f.result')}</Th><Th>{t('common.notes')}</Th></tr></thead>
                <tbody>{d.inspections.map((i) => (
                  <tr key={i.id}><Td>{formatDate(i.inspected_on, locale)}</Td><Td>{i.project_number}<span className="block text-xs text-slate-500">{i.legal_name}</span></Td><Td>{i.inspector}</Td>
                    <Td><StatusBadge value={i.result} label={t(`e.qcResult.${i.result}`)} /></Td><Td>{i.notes ?? '—'}</Td></tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
        </>}
        side={<Section title={t('a.recordInspection')} description={t('p.qc.inspectionNote')}>
          {d.projects.length === 0 ? <EmptyState title={t('p.qc.noProjects')} /> : (
            <ActionForm action={inspectionAction} className="space-y-3">
              <SelectField name="projectId" label={t('f.project')} required placeholder={t('common.select')} options={d.projects.map((p) => ({ value: p.id, label: `${p.project_number} · ${p.legal_name}` }))} />
              <Field name="inspectedOn" type="date" label={t('common.date')} required defaultValue={isoDateIST()} />
              <SelectField name="result" label={t('f.result')} required options={enumOptions(t, 'qcResult', QC_RESULT)} />
              <TextareaField name="notes" label={t('common.notes')} rows={2} />
              {[1, 2, 3].map((n) => (
                <div key={n} className="grid grid-cols-[1fr_7rem] gap-2">
                  <Field name="defectDescription[]" label={n === 1 ? t('p.qc.defectN') : undefined} aria-label={t('p.qc.defectN')} />
                  <SelectField name="defectSeverity[]" label={n === 1 ? t('f.severity') : undefined} aria-label={t('f.severity')} options={enumOptions(t, 'severity', SEVERITY)} defaultValue="MEDIUM" />
                </div>
              ))}
              <SubmitButton>{t('common.save')}</SubmitButton>
            </ActionForm>
          )}
        </Section>}
      />
    </>
  );
}
