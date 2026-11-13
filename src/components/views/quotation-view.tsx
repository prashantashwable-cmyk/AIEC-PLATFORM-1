import { FileLink } from '@/components/common';
import { Alert, Badge, DataList, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import type { Locale } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import type { Rec } from '@/server/db';

export function versionItems(t: TFunction, locale: Locale, v: Rec): Array<{ label: string; value: React.ReactNode }> {
  const dash = (x: unknown) => (x === null || x === undefined || x === '' ? '—' : String(x));
  return [
    { label: t('f.manufacturer'), value: dash(v.manufacturer) }, { label: t('f.model'), value: dash(v.model) },
    { label: t('f.capacity'), value: v.capacity_kg ? `${v.capacity_kg} kg${v.persons ? ` · ${t('f.personsN', { count: v.persons })}` : ''}` : '—' },
    { label: t('f.speed'), value: v.speed_mps ? `${Number(v.speed_mps)} m/s` : '—' },
    { label: t('f.floorsStops'), value: `${dash(v.floors)} / ${dash(v.stops)}` },
    { label: t('f.doorType'), value: dash(v.door_type) }, { label: t('f.controller'), value: dash(v.controller) }, { label: t('f.drive'), value: dash(v.drive) },
    { label: t('f.safetyFeatures'), value: dash(v.safety_features) }, { label: t('f.supplyScope'), value: dash(v.supply_scope) },
    { label: t('f.installationScope'), value: dash(v.installation_scope) }, { label: t('f.civilInclusions'), value: dash(v.civil_electrical_inclusions) },
    { label: t('f.exclusions'), value: dash(v.exclusions) },
    { label: t('f.baseAmount'), value: formatINR(v.base_amount, locale) }, { label: t('f.freight'), value: formatINR(v.freight_amount, locale) },
    { label: t('f.taxes'), value: formatINR(v.tax_amount, locale) }, { label: t('f.total'), value: <strong>{formatINR(v.total_amount, locale)}</strong> },
    { label: t('f.warranty'), value: v.warranty_months === null ? '—' : t('common.months', { count: v.warranty_months }) },
    { label: t('f.amcTerms'), value: dash(v.amc_terms) },
    { label: t('f.deliveryWeeks'), value: v.delivery_weeks === null ? '—' : t('common.weeks', { count: v.delivery_weeks }) },
    { label: t('f.installationWeeks'), value: v.installation_weeks === null ? '—' : t('common.weeks', { count: v.installation_weeks }) },
    { label: t('f.validUntil'), value: formatDate(v.validity_date, locale) },
    { label: t('f.assumptions'), value: dash(v.assumptions) }, { label: t('f.approvalsDependencies'), value: dash(v.approvals_dependencies) },
  ];
}

/** Read-only quotation with every immutable version, its payment milestones and the original partner document. */
export function QuotationView({ t, locale, data }: { t: TFunction; locale: Locale; data: { quotation: Rec; versions: Rec[]; milestones: Rec[]; requests: Rec[] } }) {
  const { quotation: q, versions, milestones, requests } = data;
  return (
    <div className="space-y-5">
      <Section title={`${q.quotation_number} · ${q.legal_name}`}
        actions={<><StatusBadge value={q.status} label={t(`e.quotationStatus.${q.status}`)} />{q.released_to_customer_at && <Badge tone="blue">{t('m.released')}</Badge>}</>}>
        <DataList columns={3} items={[
          { label: t('f.project'), value: `${q.project_name} · ${q.lead_number}` }, { label: t('f.address'), value: q.address }, { label: t('f.zone'), value: t(`zone.${q.zone_code}`) },
        ]} />
        {q.customer_request_note && <Alert tone="amber" className="mt-3" title={t('f.customerRequest')}>{q.customer_request_note}</Alert>}
        {q.partner_response_note && <Alert tone="blue" className="mt-3" title={t('f.partnerResponse')}>{q.partner_response_note}</Alert>}
      </Section>
      {versions.map((v) => (
        <Section key={v.id} title={t('f.versionN', { n: v.version_no })}
          description={v.submitted_at ? t('m.versionSubmitted', { date: formatDateTime(v.submitted_at, locale) }) : t('m.versionDraft')}
          actions={<FileLink id={v.original_file_id} label={t('f.originalQuotation')} />}>
          <DataList columns={3} items={versionItems(t, locale, v)} />
          <h3 className="mt-4 mb-2 text-sm font-semibold">{t('f.paymentMilestones')}</h3>
          <Table className="max-w-lg">
            <thead><tr><Th>#</Th><Th>{t('f.milestone')}</Th><Th>%</Th><Th>{t('f.amount')}</Th></tr></thead>
            <tbody>{milestones.filter((m) => m.version_id === v.id).map((m) => (
              <tr key={m.id}><Td>{m.seq}</Td><Td>{m.name}</Td><Td>{Number(m.percent)}%</Td><Td>{formatINR(Math.round(Number(v.total_amount) * Number(m.percent)) / 100, locale)}</Td></tr>
            ))}</tbody>
          </Table>
        </Section>
      ))}
      {requests.length > 0 && (
        <Section title={t('p.quotation.customerActions')}>
          <ul className="space-y-2 text-sm">{requests.map((r, i) => (
            <li key={i}><Badge tone="blue">{t(`e.selectionAction.${r.action}`)}</Badge> {r.version_no ? `v${r.version_no} · ` : ''}{formatDateTime(r.created_at, locale)}{r.note ? ` — ${r.note}` : ''}</li>
          ))}</ul>
        </Section>
      )}
    </div>
  );
}
