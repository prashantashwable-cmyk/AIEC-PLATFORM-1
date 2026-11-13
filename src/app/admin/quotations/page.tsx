import Link from 'next/link';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { Badge, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { QUOTATION_STATUS } from '@/lib/enums';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listQuotations } from '@/server/services/quotations';

export default async function QuotationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listQuotations(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.quotations')} subtitle={t('p.quotations.subtitle')} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/quotations" resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'quotationStatus', QUOTATION_STATUS)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.quotationNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.version')}</Th><Th>{t('f.total')}</Th><Th>{t('f.validUntil')}</Th><Th>{t('common.status')}</Th><Th>{t('f.updated')}</Th></tr></thead>
            <tbody>{data.rows.map((q) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <Td><Link href={`/admin/quotations/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.quotation_number}</Link></Td>
                <Td><Link href={`/admin/leads/${q.lead_id}`} className="hover:underline">{q.project_name}</Link><span className="block text-xs text-slate-500">{q.lead_number}</span></Td>
                <Td>{q.legal_name}</Td><Td>{q.version_no ? `v${q.version_no}` : '—'}</Td>
                <Td>{q.submitted_at ? formatINR(q.total_amount, locale) : '—'}</Td><Td>{formatDate(q.validity_date, locale)}</Td>
                <Td><StatusBadge value={q.status} label={t(`e.quotationStatus.${q.status}`)} />{q.released_to_customer_at && <Badge tone="blue" className="ml-1">{t('m.released')}</Badge>}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(q.updated_at, locale)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/quotations', { ...sp, page: p })} />
      </Section>
    </>
  );
}
