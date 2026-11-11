import Link from 'next/link';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { QUOTATION_STATUS } from '@/lib/enums';
import { formatDate, formatINR } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listQuotations } from '@/server/services/quotations';

export default async function PartnerQuotationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('partner');
  const sp = await readParams(searchParams);
  const data = await load(() => listQuotations(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.quotations')} subtitle={t('p.quotations.partnerSubtitle')} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/partner/quotations" resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'quotationStatus', QUOTATION_STATUS)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.quotations.partnerEmpty')} /> : (
          <Table>
            <thead><tr><Th>{t('f.quotationNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.version')}</Th><Th>{t('f.total')}</Th><Th>{t('f.validUntil')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{data.rows.map((q) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <Td><Link href={`/partner/quotations/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.quotation_number}</Link></Td>
                <Td>{q.project_name}<span className="block text-xs text-slate-500">{q.lead_number}</span></Td><Td>v{q.version_no}{!q.submitted_at && ` (${t('e.quotationStatus.DRAFT')})`}</Td>
                <Td>{formatINR(q.total_amount, locale)}</Td><Td>{formatDate(q.validity_date, locale)}</Td>
                <Td><StatusBadge value={q.status} label={t(`e.quotationStatus.${q.status}`)} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/partner/quotations', { ...sp, page: p })} />
      </Section>
    </>
  );
}
