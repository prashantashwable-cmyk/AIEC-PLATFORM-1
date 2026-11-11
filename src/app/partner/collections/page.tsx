import { addCollectionEvidenceAction, submitCollectionAction } from '@/app/actions/app';
import { Pager, Split, enumOptions } from '@/components/common';
import { CollectionsTable } from '@/components/views/collections-table';
import { ActionForm, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { Alert, EmptyState, PageHeader, Section } from '@/components/ui';
import { EVIDENCE_KIND, PAYMENT_MODE } from '@/lib/enums';
import { isoDateIST } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listCollections } from '@/server/services/money';
import { listProjects } from '@/server/services/projects';

export default async function PartnerCollectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('partner');
  const sp = await readParams(searchParams);
  const [data, projects] = await Promise.all([load(() => listCollections(ctx, { page: Number(sp.page) || 1 })), load(() => listProjects(ctx, {}))]);
  const open = projects.rows.filter((p) => !['CANCELLED'].includes(p.status));
  const pending = data.rows.filter((c) => c.status === 'PENDING_EVIDENCE');
  return (
    <>
      <PageHeader title={t('nav.partnerCollections')} subtitle={t('p.collections.partnerSubtitle')} />
      <Alert tone="blue" className="mb-4">{t('p.collections.rule')}</Alert>
      <Split
        main={<Section>
          <CollectionsTable t={t} locale={locale} rows={data.rows} showPartner={false} />
          <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/partner/collections', { page: p })} />
        </Section>}
        side={<>
          <Section title={t('a.recordCollection')} description={t('p.collections.recordNote')}>
            {open.length === 0 ? <EmptyState title={t('p.collections.noProjects')} /> : (
              <ActionForm action={submitCollectionAction} className="space-y-3">
                <SelectField name="projectId" label={t('f.project')} required placeholder={t('common.select')} options={open.map((p) => ({ value: p.id, label: `${p.project_number} · ${p.project_name}` }))} />
                <Field name="amountReceived" label={t('f.amountReceived')} inputMode="decimal" required />
                <div className="grid grid-cols-2 gap-3">
                  <Field name="excludedAmount" label={t('f.excluded')} inputMode="decimal" defaultValue="0" hint={t('f.excludedHint')} />
                  <Field name="exclusionNote" label={t('f.exclusionsNote')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field name="collectionDate" type="date" label={t('f.collectionDate')} required defaultValue={isoDateIST()} />
                  <SelectField name="paymentMode" label={t('f.paymentMode')} required options={enumOptions(t, 'paymentMode', PAYMENT_MODE)} />
                </div>
                <Field name="bankReference" label={t('f.bankReference')} hint={t('f.bankReferenceHint')} />
                <Field name="partnerReceiptNo" label={t('f.receiptNo')} />
                <SelectField name="evidenceKind" label={t('f.evidenceType')} options={enumOptions(t, 'evidenceKind', EVIDENCE_KIND)} />
                <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.evidence')} hint={t('f.fileHint')} />
                <SubmitButton data-testid="submit-collection">{t('common.submit')}</SubmitButton>
              </ActionForm>
            )}
          </Section>
          {pending.length > 0 && (
            <Section title={t('a.addEvidence')}>
              <ActionForm action={addCollectionEvidenceAction} className="space-y-3">
                <SelectField name="id" label={t('f.collection')} required options={pending.map((c) => ({ value: c.id, label: `${c.project_number} · ${c.amount_received}` }))} />
                <SelectField name="kind" label={t('f.evidenceType')} options={enumOptions(t, 'evidenceKind', EVIDENCE_KIND)} />
                <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.evidence')} required />
                <SubmitButton variant="secondary">{t('common.upload')}</SubmitButton>
              </ActionForm>
            </Section>
          )}
        </>}
      />
    </>
  );
}
