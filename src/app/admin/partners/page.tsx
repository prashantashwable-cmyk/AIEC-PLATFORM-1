import Link from 'next/link';
import { Plus } from 'lucide-react';
import { FilterBar, FilterSelect, FilterText, Pager, enumOptions } from '@/components/common';
import { Badge, EmptyState, LinkButton, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { COMPANY_CATEGORY, PARTNER_STATUS } from '@/lib/enums';
import { formatDate } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listPartners } from '@/server/services/partners';

export default async function PartnersPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listPartners(ctx, { status: sp.status, category: sp.category, q: sp.q, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.partners')} subtitle={t('p.partners.subtitle')}
        actions={ctx.permissions.has('partner.manage') ? <LinkButton href="/admin/partners/new" size="sm"><Plus className="size-4" aria-hidden />{t('a.newPartner')}</LinkButton> : undefined} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/partners" resetLabel={t('common.reset')}>
        <FilterText name="q" label={t('common.search')} value={sp.q} />
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'partnerStatus', PARTNER_STATUS)} />
        <FilterSelect name="category" label={t('f.category')} value={sp.category} allLabel={t('common.all')} options={enumOptions(t, 'companyCategory', COMPANY_CATEGORY)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.partner')}</Th><Th>{t('f.category')}</Th><Th>{t('common.status')}</Th><Th>{t('f.grade')}</Th><Th>{t('f.capacity')}</Th><Th>{t('f.licenceValidUntil')}</Th><Th>{t('f.insuranceValidUntil')}</Th></tr></thead>
            <tbody>{data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td><Link href={`/admin/partners/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.legal_name}</Link><span className="block text-xs text-slate-500">{c.city}</span></Td>
                <Td>{t(`e.companyCategory.${c.category}`)}</Td>
                <Td><StatusBadge value={c.status} label={t(`e.partnerStatus.${c.status}`)} />{c.safety_block && <Badge tone="red" className="ml-1">{t('f.safetyBlock')}</Badge>}</Td>
                <Td>{t(`e.partnerGrade.${c.grade}`)}</Td>
                <Td>{c.active_projects} / {c.max_concurrent_projects}</Td>
                <Td>{c.licence_expiry ? formatDate(c.licence_expiry, locale) : c.category === 'ELEVATOR_COMPANY' ? <Badge tone="red">{t('m.noValidLicence')}</Badge> : '—'}</Td>
                <Td>{c.insurance_expiry ? formatDate(c.insurance_expiry, locale) : '—'}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/partners', { ...sp, page: p })} />
      </Section>
    </>
  );
}
