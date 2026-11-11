import { clarifyResponseAction, startRevisionAction, withdrawQuotationAction } from '@/app/actions/app';
import { QuotationView } from '@/components/views/quotation-view';
import { ActionForm, Field, SubmitButton, TextareaField } from '@/components/ui/form';
import { PageHeader, Section } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getQuotation } from '@/server/services/quotations';
import { QuotationBuilder } from './quotation-builder';

export default async function PartnerQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('partner');
  const data = await load(() => getQuotation(ctx, id));
  const q = data.quotation;
  const current = data.versions.find((v) => v.id === q.current_version_id);
  const editing = current && !current.submitted_at && !['SELECTED', 'NOT_SELECTED', 'WITHDRAWN'].includes(q.status);
  const canRevise = current?.submitted_at && ['SUBMITTED', 'REVISION_REQUESTED', 'CLARIFICATION_REQUESTED'].includes(q.status);
  return (
    <>
      <PageHeader title={`${t('p.quotation.title')} ${q.quotation_number}`} back={{ href: '/partner/quotations', label: t('nav.quotations') }} />
      {editing && current && (
        <Section title={t('p.quotation.builder', { n: current.version_no })} className="mb-5">
          <QuotationBuilder id={id} version={current}
            milestones={data.milestones.filter((m) => m.version_id === current.id).map((m) => ({ name: m.name, percent: String(Number(m.percent)) }))} />
        </Section>
      )}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        {q.status === 'CLARIFICATION_REQUESTED' && current?.submitted_at && (
          <Section title={t('a.answerClarification')}>
            <ActionForm action={clarifyResponseAction} className="space-y-3"><input type="hidden" name="id" value={id} />
              <TextareaField name="note" label={t('f.partnerResponse')} required /><SubmitButton>{t('common.submit')}</SubmitButton></ActionForm>
          </Section>
        )}
        {canRevise && (
          <Section title={t('a.startRevision')} description={t('p.quotation.revisionNote')}>
            <ActionForm action={startRevisionAction} hideSuccess><input type="hidden" name="id" value={id} /><SubmitButton variant="secondary">{t('a.startRevision')}</SubmitButton></ActionForm>
          </Section>
        )}
        {!['SELECTED', 'NOT_SELECTED', 'WITHDRAWN'].includes(q.status) && (
          <Section title={t('a.withdraw')}>
            <ActionForm action={withdrawQuotationAction} className="space-y-3"><input type="hidden" name="id" value={id} />
              <Field name="reason" label={t('f.reason')} required /><SubmitButton variant="danger" confirm={t('m.confirmStatusChange')}>{t('a.withdraw')}</SubmitButton></ActionForm>
          </Section>
        )}
      </div>
      <QuotationView t={t} locale={locale} data={{ ...data, versions: data.versions.filter((v) => v.submitted_at) }} />
    </>
  );
}
