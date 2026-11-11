import { OrdersList } from '@/components/views/orders-list';
import { PageHeader } from '@/components/ui';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { listOrders } from '@/server/services/orders';

export default async function PartnerOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('partner');
  const sp = await readParams(searchParams);
  const data = await load(() => listOrders(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (<><PageHeader title={t('nav.orders')} subtitle={t('p.orders.partnerSubtitle')} /><OrdersList t={t} locale={locale} data={data} sp={sp} base="/partner/orders" /></>);
}
