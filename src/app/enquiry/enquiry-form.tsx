'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { submitEnquiryAction } from '@/app/actions/public';
import { ActionForm, CheckboxField, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Button, buttonClass } from '@/components/ui';
import { useT } from '@/i18n/client';
import { BUILDING_TYPE, CUSTOMER_TYPE, LIFT_CATEGORY, SITE_READINESS, TIMELINE } from '@/lib/enums';
import { PRIVACY_NOTICE_VERSION } from '@/lib/config';

export function EnquiryForm({
  zones, signedIn, defaults,
}: { zones: Array<{ id: string; code: string }>; signedIn: boolean; defaults?: { name: string; phone: string } }) {
  const t = useT();
  const [done, setDone] = useState<string | null>(null);
  const opts = (group: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`e.${group}.${v}`) }));

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center" data-testid="enquiry-success">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-emerald-950">{t('enquiry.successTitle')}</h2>
        <p className="mt-2 text-sm text-emerald-900">{t('enquiry.successBody', { number: done })}</p>
        <p className="mt-1 text-sm text-emerald-900">{t('enquiry.successNext')}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href={signedIn ? '/app' : '/login'} className={buttonClass('primary')}>{signedIn ? t('site.myAccount') : t('common.login')}</Link>
          <Button variant="secondary" onClick={() => setDone(null)}>{t('enquiry.another')}</Button>
        </div>
      </div>
    );
  }

  return (
    <ActionForm action={submitEnquiryAction} hideSuccess onSuccess={(r) => setDone(String(r.params?.number ?? ''))} className="space-y-8">
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">{t('enquiry.sectionYou')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label={t('enquiry.name')} required autoComplete="name" defaultValue={defaults?.name} readOnly={Boolean(defaults)} />
          <Field name="phone" label={t('enquiry.phone')} required type="tel" inputMode="numeric" autoComplete="tel" hint={t('auth.phoneHint')}
            defaultValue={defaults?.phone} readOnly={Boolean(defaults)} />
          <SelectField name="customerType" label={t('enquiry.customerType')} required options={opts('customerType', CUSTOMER_TYPE)} placeholder={t('common.select')} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">{t('enquiry.sectionProject')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="projectName" label={t('enquiry.projectName')} required />
          <SelectField name="zoneId" label={t('enquiry.zone')} required placeholder={t('common.select')}
            options={zones.map((z) => ({ value: z.id, label: t(`zone.${z.code}`) }))} />
          <TextareaField name="address" label={t('enquiry.address')} required wrapperClassName="sm:col-span-2" rows={2} />
          <SelectField name="buildingType" label={t('enquiry.buildingType')} required options={opts('buildingType', BUILDING_TYPE)} placeholder={t('common.select')} />
          <Field name="floors" label={t('enquiry.floors')} type="number" min={1} max={100} inputMode="numeric" hint={t('enquiry.floorsHint')} />
          <SelectField name="liftCategory" label={t('enquiry.liftCategory')} required options={opts('liftCategory', LIFT_CATEGORY)} placeholder={t('common.select')}
            hint={t('enquiry.complexNote')} />
          <Field name="liftCount" label={t('enquiry.liftCount')} type="number" min={1} max={20} defaultValue={1} inputMode="numeric" />
          <SelectField name="timeline" label={t('enquiry.timeline')} options={opts('timeline', TIMELINE)} defaultValue="UNDECIDED" />
          <SelectField name="siteReadiness" label={t('enquiry.siteReadiness')} options={opts('siteReadiness', SITE_READINESS)} defaultValue="UNKNOWN" />
          <Field name="budget" label={t('enquiry.budget')} inputMode="decimal" />
        </div>
        <CheckboxField name="financeInterest" label={t('enquiry.financeInterest')} hint={t('enquiry.financeNote')} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">{t('enquiry.sectionConsent')}</legend>
        <CheckboxField name="consentContact" label={t('enquiry.consentContact')} required />
        <CheckboxField name="consentPrivacy" label={t('enquiry.consentPrivacy', { version: PRIVACY_NOTICE_VERSION })} required />
        <Link href="/privacy" target="_blank" className="inline-block text-sm font-medium text-brand-700 hover:underline">{t('enquiry.readPrivacy')}</Link>
        <Alert tone="amber">{t('enquiry.noDocs')}</Alert>
      </fieldset>

      <SubmitButton size="lg" variant="accent" data-testid="enquiry-submit">{t('enquiry.submit')}</SubmitButton>
    </ActionForm>
  );
}
