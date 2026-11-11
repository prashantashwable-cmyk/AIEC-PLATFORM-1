import { FilterBar, FilterText, Pager } from '@/components/common';
import { Alert, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listAudit } from '@/server/services/admin';

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listAudit(ctx, { action: sp.action, entity: sp.entity, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.audit')} subtitle={t('p.audit.subtitle')} />
      <Alert tone="blue" className="mb-4">{t('p.audit.appendOnly')}</Alert>
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/audit" resetLabel={t('common.reset')}>
        <FilterText name="action" label={t('f.action')} value={sp.action} /><FilterText name="entity" label={t('f.entity')} value={sp.entity} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} /> : (
          <Table>
            <thead><tr><Th>{t('f.when')}</Th><Th>{t('f.actor')}</Th><Th>{t('f.action')}</Th><Th>{t('f.entity')}</Th><Th>{t('common.details')}</Th></tr></thead>
            <tbody>{data.rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{formatDateTime(a.created_at, locale)}</Td>
                <Td>{a.actor ?? t('common.system')}<span className="block text-xs text-slate-500">{(a.actor_roles as string[]).map((r) => t(`e.role.${r}`)).join(', ')}</span></Td>
                <Td className="font-mono text-xs">{a.action}</Td><Td className="font-mono text-xs">{a.entity_type}</Td>
                <Td className="max-w-md font-mono text-xs break-words text-slate-600">{JSON.stringify(a.details)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} pageSize={data.pageSize} hrefFor={(p) => withParams('/admin/audit', { ...sp, page: p })} />
      </Section>
    </>
  );
}
