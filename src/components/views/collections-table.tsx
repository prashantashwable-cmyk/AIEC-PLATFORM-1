import { reconcileAction, refundAction } from '@/app/actions/app';
import { FileLink } from '@/components/common';
import { ActionForm, Field, SubmitButton } from '@/components/ui/form';
import { Badge, EmptyState, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import type { Locale } from '@/lib/enums';
import { formatDate, formatINR } from '@/lib/format';
import type { Rec } from '@/server/db';

/** Collections with evidence. `reconcile` adds the AIEC review controls. */
export function CollectionsTable({ t, locale, rows, reconcile = false, showPartner = true }: { t: TFunction; locale: Locale; rows: Rec[]; reconcile?: boolean; showPartner?: boolean }) {
  if (rows.length === 0) return <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} />;
  return (
    <Table>
      <thead><tr><Th>{t('f.project')}</Th>{showPartner && <Th>{t('f.partner')}</Th>}<Th>{t('f.amountReceived')}</Th><Th>{t('f.eligibleAmount')}</Th><Th>{t('f.paymentDetails')}</Th><Th>{t('f.evidence')}</Th><Th>{t('common.status')}</Th>{reconcile && <Th>{t('common.actions')}</Th>}</tr></thead>
      <tbody>{rows.map((c) => (
        <tr key={c.id}>
          <Td>{c.project_number}<span className="block text-xs text-slate-500">{c.milestone_name ?? '—'} · {c.customer_name}</span></Td>
          {showPartner && <Td>{c.legal_name}</Td>}
          <Td className="font-medium">{formatINR(c.amount_received, locale)}{Number(c.refunded_amount) > 0 && <span className="block text-xs text-red-700">{t('f.refunded')}: {formatINR(c.refunded_amount, locale)}</span>}</Td>
          <Td>{formatINR(c.eligible_amount, locale)}{Number(c.excluded_amount) > 0 && <span className="block text-xs text-slate-500">{t('f.excluded')}: {formatINR(c.excluded_amount, locale)} · {c.exclusion_note}</span>}</Td>
          <Td>{formatDate(c.collection_date, locale)} · {t(`e.paymentMode.${c.payment_mode}`)}
            <span className="block text-xs text-slate-500">{t('f.bankReference')}: {c.bank_reference ?? '—'} · {t('f.receiptNo')}: {c.partner_receipt_no ?? '—'}</span>
            <Badge tone={c.customer_confirmed_at ? 'green' : 'gray'}>{c.customer_confirmed_at ? t('m.customerConfirmed') : t('m.customerNotConfirmed')}</Badge></Td>
          <Td>{(c.evidence as Array<{ file_id: string; kind: string }>).length === 0 ? '—' : (c.evidence as Array<{ file_id: string; kind: string }>).map((e) => (
            <span key={e.file_id} className="block"><FileLink id={e.file_id} label={t(`e.evidenceKind.${e.kind}`)} /></span>))}</Td>
          <Td><StatusBadge value={c.status} label={t(`e.collectionStatus.${c.status}`)} />{c.review_note && <span className="block text-xs text-slate-500">{c.review_note}</span>}</Td>
          {reconcile && <Td>
            {['SUBMITTED', 'UNDER_REVIEW', 'DISPUTED'].includes(c.status) && (
              <ActionForm action={reconcileAction} hideSuccess className="flex min-w-56 flex-col gap-1.5">
                <input type="hidden" name="id" value={c.id} />
                <Field name="note" placeholder={t('f.reviewNote')} aria-label={t('f.reviewNote')} />
                <div className="flex flex-wrap gap-1.5">
                  {c.status === 'SUBMITTED' && <SubmitButton size="sm" variant="secondary" name="decision" value="review">{t('a.startReview')}</SubmitButton>}
                  <SubmitButton size="sm" variant="success" name="decision" value="verify" confirm={t('m.confirmVerifyCollection')}>{t('a.verify')}</SubmitButton>
                  <SubmitButton size="sm" variant="secondary" name="decision" value="reject">{t('a.reject')}</SubmitButton>
                  {c.status !== 'DISPUTED' && <SubmitButton size="sm" variant="ghost" name="decision" value="dispute">{t('a.dispute')}</SubmitButton>}
                </div>
              </ActionForm>
            )}
            {['VERIFIED', 'REFUNDED'].includes(c.status) && (
              <ActionForm action={refundAction} hideSuccess className="flex min-w-56 flex-col gap-1.5">
                <input type="hidden" name="id" value={c.id} />
                <Field name="amount" placeholder={t('f.refundAmount')} aria-label={t('f.refundAmount')} inputMode="decimal" />
                <Field name="reason" placeholder={t('f.reason')} aria-label={t('f.reason')} />
                <SubmitButton size="sm" variant="danger" confirm={t('m.confirmRefund')}>{t('a.recordRefund')}</SubmitButton>
              </ActionForm>
            )}
          </Td>}
        </tr>
      ))}</tbody>
    </Table>
  );
}
