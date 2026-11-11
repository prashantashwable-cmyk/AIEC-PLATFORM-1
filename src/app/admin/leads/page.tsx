import Link from 'next/link';
import { Plus } from 'lucide-react';
import { FilterBar, FilterSelect, FilterText, Pager, enumOptions } from '@/components/common';
import { Badge, EmptyState, LinkButton, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { LEAD_STATUS } from '@/lib/enums';
import { formatDateTime } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listLeads, listZones } from '@/server/services/leads';

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const [data, zones] = await Promise.all([
    load(() => listLeads(ctx, { status: sp.status, zoneId: sp.zone, q: sp.q, page: Number(sp.page) || 1 })), listZones(),
  ]);
  const now = Date.now();
  return (
    <>
      <PageHeader title={t('nav.leads')} subtitle={t('p.leads.subtitle')}
        actions={ctx.permissions.has('lead.create') ? <LinkButton href="/admin/leads/new" size="sm"><Plus className="size-4" aria-hidden />{t('a.newLead')}</LinkButton> : undefined} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/leads" resetLabel={t('common.reset')}>
        <FilterText name="q" label={t('common.search')} value={sp.q} />
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'leadStatus', LEAD_STATUS)} />
        <FilterSelect name="zone" label={t('f.zone')} value={sp.zone} allLabel={t('common.all')} options={zones.map((z) => ({ value: z.id, label: t(`zone.${z.code}`) }))} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.leadNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.customer')}</Th><Th>{t('f.zone')}</Th><Th>{t('f.requirement')}</Th><Th>{t('common.status')}</Th><Th>{t('f.assignedTo')}</Th><Th>{t('f.created')}</Th></tr></thead>
            <tbody>
              {data.rows.map((l) => {
                const overdue = l.status === 'NEW' && l.response_due_at && new Date(l.response_due_at).getTime() < now;
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <Td><Link href={`/admin/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">{l.lead_number}</Link></Td>
                    <Td>{l.project_name}{l.needs_technical_review && <Badge tone="amber" className="ml-2">{t('m.technicalReview')}</Badge>}</Td>
                    <Td>{l.customer_name}<span className="block text-xs text-slate-500">{displayPhone(l.customer_phone)}</span></Td>
                    <Td>{t(`zone.${l.zone_code}`)}</Td>
                    <Td>{t(`e.liftCategory.${l.lift_category}`)}{l.floors ? <span className="block text-xs text-slate-500">{t('f.floorsN', { count: l.floors })}</span> : null}</Td>
                    <Td>
                      <StatusBadge value={l.status} label={t(`e.leadStatus.${l.status}`)} />
                      {overdue && <Badge tone="red" className="ml-1">{t('m.responseOverdue')}</Badge>}
                      {Number(l.open_duplicates) > 0 && <Badge tone="amber" className="ml-1">{t('m.possibleDuplicate')}</Badge>}
                    </Td>
                    <Td>{l.assignee ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(l.created_at, locale)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/leads', { ...sp, page: p })} />
      </Section>
    </>
  );
}
