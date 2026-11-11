import { lenderAction, referralUpdateAction } from '@/app/actions/app';
import { FilterBar, FilterSelect, enumOptions } from '@/components/common';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton } from '@/components/ui/form';
import { Alert, Badge, DataList, EmptyState, PageHeader, Section, StatusBadge, Tabs } from '@/components/ui';
import { AGREEMENT_STATUS, INTEGRATION_STATUS, LENDER_TYPE, REFERRAL_STATUS, STATUS_SOURCE, type ReferralStatus } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { REFERRAL_MACHINE } from '@/lib/state';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import type { Rec } from '@/server/db';
import { REFERRAL_FIELDS, listReferrals } from '@/server/services/finance';

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listReferrals(ctx, { status: sp.status }));
  const manage = ctx.permissions.has('finance.referral.manage');
  const tab = sp.tab === 'lenders' ? 'lenders' : 'referrals';
  const lenderForm = (l?: Rec) => (
    <ActionForm action={lenderAction} resetOnSuccess={!l} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Field name="legalName" label={t('f.legalName')} required defaultValue={l?.legal_name ?? ''} />
      <SelectField name="lenderType" label={t('f.type')} required options={enumOptions(t, 'lenderType', LENDER_TYPE)} defaultValue={l?.lender_type ?? 'NBFC'} />
      <Field name="regulatoryReference" label={t('f.regulatoryReference')} defaultValue={l?.regulatory_reference ?? ''} />
      <Field name="contactName" label={t('f.contactName')} defaultValue={l?.contact_name ?? ''} />
      <Field name="contactPhone" label={t('f.contactPhone')} defaultValue={l?.contact_phone ?? ''} />
      <Field name="contactEmail" label={t('f.email')} defaultValue={l?.contact_email ?? ''} />
      <Field name="productCategory" label={t('f.productCategory')} defaultValue={l?.product_category ?? ''} />
      <SelectField name="agreementStatus" label={t('f.agreementStatus')} required options={enumOptions(t, 'agreementStatus', AGREEMENT_STATUS)} defaultValue={l?.agreement_status ?? 'NONE'} />
      <SelectField name="integrationStatus" label={t('f.integrationStatus')} required options={enumOptions(t, 'integrationStatus', INTEGRATION_STATUS)} defaultValue={l?.integration_status ?? 'SANDBOX'} />
      <Field name="agreementStart" type="date" label={t('f.agreementStart')} defaultValue={l?.agreement_start ?? ''} />
      <Field name="agreementEnd" type="date" label={t('f.agreementEnd')} defaultValue={l?.agreement_end ?? ''} />
      <Field name="complianceReviewDate" type="date" label={t('f.complianceReviewDate')} defaultValue={l?.compliance_review_date ?? ''} />
      <Field name="referralChannel" label={t('f.referralChannel')} defaultValue={l?.referral_channel ?? ''} />
      <Field name="feeModel" label={t('f.feeModel')} defaultValue={l?.fee_model ?? ''} />
      <Field name="grievanceRoute" label={t('f.grievanceRoute')} defaultValue={l?.grievance_route ?? ''} />
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="mb-1 text-sm font-medium text-slate-800">{t('f.approvedFields')}</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {REFERRAL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" name="approvedFields[]" value={f} defaultChecked={(l?.approved_fields as string[] | undefined)?.includes(f)} className="size-4 accent-brand-600" />{t(`rf.${f}`)}</label>
          ))}
        </div>
      </fieldset>
      <CheckboxField name="isActive" label={t('f.active')} defaultChecked={l ? l.is_active : true} />
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton variant={l ? 'secondary' : 'primary'}>{l ? t('common.save') : t('a.addLender')}</SubmitButton></div>
    </ActionForm>
  );

  return (
    <>
      <PageHeader title={t('nav.finance')} subtitle={t('p.finance.subtitle')} />
      <Alert tone="amber" className="mb-4" title={t('p.finance.boundaryTitle')}>{t('p.finance.boundary')}</Alert>
      <Tabs active={tab} tabs={[
        { key: 'referrals', label: t('p.finance.referrals'), href: '/admin/finance', count: data.referrals.length },
        { key: 'lenders', label: t('p.finance.lenders'), href: '/admin/finance?tab=lenders', count: data.lenders.length },
      ]} />

      {tab === 'referrals' && (
        <>
          <FilterBar submitLabel={t('common.filter')} resetHref="/admin/finance" resetLabel={t('common.reset')}>
            <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'referralStatus', REFERRAL_STATUS)} />
          </FilterBar>
          {data.referrals.length === 0 ? <Section><EmptyState title={t('common.noData')} hint={t('p.finance.empty')} /></Section> : (
            <div className="space-y-4">{data.referrals.map((r) => {
              const next = REFERRAL_MACHINE[r.status as ReferralStatus].filter((s) => !['WITHDRAWN', 'CONSENTED', 'CONSENT_PENDING'].includes(s));
              return (
                <Section key={r.id} title={`${r.referral_number} · ${r.customer_name}`} actions={<StatusBadge value={r.status} label={t(`e.referralStatus.${r.status}`)} />}>
                  <DataList columns={3} items={[
                    { label: t('f.phone'), value: displayPhone(r.customer_phone) }, { label: t('f.project'), value: `${r.project_name} · ${r.lead_number}` },
                    { label: t('f.approxAmount'), value: formatINR(r.approx_amount, locale) }, { label: t('f.contactPreference'), value: t(`e.contactPreference.${r.contact_preference}`) },
                    { label: t('f.consent'), value: r.consent_at ? `${formatDateTime(r.consent_at, locale)} · ${r.notice_version}${r.withdrawn_at ? ` · ${t('e.referralStatus.WITHDRAWN')}` : ''}` : '—' },
                    { label: t('f.lender'), value: r.lender_name ?? '—' },
                  ]} />
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {data.events.filter((e) => e.referral_id === r.id).map((e) => (
                      <li key={e.id}>{formatDateTime(e.created_at, locale)} · {t(`e.referralStatus.${e.to_status}`)}{e.status_source ? ` · ${t(`e.statusSource.${e.status_source}`)}` : ''}{e.note ? ` · ${e.note}` : ''} · {e.actor ?? t('common.system')}</li>
                    ))}
                  </ul>
                  {manage && next.length > 0 && (
                    <ActionForm action={referralUpdateAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                      <input type="hidden" name="id" value={r.id} />
                      <SelectField name="to" label={t('f.newStatus')} required placeholder={t('common.select')} options={next.map((s) => ({ value: s, label: t(`e.referralStatus.${s}`) }))} />
                      <SelectField name="lenderId" label={t('f.lender')} placeholder={t('common.select')} hint={t('m.lenderForReferral')}
                        options={data.lenders.filter((l) => l.is_active).map((l) => ({ value: l.id, label: `${l.legal_name} (${t(`e.integrationStatus.${l.integration_status}`)})` }))} />
                      <SelectField name="statusSource" label={t('f.statusSource')} placeholder={t('common.select')} options={enumOptions(t, 'statusSource', STATUS_SOURCE)} hint={t('m.neverInferred')} />
                      <Field name="note" label={t('common.notes')} />
                      <div><SubmitButton>{t('a.updateStatus')}</SubmitButton></div>
                    </ActionForm>
                  )}
                </Section>
              );
            })}</div>
          )}
        </>
      )}

      {tab === 'lenders' && (
        <div className="space-y-4">
          <Alert tone="blue">{t('p.finance.gate')}</Alert>
          {data.lenders.map((l) => (
            <Section key={l.id} title={l.legal_name}
              actions={<><Badge tone="blue">{t(`e.lenderType.${l.lender_type}`)}</Badge><StatusBadge value={l.agreement_status} label={t(`e.agreementStatus.${l.agreement_status}`)} />
                <StatusBadge value={l.integration_status} label={t(`e.integrationStatus.${l.integration_status}`)} /></>}
              description={l.agreement_end ? t('m.agreementUntil', { date: formatDate(l.agreement_end, locale) }) : undefined}>
              {ctx.permissions.has('lender.manage') ? lenderForm(l) : null}
            </Section>
          ))}
          {ctx.permissions.has('lender.manage') && <Section title={t('a.addLender')}>{lenderForm()}</Section>}
        </div>
      )}
    </>
  );
}
