'use client';

import { useState } from 'react';
import { saveQuotationAction } from '@/app/actions/app';
import { ActionForm, Field, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatINR } from '@/lib/format';

type V = Record<string, string | number | null | undefined>;

/** Standard quotation form (spec 5.7). Totals and the milestone percentage are computed live; the server re-validates everything. */
export function QuotationBuilder({ id, version, milestones }: { id: string; version: V; milestones: Array<{ name: string; percent: string }> }) {
  const { t, locale } = useI18n();
  const v = (k: string) => (version[k] === null || version[k] === undefined ? '' : String(version[k]));
  const [amounts, setAmounts] = useState({ base: v('base_amount'), freight: v('freight_amount') || '0', tax: v('tax_amount') || '0' });
  const [rows, setRows] = useState(() => {
    const filled = milestones.map((m) => ({ ...m }));
    while (filled.length < 6) filled.push({ name: '', percent: '' });
    return filled;
  });
  const total = (Number(amounts.base) || 0) + (Number(amounts.freight) || 0) + (Number(amounts.tax) || 0);
  const percent = rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  const text = (name: string, key: string, required = true) => <TextareaField name={name} label={t(`f.${name}`)} defaultValue={v(key)} rows={2} required={required} />;

  return (
    <ActionForm action={saveQuotationAction} resetOnSuccess={false} className="space-y-6">
      <input type="hidden" name="id" value={id} />
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{t('p.quotation.product')}</legend>
        <Field name="manufacturer" label={t('f.manufacturer')} defaultValue={v('manufacturer')} required />
        <Field name="model" label={t('f.model')} defaultValue={v('model')} required />
        <Field name="capacityKg" type="number" label={t('f.capacityKg')} defaultValue={v('capacity_kg')} required />
        <Field name="persons" type="number" label={t('f.persons')} defaultValue={v('persons')} />
        <Field name="speedMps" inputMode="decimal" label={t('f.speedMps')} defaultValue={v('speed_mps')} required />
        <Field name="floors" type="number" label={t('f.floors')} defaultValue={v('floors')} required />
        <Field name="stops" type="number" label={t('f.stops')} defaultValue={v('stops')} required />
        <Field name="doorType" label={t('f.doorType')} defaultValue={v('door_type')} required />
        <Field name="controller" label={t('f.controller')} defaultValue={v('controller')} required />
        <Field name="drive" label={t('f.drive')} defaultValue={v('drive')} required />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{t('p.quotation.scope')}</legend>
        {text('safetyFeatures', 'safety_features')}{text('supplyScope', 'supply_scope')}{text('installationScope', 'installation_scope')}
        {text('civilElectricalInclusions', 'civil_electrical_inclusions', false)}{text('exclusions', 'exclusions')}{text('assumptions', 'assumptions')}
        {text('approvalsDependencies', 'approvals_dependencies')}{text('amcTerms', 'amc_terms', false)}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{t('p.quotation.commercial')}</legend>
        <Field name="baseAmount" inputMode="decimal" label={t('f.baseAmount')} value={amounts.base} onChange={(e) => setAmounts({ ...amounts, base: e.target.value })} required />
        <Field name="freightAmount" inputMode="decimal" label={t('f.freight')} value={amounts.freight} onChange={(e) => setAmounts({ ...amounts, freight: e.target.value })} />
        <Field name="taxAmount" inputMode="decimal" label={t('f.taxes')} value={amounts.tax} onChange={(e) => setAmounts({ ...amounts, tax: e.target.value })} />
        <div><p className="mb-1 text-sm font-medium text-slate-800">{t('f.total')}</p><p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold" data-testid="quote-total">{formatINR(total, locale)}</p></div>
        <Field name="warrantyMonths" type="number" label={t('f.warrantyMonths')} defaultValue={v('warranty_months')} required />
        <Field name="deliveryWeeks" type="number" label={t('f.deliveryWeeks')} defaultValue={v('delivery_weeks')} required />
        <Field name="installationWeeks" type="number" label={t('f.installationWeeks')} defaultValue={v('installation_weeks')} required />
        <Field name="validityDate" type="date" label={t('f.validUntil')} defaultValue={v('validity_date')} required />
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">{t('f.paymentMilestones')}</legend>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
              <Field name="milestoneName[]" aria-label={t('f.milestone')} placeholder={`${t('f.milestone')} ${i + 1}`} value={r.name} onChange={(e) => setRows(rows.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} />
              <Field name="milestonePercent[]" aria-label="%" placeholder="%" inputMode="decimal" value={r.percent} onChange={(e) => setRows(rows.map((x, n) => (n === i ? { ...x, percent: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <p className={`mt-2 text-sm font-medium ${percent === 100 ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="milestone-total">{t('m.milestoneTotal', { percent })}</p>
      </fieldset>
      <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.originalQuotation')} hint={t('f.fileHint')} />
      <Alert tone="blue">{t('p.quotation.immutableNote')}</Alert>
      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="secondary">{t('a.saveDraft')}</SubmitButton>
        <SubmitButton name="submit" value="1" confirm={t('m.confirmSubmitQuotation')} data-testid="submit-quotation">{t('a.submitQuotation')}</SubmitButton>
      </div>
    </ActionForm>
  );
}
