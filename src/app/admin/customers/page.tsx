import Link from 'next/link';
import { FilterBar, FilterText, Pager } from '@/components/common';
import { Badge, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listCustomers } from '@/server/services/admin';

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listCustomers(ctx, { q: sp.q, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.customers')} subtitle={t('p.customers.subtitle')} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/customers" resetLabel={t('common.reset')}>
        <FilterText name="q" label={t('common.search')} value={sp.q} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.name')}</Th><Th>{t('f.phone')}</Th><Th>{t('f.customerType')}</Th><Th>{t('nav.leads')}</Th><Th>{t('nav.projects')}</Th><Th>{t('f.account')}</Th><Th>{t('f.created')}</Th></tr></thead>
            <tbody>{data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="font-medium">{c.name}</Td><Td>{displayPhone(c.phone)}</Td><Td>{t(`e.customerType.${c.customer_type}`)}</Td>
                <Td><Link href={withParams('/admin/leads', { q: c.phone.slice(3) })} className="text-brand-700 hover:underline">{c.lead_count}</Link></Td>
                <Td>{c.project_count}</Td>
                <Td><Badge tone={c.has_account ? 'green' : 'gray'}>{c.has_account ? t('m.hasAccount') : t('m.noAccount')}</Badge></Td>
                <Td>{formatDate(c.created_at, locale)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/customers', { ...sp, page: p })} />
      </Section>
    </>
  );
}
