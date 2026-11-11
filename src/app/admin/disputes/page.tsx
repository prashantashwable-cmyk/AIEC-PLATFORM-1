import { disputeDecisionAction } from '@/app/actions/app';
import { ActionForm, Field, SubmitButton } from '@/components/ui/form';
import { EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getServiceOverview } from '@/server/services/service';

export default async function DisputesPage() {
  const { ctx, t, locale } = await pageCtx('admin');
  const { disputes } = await load(() => getServiceOverview(ctx));
  const manage = ctx.permissions.has('dispute.manage');
  return (
    <>
      <PageHeader title={t('nav.disputes')} subtitle={t('p.disputes.subtitle')} />
      <Section>
        {disputes.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.disputes.empty')} /> : (
          <ul className="divide-y divide-slate-100">{disputes.map((d) => (
            <li key={d.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">{d.dispute_number} · {t(`e.disputeKind.${d.kind}`)}{d.order_number ? ` · ${d.order_number}` : ''}</p>
                <StatusBadge value={d.status} label={t(`e.disputeStatus.${d.status}`)} />
              </div>
              <p className="mt-1 text-sm text-slate-700">{d.description}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(d.created_at, locale)}{d.legal_name ? ` · ${d.legal_name}` : ''}{d.customer_name ? ` · ${d.customer_name}` : ''}</p>
              {d.resolution && <p className="mt-1 text-sm text-emerald-800">{t('f.resolution')}: {d.resolution}</p>}
              {manage && ['OPEN', 'UNDER_REVIEW'].includes(d.status) && (
                <ActionForm action={disputeDecisionAction} hideSuccess className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <Field name="resolution" placeholder={t('f.resolution')} aria-label={t('f.resolution')} wrapperClassName="min-w-64 flex-1" />
                  {d.status === 'OPEN' && <SubmitButton size="sm" variant="secondary" name="to" value="UNDER_REVIEW">{t('a.startReview')}</SubmitButton>}
                  <SubmitButton size="sm" variant="success" name="to" value="RESOLVED">{t('a.resolve')}</SubmitButton>
                  <SubmitButton size="sm" variant="secondary" name="to" value="REJECTED">{t('a.reject')}</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}</ul>
        )}
      </Section>
    </>
  );
}
