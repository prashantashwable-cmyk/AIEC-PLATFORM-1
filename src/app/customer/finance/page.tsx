import { financeConsentAction, withdrawConsentAction } from '@/app/actions/app';
import { Split, enumOptions } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { Alert, DataList, EmptyState, PageHeader, Section, StatusBadge } from '@/components/ui';
import { FINANCE_CONSENT_VERSION } from '@/lib/config';
import { CONTACT_PREFERENCE } from '@/lib/enums';
import { formatDateTime, formatINR } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { listMyReferrals } from '@/server/services/finance';

export default async function CustomerFinancePage() {
  const { ctx, t, locale } = await pageCtx('customer');
  const { referrals, leads } = await load(() => listMyReferrals(ctx));
  return (
    <>
      <PageHeader title={t('nav.customerFinance')} subtitle={t('p.customerFinance.subtitle')} />
      <Alert tone="amber" className="mb-4" title={t('p.finance.boundaryTitle')}>{t('landing.financeBody')}</Alert>
      <Split
        main={<Section title={t('p.customerFinance.mine')}>
          {referrals.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.customerFinance.empty')} /> : (
            <ul className="space-y-4">{referrals.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{r.referral_number} · {r.project_name}</p><StatusBadge value={r.status} label={t(`e.referralStatus.${r.status}`)} /></div>
                <DataList columns={3} items={[
                  { label: t('f.approxAmount'), value: formatINR(r.approx_amount, locale) }, { label: t('f.contactPreference'), value: t(`e.contactPreference.${r.contact_preference}`) },
                  { label: t('f.lender'), value: r.lender_name ?? t('p.customerFinance.notYetReferred') }, { label: t('f.created'), value: formatDateTime(r.created_at, locale) },
                  { label: t('f.grievanceRoute'), value: r.grievance_route ?? '—' },
                ]} />
                {!['WITHDRAWN', 'EXPIRED', 'APPROVED', 'REJECTED'].includes(r.status) && (
                  <ActionForm action={withdrawConsentAction} hideSuccess className="mt-3"><input type="hidden" name="id" value={r.id} />
                    <SubmitButton size="sm" variant="secondary" confirm={t('m.confirmWithdrawConsent')} data-testid="withdraw-consent">{t('a.withdrawConsent')}</SubmitButton></ActionForm>
                )}
              </li>
            ))}</ul>
          )}
        </Section>}
        side={<Section title={t('p.customerFinance.request')}>
          {leads.length === 0 ? <EmptyState title={t('p.customerFinance.noLead')} /> : (
            <ActionForm action={financeConsentAction} className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>{t('p.customerFinance.step1')}</li><li>{t('p.customerFinance.step2')}</li><li>{t('p.customerFinance.step3')}</li>
              </ol>
              <SelectField name="leadId" label={t('f.project')} required options={leads.map((l) => ({ value: l.id, label: `${l.project_name} · ${l.lead_number}` }))} />
              <Field name="approxAmount" label={t('f.approxAmount')} inputMode="decimal" />
              <SelectField name="contactPreference" label={t('f.contactPreference')} required options={enumOptions(t, 'contactPreference', CONTACT_PREFERENCE)} />
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{t('p.customerFinance.dataShared')}</p>
              <CheckboxField name="consent" required label={t('p.customerFinance.consentText', { version: FINANCE_CONSENT_VERSION })} />
              <SubmitButton data-testid="finance-consent">{t('a.giveConsent')}</SubmitButton>
            </ActionForm>
          )}
        </Section>}
      />
    </>
  );
}
