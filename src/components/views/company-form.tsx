'use client';

import type { FormAction } from '@/components/ui/form';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { useT } from '@/i18n/client';
import { COMPANY_CATEGORY, ENTITY_TYPE } from '@/lib/enums';

type Company = Record<string, string | null | undefined>;

/** Company profile form used for registration (staff or self) and for later edits. */
export function CompanyForm({
  action, company, companyId, withAdmin = false, lockCategory = false, submitLabel,
}: { action: FormAction; company?: Company; companyId?: string; withAdmin?: boolean; lockCategory?: boolean; submitLabel: string }) {
  const t = useT();
  const c = company ?? {};
  const opts = (group: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`e.${group}.${v}`) }));
  return (
    <ActionForm action={action} resetOnSuccess={false} className="space-y-4">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="legalName" label={t('f.legalName')} required defaultValue={c.legal_name ?? ''} />
        <Field name="tradeName" label={t('f.tradeName')} defaultValue={c.trade_name ?? ''} />
        {lockCategory
          ? <input type="hidden" name="category" value={c.category ?? 'ELEVATOR_COMPANY'} />
          : <SelectField name="category" label={t('f.category')} required options={opts('companyCategory', COMPANY_CATEGORY)} defaultValue={c.category ?? 'ELEVATOR_COMPANY'} />}
        <SelectField name="entityType" label={t('f.entityType')} required options={opts('entityType', ENTITY_TYPE)} defaultValue={c.entity_type ?? 'PRIVATE_LIMITED'} />
        <Field name="pan" label={t('f.pan')} defaultValue={c.pan ?? ''} maxLength={10} hint={t('f.panHint')} />
        <Field name="gstin" label={t('f.gstin')} defaultValue={c.gstin ?? ''} maxLength={15} />
        <TextareaField name="address" label={t('f.address')} defaultValue={c.address ?? ''} rows={2} wrapperClassName="sm:col-span-2" />
        <Field name="city" label={t('f.city')} defaultValue={c.city ?? ''} />
        <Field name="signatoryName" label={t('f.signatoryName')} defaultValue={c.signatory_name ?? ''} />
        <Field name="contactPhone" label={t('f.contactPhone')} type="tel" defaultValue={c.contact_phone ?? ''} />
        <Field name="contactEmail" label={t('f.email')} type="email" defaultValue={c.contact_email ?? ''} />
        <TextareaField name="warrantyPolicy" label={t('f.warrantyPolicy')} defaultValue={c.warranty_policy ?? ''} rows={2} />
        <TextareaField name="safetyProcedures" label={t('f.safetyProcedures')} defaultValue={c.safety_procedures ?? ''} rows={2} />
        <TextareaField name="referencesNote" label={t('f.referencesNote')} defaultValue={c.references_note ?? ''} rows={2} wrapperClassName="sm:col-span-2" />
      </div>
      {withAdmin && (
        <div className="grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <Field name="adminName" label={t('f.adminName')} required />
          <Field name="adminPhone" label={t('f.adminPhone')} type="tel" required hint={t('auth.phoneHint')} />
        </div>
      )}
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
