import { adjustCommissionAction, commissionPolicyAction, createInvoiceAction, invoicePaymentAction } from '@/app/actions/app';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { ActionForm, Field, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, EmptyState, Section, Stat, StatusBadge, Table, Tabs, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { LEDGER_STATUS, type Locale } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR, isoDateIST } from '@/lib/format';
import type { Ctx } from '@/server/ctx';
import type { listInvoices, listLedger } from '@/server/services/money';
import { withParams } from '@/server/page';

type Ledger = Awaited<ReturnType<typeof listLedger>>;
type Invoices = Awaited<ReturnType<typeof listInvoices>>;

/** Commission ledger, invoices and policy. Partners see their own entries read-only. */
export function LedgerView({ ctx, t, locale, ledger, inv, sp, base }: { ctx: Ctx; t: TFunction; locale: Locale; ledger: Ledger; inv: Invoices; sp: Record<string, string>; base: string }) {
  const can = (p: string) => ctx.permissions.has(p);
  const staff = can('commission.view');
  const tab = ['ledger', 'invoices', 'policy'].includes(sp.tab) ? sp.tab : 'ledger';
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('f.commissionEarned')} value={formatINR(ledger.totals.earned, locale)} tone="blue" />
        <Stat label={t('f.notInvoiced')} value={formatINR(ledger.totals.uninvoiced, locale)} tone="amber" />
        <Stat label={t('f.invoicedUnpaid')} value={formatINR(ledger.totals.invoiced, locale)} tone="amber" />
        <Stat label={t('f.commissionPaid')} value={formatINR(ledger.totals.paid, locale)} tone="green" />
      </div>
      <Tabs active={tab} tabs={[
        { key: 'ledger', label: t('p.commission.ledger'), href: base },
        { key: 'invoices', label: t('p.commission.invoices'), href: `${base}?tab=invoices`, count: inv.invoices.length },
        { key: 'policy', label: t('p.commission.policy'), href: `${base}?tab=policy` },
      ]} />

      {tab === 'ledger' && (
        <>
          <Alert tone="blue" className="mb-4">{t('p.commission.rule')}</Alert>
          <FilterBar submitLabel={t('common.filter')} resetHref={base} resetLabel={t('common.reset')}>
            <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'ledgerStatus', LEDGER_STATUS)} />
          </FilterBar>
          <Section>
            {ledger.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.commission.empty')} /> : (
              <Table>
                <thead><tr><Th>{t('f.entry')}</Th>{staff && <Th>{t('f.partner')}</Th>}<Th>{t('f.order')}</Th><Th>{t('f.eligibleAmount')}</Th><Th>{t('f.rate')}</Th><Th>{t('f.commission')}</Th><Th>{t('common.status')}</Th>{can('commission.adjust') && <Th>{t('a.adjust')}</Th>}</tr></thead>
                <tbody>{ledger.rows.map((e) => (
                  <tr key={e.id}>
                    <Td>{e.entry_number}<span className="block"><StatusBadge value={e.entry_type} label={t(`e.ledgerType.${e.entry_type}`)} /></span>
                      <span className="block text-xs text-slate-500">{formatDateTime(e.created_at, locale)}{e.reason ? ` · ${e.reason}` : ''}</span></Td>
                    {staff && <Td>{e.legal_name}</Td>}
                    <Td>{e.order_number}</Td><Td>{formatINR(e.eligible_amount, locale)}</Td><Td>{Number(e.rate_percent)}%</Td>
                    <Td className="font-semibold">{formatINR(e.amount, locale)}</Td>
                    <Td><StatusBadge value={e.display_status} label={t(`e.ledgerStatus.${e.display_status}`)} />{e.invoice_number && <span className="block text-xs text-slate-500">{e.invoice_number}</span>}</Td>
                    {can('commission.adjust') && <Td>{e.entry_type === 'COMMISSION' && (
                      <ActionForm action={adjustCommissionAction} hideSuccess className="flex min-w-48 flex-col gap-1.5">
                        <input type="hidden" name="entryId" value={e.id} />
                        <Field name="amount" placeholder={t('f.adjustmentAmount')} aria-label={t('f.adjustmentAmount')} />
                        <Field name="reason" placeholder={t('f.reason')} aria-label={t('f.reason')} />
                        <SubmitButton size="sm" variant="secondary" confirm={t('m.confirmAdjust')}>{t('a.adjust')}</SubmitButton>
                      </ActionForm>
                    )}</Td>}
                  </tr>
                ))}</tbody>
              </Table>
            )}
            <Pager t={t} page={ledger.page} total={ledger.total} hrefFor={(p) => withParams(base, { ...sp, page: p })} />
          </Section>
        </>
      )}

      {tab === 'invoices' && (
        <div className="space-y-5">
          {can('commission.calculate') && (
            <Section title={t('p.commission.readyToInvoice')} description={t('p.commission.gstNote')}>
              {inv.invoiceable.length === 0 ? <EmptyState title={t('err.NOTHING_TO_INVOICE')} /> : (
                <ul className="divide-y divide-slate-100">{inv.invoiceable.map((c) => (
                  <li key={c.company_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{c.legal_name} · {t('m.entriesN', { count: c.entries })} · <strong>{formatINR(c.amount, locale)}</strong></span>
                    <ActionForm action={createInvoiceAction} hideSuccess><input type="hidden" name="companyId" value={c.company_id} /><SubmitButton size="sm">{t('a.createInvoice')}</SubmitButton></ActionForm>
                  </li>
                ))}</ul>
              )}
            </Section>
          )}
          <Section title={t('p.commission.invoices')}>
            {inv.invoices.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <Table>
                <thead><tr><Th>{t('f.invoice')}</Th>{staff && <Th>{t('f.partner')}</Th>}<Th>{t('f.subtotal')}</Th><Th>{t('f.gst')}</Th><Th>{t('f.total')}</Th><Th>{t('f.dueDate')}</Th><Th>{t('common.status')}</Th>{can('commission.calculate') && <Th>{t('a.recordPayment')}</Th>}</tr></thead>
                <tbody>{inv.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.invoice_number}<span className="block text-xs text-slate-500">{formatDate(i.issued_at, locale)}</span></Td>
                    {staff && <Td>{i.legal_name}</Td>}
                    <Td>{formatINR(i.subtotal, locale)}</Td><Td>{formatINR(i.gst_amount, locale)} ({Number(i.gst_rate_percent)}%)</Td><Td className="font-semibold">{formatINR(i.total, locale)}</Td>
                    <Td>{formatDate(i.due_date, locale)}</Td>
                    <Td><StatusBadge value={i.display_status} label={t(`e.invoiceStatus.${i.display_status}`)} />{i.payment_reference && <span className="block text-xs text-slate-500">{i.payment_reference} · {formatDate(i.paid_on, locale)}</span>}</Td>
                    {can('commission.calculate') && <Td>{i.status === 'ISSUED' && (
                      <ActionForm action={invoicePaymentAction} hideSuccess className="flex min-w-48 flex-col gap-1.5">
                        <input type="hidden" name="invoiceId" value={i.id} />
                        <Field name="amount" aria-label={t('f.amount')} defaultValue={i.total} inputMode="decimal" />
                        <Field name="paidOn" type="date" aria-label={t('f.paidOn')} defaultValue={isoDateIST()} />
                        <Field name="reference" placeholder={t('f.paymentReference')} aria-label={t('f.paymentReference')} />
                        <SubmitButton size="sm" variant="success">{t('a.recordPayment')}</SubmitButton>
                      </ActionForm>
                    )}</Td>}
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
        </div>
      )}

      {tab === 'policy' && (
        <div className="space-y-5">
          <Section title={t('p.commission.policy')} description={t('p.commission.policyNote')}>
            <Table>
              <thead><tr><Th>{t('f.version')}</Th><Th>{t('f.rate')}</Th><Th>{t('f.description')}</Th><Th>{t('f.effectiveFrom')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>{inv.policies.map((p) => (
                <tr key={p.id}><Td>v{p.version}</Td><Td>{Number(p.rate_percent)}%</Td><Td>{p.description}</Td><Td>{formatDate(p.effective_from, locale)}</Td>
                  <Td>{p.is_active ? <Badge tone="green">{t('e.partnerStatus.ACTIVE')}</Badge> : <Badge tone="gray">{t('m.superseded')}</Badge>}</Td></tr>
              ))}</tbody>
            </Table>
          </Section>
          {can('commission.policy') && (
            <Section title={t('a.newPolicyVersion')}>
              <ActionForm action={commissionPolicyAction} className="grid gap-3 sm:grid-cols-3">
                <Field name="ratePercent" label={t('f.ratePercent')} inputMode="decimal" required />
                <Field name="effectiveFrom" type="date" label={t('f.effectiveFrom')} required defaultValue={isoDateIST()} />
                <TextareaField name="description" label={t('f.description')} required rows={2} wrapperClassName="sm:col-span-3" />
                <div><SubmitButton confirm={t('m.confirmPolicy')}>{t('a.publish')}</SubmitButton></div>
              </ActionForm>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
