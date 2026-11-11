import Link from 'next/link';
import { complianceDecisionAction, regulatorySourceAction, requirementAction } from '@/app/actions/app';
import { FileLink, enumOptions } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { Alert, Badge, EmptyState, PageHeader, Section, StatusBadge, Table, Tabs, Td, Th } from '@/components/ui';
import { COMPLIANCE_DOC_TYPE, COMPLIANCE_GATE } from '@/lib/enums';
import { formatDate } from '@/lib/format';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import type { Rec } from '@/server/db';
import { getComplianceOverview } from '@/server/services/quality';

export default async function CompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const d = await load(() => getComplianceOverview(ctx));
  const tab = ['documents', 'partners', 'gates', 'register'].includes(sp.tab) ? sp.tab : 'documents';
  const approve = ctx.permissions.has('compliance.document.approve');
  const manage = ctx.permissions.has('compliance.manage');
  const expiry = (row: Rec) => (Number(row.days_left) < 0 ? <Badge tone="red">{t('e.partnerStatus.EXPIRED')}</Badge> : Number(row.days_left) <= 30 ? <Badge tone="amber">{t('common.days', { count: row.days_left })}</Badge> : <Badge tone="green">{t('common.days', { count: row.days_left })}</Badge>);
  const partnerDocs = (rows: Rec[], kind: 'licence' | 'insurance') => (
    <Table>
      <thead><tr><Th>{t('f.partner')}</Th><Th>{t('f.type')}</Th><Th>{t('f.number')}</Th><Th>{t('f.expiryDate')}</Th><Th>{t('f.remaining')}</Th><Th>{t('common.status')}</Th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><Td><Link href={`/admin/partners/${r.company_id}`} className="font-medium text-brand-700 hover:underline">{r.legal_name}</Link></Td>
          <Td>{kind === 'licence' ? t(`e.licenseType.${r.license_type}`) : t(`e.insuranceType.${r.policy_type}`)}</Td><Td>{kind === 'licence' ? r.license_number : r.policy_number}</Td>
          <Td>{formatDate(r.expiry_date, locale)}</Td><Td>{expiry(r)}</Td><Td><StatusBadge value={r.verification_status} label={t(`e.verificationStatus.${r.verification_status}`)} /></Td></tr>
      ))}</tbody>
    </Table>
  );
  return (
    <>
      <PageHeader title={t('nav.compliance')} subtitle={t('p.compliance.subtitle')} />
      <Alert tone="amber" className="mb-4">{t('p.compliance.notLegalAdvice')}</Alert>
      <Tabs active={tab} tabs={[
        { key: 'documents', label: t('p.compliance.documents'), href: '/admin/compliance', count: d.documents.filter((x) => x.verification_status === 'PENDING').length },
        { key: 'partners', label: t('p.compliance.partnerDocs'), href: '/admin/compliance?tab=partners' },
        { key: 'gates', label: t('p.compliance.gates'), href: '/admin/compliance?tab=gates' },
        { key: 'register', label: t('p.compliance.register'), href: '/admin/compliance?tab=register' },
      ]} />

      {tab === 'documents' && (
        <Section description={t('m.statutoryDocsNote')}>
          {d.documents.length === 0 ? <EmptyState title={t('common.noData')} /> : (
            <Table>
              <thead><tr><Th>{t('f.type')}</Th><Th>{t('f.project')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.reference')}</Th><Th>{t('f.validity')}</Th><Th>{t('f.document')}</Th><Th>{t('common.status')}</Th>{approve && <Th />}</tr></thead>
              <tbody>{d.documents.map((doc) => (
                <tr key={doc.id}>
                  <Td>{t(`e.complianceDocType.${doc.doc_type}`)}</Td>
                  <Td>{doc.project_id ? <Link href={`/admin/projects/${doc.project_id}?tab=documents`} className="text-brand-700 hover:underline">{doc.project_number}</Link> : '—'}</Td>
                  <Td>{doc.legal_name}</Td><Td>{doc.reference_number ?? '—'}<span className="block text-xs text-slate-500">{doc.authority}</span></Td>
                  <Td>{formatDate(doc.issue_date, locale)} – {formatDate(doc.expiry_date, locale)}</Td><Td><FileLink id={doc.file_id} label={t('common.view')} /></Td>
                  <Td><StatusBadge value={doc.verification_status} label={t(`e.verificationStatus.${doc.verification_status}`)} />{doc.rejection_reason && <span className="block text-xs text-slate-500">{doc.rejection_reason}</span>}</Td>
                  {approve && <Td>{doc.verification_status === 'PENDING' && (
                    <ActionForm action={complianceDecisionAction} hideSuccess className="flex min-w-44 flex-col gap-1.5">
                      <input type="hidden" name="id" value={doc.id} />
                      <Field name="reason" placeholder={t('f.rejectionReason')} aria-label={t('f.rejectionReason')} />
                      <div className="flex gap-1.5"><SubmitButton size="sm" variant="success" name="decision" value="approve">{t('a.verify')}</SubmitButton>
                        <SubmitButton size="sm" variant="secondary" name="decision" value="reject">{t('a.reject')}</SubmitButton></div>
                    </ActionForm>
                  )}</Td>}
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Section>
      )}

      {tab === 'partners' && (
        <div className="space-y-5">
          <Section title={t('p.company.licences')}>{d.licences.length ? partnerDocs(d.licences, 'licence') : <EmptyState title={t('common.noData')} />}</Section>
          <Section title={t('p.company.insurance')}>{d.insurance.length ? partnerDocs(d.insurance, 'insurance') : <EmptyState title={t('common.noData')} />}</Section>
        </div>
      )}

      {tab === 'gates' && (
        <div className="space-y-5">
          <Section title={t('p.compliance.gates')} description={t('p.compliance.gatesNote')}>
            <Table>
              <thead><tr><Th>{t('f.gate')}</Th><Th>{t('f.type')}</Th><Th>{t('f.source')}</Th><Th>{t('common.notes')}</Th><Th>{t('common.status')}</Th>{manage && <Th />}</tr></thead>
              <tbody>{d.requirements.map((r) => (
                <tr key={r.id}><Td>{t(`e.complianceGate.${r.gate}`)}</Td><Td>{t(`e.complianceDocType.${r.doc_type}`)}</Td>
                  <Td>{r.source_title ?? '—'}{r.source_status && <span className="block"><StatusBadge value={r.source_status} label={t(`e.sourceVerification.${r.source_status}`)} /></span>}</Td>
                  <Td className="text-xs">{r.note}</Td><Td><Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? t('f.active') : t('m.inactive')}</Badge></Td>
                  {manage && <Td><ActionForm action={requirementAction} hideSuccess>
                    <input type="hidden" name="gate" value={r.gate} /><input type="hidden" name="docType" value={r.doc_type} />
                    {r.source_id && <input type="hidden" name="sourceId" value={r.source_id} />}<input type="hidden" name="note" value={r.note ?? ''} />
                    {!r.is_active && <input type="hidden" name="isActive" value="true" />}
                    <SubmitButton size="sm" variant="secondary">{r.is_active ? t('a.deactivate') : t('a.activate')}</SubmitButton></ActionForm></Td>}
                </tr>
              ))}</tbody>
            </Table>
          </Section>
          {manage && (
            <Section title={t('a.addGate')}>
              <ActionForm action={requirementAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField name="gate" label={t('f.gate')} required options={enumOptions(t, 'complianceGate', COMPLIANCE_GATE)} />
                <SelectField name="docType" label={t('f.type')} required options={enumOptions(t, 'complianceDocType', COMPLIANCE_DOC_TYPE)} />
                <SelectField name="sourceId" label={t('f.source')} placeholder={t('common.none')} options={d.sources.map((s) => ({ value: s.id, label: s.title.slice(0, 70) }))} />
                <Field name="note" label={t('common.notes')} />
                <input type="hidden" name="isActive" value="true" />
                <div><SubmitButton>{t('common.add')}</SubmitButton></div>
              </ActionForm>
            </Section>
          )}
        </div>
      )}

      {tab === 'register' && (
        <div className="space-y-4">
          <Alert tone="blue">{t('p.compliance.registerNote')}</Alert>
          {d.sources.map((s) => (
            <Section key={s.id} title={s.title} actions={<StatusBadge value={s.verification_status} label={t(`e.sourceVerification.${s.verification_status}`)} />}
              description={[s.authority, s.geography, s.applicability].filter(Boolean).join(' · ')}>
              {manage ? (
                <ActionForm action={regulatorySourceAction} resetOnSuccess={false} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="id" value={s.id} /><input type="hidden" name="title" value={s.title} />
                  <input type="hidden" name="authority" value={s.authority ?? ''} /><input type="hidden" name="geography" value={s.geography ?? ''} /><input type="hidden" name="applicability" value={s.applicability ?? ''} />
                  <Field name="sectionRule" label={t('f.sectionRule')} defaultValue={s.section_rule ?? ''} />
                  <Field name="publicationDate" type="date" label={t('f.publicationDate')} defaultValue={s.publication_date ?? ''} />
                  <Field name="effectiveDate" type="date" label={t('f.effectiveFrom')} defaultValue={s.effective_date ?? ''} />
                  <Field name="legalReviewer" label={t('f.legalReviewer')} defaultValue={s.legal_reviewer ?? ''} />
                  <Field name="lastVerifiedOn" type="date" label={t('f.lastVerifiedOn')} defaultValue={s.last_verified_on ?? ''} />
                  <Field name="nextReviewOn" type="date" label={t('f.nextReviewOn')} defaultValue={s.next_review_on ?? ''} />
                  <CheckboxField name="verified" label={t('f.markVerified')} defaultChecked={s.verification_status === 'VERIFIED'} wrapperClassName="self-end" />
                  <div className="self-end"><SubmitButton variant="secondary">{t('common.save')}</SubmitButton></div>
                </ActionForm>
              ) : <p className="text-sm text-slate-600">{s.legal_reviewer ?? '—'} · {formatDate(s.last_verified_on, locale)}</p>}
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
