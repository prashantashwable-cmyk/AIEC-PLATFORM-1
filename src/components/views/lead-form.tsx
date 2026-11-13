'use client';

import type { FormAction } from '@/components/ui/form';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { useT } from '@/i18n/client';
import { PRIVACY_NOTICE_VERSION } from '@/lib/config';
import { BUILDING_TYPE, CUSTOMER_TYPE, LEAD_SOURCE, LIFT_CATEGORY, SITE_READINESS, TIMELINE } from '@/lib/enums';

/** Lead capture form. `mode="staff"` adds customer identity and source; `mode="customer"` uses the signed-in account. */
export function LeadForm({ action, zones, mode }: { action: FormAction; zones: Array<{ id: string; code: string }>; mode: 'staff' | 'customer' }) {
  const t = useT();
  const opts = (group: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`e.${group}.${v}`) }));
  return (
    <ActionForm action={action} className="space-y-6">
      {mode === 'staff' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label={t('enquiry.name')} required />
          <Field name="phone" label={t('enquiry.phone')} required type="tel" inputMode="numeric" hint={t('auth.phoneHint')} />
          <SelectField name="customerType" label={t('f.customerType')} required options={opts('customerType', CUSTOMER_TYPE)} placeholder={t('common.select')} />
          <SelectField name="source" label={t('f.source')} required options={opts('leadSource', LEAD_SOURCE.filter((s) => s !== 'WEBSITE' && s !== 'CUSTOMER_APP'))} defaultValue="PHONE" />
          <Field name="referralNote" label={t('f.referralNote')} wrapperClassName="sm:col-span-2" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="projectName" label={t('enquiry.projectName')} required />
        <SelectField name="zoneId" label={t('enquiry.zone')} required placeholder={t('common.select')} options={zones.map((z) => ({ value: z.id, label: t(`zone.${z.code}`) }))} />
        <TextareaField name="address" label={t('enquiry.address')} required rows={2} wrapperClassName="sm:col-span-2" />
        <SelectField name="buildingType" label={t('enquiry.buildingType')} required options={opts('buildingType', BUILDING_TYPE)} placeholder={t('common.select')} />
        <Field name="floors" label={t('enquiry.floors')} type="number" min={1} max={100} hint={t('enquiry.floorsHint')} />
        <SelectField name="liftCategory" label={t('enquiry.liftCategory')} required options={opts('liftCategory', LIFT_CATEGORY)} placeholder={t('common.select')} hint={t('enquiry.complexNote')} />
        <Field name="liftCount" label={t('enquiry.liftCount')} type="number" min={1} max={20} defaultValue={1} />
        <SelectField name="timeline" label={t('enquiry.timeline')} options={opts('timeline', TIMELINE)} defaultValue="UNDECIDED" />
        <SelectField name="siteReadiness" label={t('enquiry.siteReadiness')} options={opts('siteReadiness', SITE_READINESS)} defaultValue="UNKNOWN" />
        <Field name="budget" label={t('enquiry.budget')} inputMode="decimal" />
      </div>
      <CheckboxField name="financeInterest" label={t('enquiry.financeInterest')} hint={t('enquiry.financeNote')} />
      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <CheckboxField name="consentContact" required label={mode === 'staff' ? t('m.staffConsentContact') : t('enquiry.consentContact')} />
        <CheckboxField name="consentPrivacy" required label={mode === 'staff' ? t('m.staffConsentPrivacy', { version: PRIVACY_NOTICE_VERSION }) : t('enquiry.consentPrivacy', { version: PRIVACY_NOTICE_VERSION })} />
      </div>
      <SubmitButton>{t('a.createLead')}</SubmitButton>
    </ActionForm>
  );
}
