import {
  addInsuranceAction, addLicenceAction, governanceAction, partnerDocReviewAction, partnerStatusAction, performanceEventAction, setAreasAction,
  setCapabilityAction, submitCompanyAction, updateCompanyAction, verifyCapabilityAction,
} from '@/app/actions/app';
import { Check, FileLink, Split, Timeline, enumOptions } from '@/components/common';
import { CompanyForm } from '@/components/views/company-form';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, DataList, EmptyState, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { INSURANCE_TYPE, LICENSE_TYPE, LIFT_CATEGORY, PARTNER_GRADE, type Locale, type PartnerStatus } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR, isoDateIST } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { PARTNER_MACHINE } from '@/lib/state';
import type { Ctx } from '@/server/ctx';
import type { Rec } from '@/server/db';

type Profile = {
  company: Rec; licences: Rec[]; insurance: Rec[]; capabilities: Rec[]; areas: Rec[]; reviews: Rec[]; performance: Rec[]; team: Rec[];
  facts: { licenceDaysLeft: number | null; insuranceDaysLeft: number | null };
};

/** Partner company record: onboarding documents, capability, capacity and (for AIEC staff) verification controls. */
export function CompanyView({
  ctx, t, locale, profile, zones, mode,
}: { ctx: Ctx; t: TFunction; locale: Locale; profile: Profile; zones: Array<{ id: string; code: string; is_active: boolean }>; mode: 'staff' | 'partner' }) {
  const { company: c, licences, insurance, capabilities, areas, reviews, performance, team, facts } = profile;
  const staff = mode === 'staff';
  const can = (p: string) => ctx.permissions.has(p);
  const canEdit = staff ? can('partner.manage') : can('company.manage');
  const canVerify = staff && can('partner.verify');
  const canActivate = staff && can('partner.activate');
  const liftCo = c.category === 'ELEVATOR_COMPANY';
  const today = isoDateIST();
  const companyField = staff ? <input type="hidden" name="companyId" value={c.id} /> : null;
  const nextStatuses = PARTNER_MACHINE[c.status as PartnerStatus].filter((to) =>
    ['ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED', 'UNDER_RENEWAL'].includes(to) ? canActivate : canVerify && to !== 'SUBMITTED');
  const areaIds = new Set(areas.map((a) => a.id));

  const docTable = (rows: Rec[], kind: 'licence' | 'insurance') => rows.length === 0 ? <EmptyState title={t('common.noData')} /> : (
    <Table>
      <thead><tr><Th>{t('f.type')}</Th><Th>{t('f.number')}</Th><Th>{t(kind === 'licence' ? 'f.authority' : 'f.insurer')}</Th><Th>{t('f.validity')}</Th><Th>{t('common.status')}</Th><Th>{t('f.document')}</Th>{canVerify && <Th />}</tr></thead>
      <tbody>{rows.map((d) => {
        const expired = d.expiry_date < today;
        return (
          <tr key={d.id}>
            <Td>{kind === 'licence' ? t(`e.licenseType.${d.license_type}`) : t(`e.insuranceType.${d.policy_type}`)}</Td>
            <Td>{kind === 'licence' ? d.license_number : d.policy_number}{kind === 'insurance' && d.cover_amount ? <span className="block text-xs text-slate-500">{formatINR(d.cover_amount, locale)}</span> : null}</Td>
            <Td>{kind === 'licence' ? d.authority : d.insurer}</Td>
            <Td className="whitespace-nowrap">{formatDate(d.issue_date, locale)} – {formatDate(d.expiry_date, locale)}{expired && <Badge tone="red" className="ml-1">{t('e.partnerStatus.EXPIRED')}</Badge>}</Td>
            <Td><StatusBadge value={d.verification_status} label={t(`e.verificationStatus.${d.verification_status}`)} />{d.rejection_reason && <span className="block text-xs text-slate-500">{d.rejection_reason}</span>}</Td>
            <Td><FileLink id={d.file_id} label={t('common.view')} /></Td>
            {canVerify && <Td>{d.verification_status === 'PENDING' && (
              <ActionForm action={partnerDocReviewAction} hideSuccess className="flex min-w-48 flex-col gap-1.5">
                <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={d.id} />
                <Field name="reason" placeholder={t('f.rejectionReason')} aria-label={t('f.rejectionReason')} />
                <div className="flex gap-1.5">
                  <SubmitButton size="sm" variant="success" name="approve" value="yes">{t('a.verify')}</SubmitButton>
                  <SubmitButton size="sm" variant="secondary" name="approve" value="no">{t('a.reject')}</SubmitButton>
                </div>
              </ActionForm>
            )}</Td>}
          </tr>
        );
      })}</tbody>
    </Table>
  );

  return (
    <Split
      main={<>
        {c.status === 'DRAFT' && !staff && <Alert tone="blue" title={t('p.company.draftTitle')}>{t('p.company.draftBody')}</Alert>}
        {c.status === 'REJECTED' && <Alert tone="red" title={t('e.partnerStatus.REJECTED')}>{c.status_reason}</Alert>}
        {c.safety_block && <Alert tone="red" title={t('f.safetyBlock')}>{c.safety_block_reason}</Alert>}

        <Section title={t('p.company.profile')}>
          {canEdit
            ? <CompanyForm action={updateCompanyAction} company={c} companyId={staff ? c.id : undefined} lockCategory={!staff} submitLabel={t('common.save')} />
            : <DataList columns={3} items={[{ label: t('f.legalName'), value: c.legal_name }, { label: t('f.category'), value: t(`e.companyCategory.${c.category}`) }, { label: t('f.city'), value: c.city }]} />}
        </Section>

        <Section title={t('p.company.licences')} description={t('p.company.licencesNote')}>
          {docTable(licences, 'licence')}
          {canEdit && (
            <ActionForm action={addLicenceAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {companyField}
              <SelectField name="licenseType" label={t('f.type')} required options={enumOptions(t, 'licenseType', LICENSE_TYPE)} />
              <Field name="licenseNumber" label={t('f.number')} required />
              <Field name="authority" label={t('f.authority')} required />
              <Field name="state" label={t('f.state')} defaultValue="Maharashtra" required />
              <Field name="issueDate" type="date" label={t('f.issueDate')} required />
              <Field name="expiryDate" type="date" label={t('f.expiryDate')} required />
              <Field name="scope" label={t('f.scope')} />
              <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.document')} required hint={t('f.fileHint')} />
              <div className="flex items-end"><SubmitButton variant="secondary">{t('a.addLicence')}</SubmitButton></div>
            </ActionForm>
          )}
        </Section>

        <Section title={t('p.company.insurance')}>
          {docTable(insurance, 'insurance')}
          {canEdit && (
            <ActionForm action={addInsuranceAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {companyField}
              <SelectField name="policyType" label={t('f.type')} required options={enumOptions(t, 'insuranceType', INSURANCE_TYPE)} />
              <Field name="insurer" label={t('f.insurer')} required />
              <Field name="policyNumber" label={t('f.number')} required />
              <Field name="coverAmount" label={t('f.coverAmount')} inputMode="decimal" />
              <Field name="issueDate" type="date" label={t('f.issueDate')} required />
              <Field name="expiryDate" type="date" label={t('f.expiryDate')} required />
              <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.document')} required hint={t('f.fileHint')} />
              <div className="flex items-end"><SubmitButton variant="secondary">{t('a.addInsurance')}</SubmitButton></div>
            </ActionForm>
          )}
        </Section>

        <Section title={t('p.company.capabilities')} description={t('p.company.capabilitiesNote')}>
          {capabilities.length === 0 ? <EmptyState title={t('common.noData')} /> : (
            <Table>
              <thead><tr><Th>{t('f.liftCategory')}</Th><Th>{t('f.maxFloors')}</Th><Th>{t('common.status')}</Th>{canVerify && <Th />}</tr></thead>
              <tbody>{capabilities.map((cap) => (
                <tr key={cap.lift_category}>
                  <Td>{t(`e.liftCategory.${cap.lift_category}`)}</Td><Td>{cap.max_floors}</Td>
                  <Td><StatusBadge value={cap.verified ? 'VERIFIED' : 'PENDING'} label={t(`e.verificationStatus.${cap.verified ? 'VERIFIED' : 'PENDING'}`)} /></Td>
                  {canVerify && <Td>
                    <ActionForm action={verifyCapabilityAction} hideSuccess>
                      <input type="hidden" name="companyId" value={c.id} /><input type="hidden" name="liftCategory" value={cap.lift_category} />
                      <SubmitButton size="sm" variant={cap.verified ? 'secondary' : 'success'} name="verified" value={cap.verified ? 'no' : 'yes'}>{t(cap.verified ? 'a.unverify' : 'a.verify')}</SubmitButton>
                    </ActionForm>
                  </Td>}
                </tr>
              ))}</tbody>
            </Table>
          )}
          {canEdit && (
            <ActionForm action={setCapabilityAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              {companyField}
              <SelectField name="liftCategory" label={t('f.liftCategory')} required options={enumOptions(t, 'liftCategory', LIFT_CATEGORY)} />
              <Field name="maxFloors" type="number" min={1} max={100} label={t('f.maxFloors')} required wrapperClassName="w-32" />
              <SubmitButton variant="secondary">{t('a.saveCapability')}</SubmitButton>
            </ActionForm>
          )}
        </Section>

        <Section title={t('p.company.areas')} description={t('p.company.areasNote')}>
          {canEdit ? (
            <ActionForm action={setAreasAction} resetOnSuccess={false} className="space-y-4">
              {companyField}
              <fieldset className="grid gap-2 sm:grid-cols-3">
                <legend className="sr-only">{t('p.company.areas')}</legend>
                {zones.map((z) => (
                  <label key={z.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="zoneIds[]" value={z.id} defaultChecked={areaIds.has(z.id)} className="size-4 accent-brand-600" />
                    {t(`zone.${z.code}`)}{!z.is_active && <Badge tone="gray">{t('m.zoneNotActive')}</Badge>}
                  </label>
                ))}
              </fieldset>
              <Field name="maxConcurrentProjects" type="number" min={0} max={50} label={t('f.maxConcurrentProjects')} defaultValue={c.max_concurrent_projects} required wrapperClassName="w-56"
                hint={t('m.activeProjectsNow', { count: c.active_projects })} />
              <SubmitButton variant="secondary">{t('common.save')}</SubmitButton>
            </ActionForm>
          ) : <p className="text-sm">{areas.map((a) => t(`zone.${a.code}`)).join(', ') || '—'}</p>}
        </Section>

        <Section title={t('p.company.team')}>
          {team.length === 0 ? <EmptyState title={t('common.noData')} /> : (
            <Table><thead><tr><Th>{t('f.name')}</Th><Th>{t('f.phone')}</Th><Th>{t('f.role')}</Th></tr></thead>
              <tbody>{team.map((m) => <tr key={`${m.id}-${m.role_code}`}><Td>{m.full_name}</Td><Td>{displayPhone(m.phone)}</Td><Td>{t(`e.role.${m.role_code}`)}</Td></tr>)}</tbody></Table>
          )}
        </Section>
      </>}
      side={<>
        <Section title={t('p.company.verification')}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge value={c.status} label={t(`e.partnerStatus.${c.status}`)} />
            <Badge tone={c.grade === 'UNGRADED' ? 'gray' : 'green'}>{t(`e.partnerGrade.${c.grade}`)}</Badge>
          </div>
          <ul className="space-y-1.5">
            {liftCo && <Check ok={facts.licenceDaysLeft !== null} label={t('og.licence')} hint={facts.licenceDaysLeft !== null ? t('common.days', { count: facts.licenceDaysLeft }) : t('err.LICENCE_INVALID')} />}
            {liftCo && <Check ok={facts.insuranceDaysLeft !== null} label={t('og.insurance')} hint={facts.insuranceDaysLeft !== null ? t('common.days', { count: facts.insuranceDaysLeft }) : t('err.INSURANCE_INVALID')} />}
            {liftCo && <Check ok={capabilities.some((x) => x.verified)} label={t('p.company.capabilityVerified')} />}
            <Check ok={areas.length > 0} label={t('p.company.areasSet')} />
            <Check ok={Boolean(c.agreement_signed_on)} label={t('p.company.agreementSigned')} hint={c.agreement_signed_on ? `${formatDate(c.agreement_signed_on, locale)} · ${c.agreement_reference ?? ''}` : undefined} />
            <Check ok={!c.safety_block} label={t('p.company.noSafetyBlock')} />
          </ul>
          {!staff && can('company.manage') && ['DRAFT', 'REJECTED'].includes(c.status) && (
            <ActionForm action={submitCompanyAction} className="mt-4"><SubmitButton confirm={t('m.confirmSubmitCompany')}>{t('a.submitForReview')}</SubmitButton></ActionForm>
          )}
          {nextStatuses.length > 0 && (
            <ActionForm action={partnerStatusAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={c.id} />
              <SelectField name="to" label={t('f.newStatus')} required placeholder={t('common.select')} options={nextStatuses.map((v) => ({ value: v, label: t(`e.partnerStatus.${v}`) }))} />
              <TextareaField name="note" label={t('f.reason')} rows={2} />
              <SubmitButton confirm={t('m.confirmStatusChange')}>{t('a.changeStatus')}</SubmitButton>
            </ActionForm>
          )}
        </Section>

        {canActivate && (
          <Section title={t('p.company.governance')} description={t('p.company.gradeNote')}>
            <ActionForm action={governanceAction} resetOnSuccess={false} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <Field name="agreementSignedOn" type="date" label={t('f.agreementSignedOn')} defaultValue={c.agreement_signed_on ?? ''} />
              <Field name="agreementReference" label={t('f.agreementReference')} defaultValue={c.agreement_reference ?? ''} />
              <SelectField name="grade" label={t('f.grade')} options={enumOptions(t, 'partnerGrade', PARTNER_GRADE)} defaultValue={c.grade} />
              <SelectField name="safetyBlock" label={t('f.safetyBlock')} defaultValue={c.safety_block ? 'yes' : 'no'} options={[{ value: 'no', label: t('common.no') }, { value: 'yes', label: t('common.yes') }]} />
              <Field name="safetyBlockReason" label={t('f.reason')} defaultValue={c.safety_block_reason ?? ''} />
              <SubmitButton variant="secondary">{t('common.save')}</SubmitButton>
            </ActionForm>
          </Section>
        )}

        <Section title={t('p.company.performance')} description={t('p.company.performanceNote')}>
          {performance.length === 0 ? <EmptyState title={t('p.company.noPerformance')} /> : (
            <ul className="space-y-2 text-sm">{performance.slice(0, 12).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2"><span>{t(`perf.${e.event_type}`)}<span className="block text-xs text-slate-500">{formatDate(e.created_at, locale)} · {e.note}</span></span><Badge tone={e.score >= 70 ? 'green' : e.score >= 40 ? 'amber' : 'red'}>{e.score}</Badge></li>
            ))}</ul>
          )}
          {canVerify && (
            <ActionForm action={performanceEventAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <input type="hidden" name="companyId" value={c.id} />
              <SelectField name="eventType" label={t('f.type')} required options={['CUSTOMER_RATING', 'PROJECT_ON_TIME', 'PROJECT_DELAYED', 'QC_PASS', 'QC_FAIL', 'COMPLAINT', 'SAFETY_INCIDENT'].map((v) => ({ value: v, label: t(`perf.${v}`) }))} />
              <Field name="score" type="number" min={0} max={100} label={t('f.score0to100')} required />
              <Field name="note" label={t('f.evidenceNote')} required />
              <SubmitButton variant="secondary">{t('common.add')}</SubmitButton>
            </ActionForm>
          )}
        </Section>

        <Section title={t('p.company.reviewHistory')}>
          {reviews.length === 0 ? <EmptyState title={t('common.noData')} /> : (
            <Timeline items={reviews.map((r) => ({
              key: r.id, title: t(`e.partnerStatus.${r.to_status}`), meta: `${formatDateTime(r.created_at, locale)} · ${r.reviewer ?? t('common.system')}`, body: r.note ?? undefined,
            }))} />
          )}
        </Section>
      </>}
    />
  );
}
