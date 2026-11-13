import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { CollectionsTable } from '@/components/views/collections-table';
import { Alert, PageHeader, Section } from '@/components/ui';
import { COLLECTION_STATUS } from '@/lib/enums';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listCollections } from '@/server/services/money';

export default async function CollectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listCollections(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.collections')} subtitle={t('p.collections.subtitle')} />
      <Alert tone="blue" className="mb-4">{t('p.collections.rule')}</Alert>
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/collections" resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'collectionStatus', COLLECTION_STATUS)} />
      </FilterBar>
      <Section>
        <CollectionsTable t={t} locale={locale} rows={data.rows} reconcile={ctx.permissions.has('payment.reconcile')} />
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/collections', { ...sp, page: p })} />
      </Section>
    </>
  );
}
