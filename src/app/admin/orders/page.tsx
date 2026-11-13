import { OrdersList } from '@/components/views/orders-list';
import { PageHeader } from '@/components/ui';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { listOrders } from '@/server/services/orders';

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listOrders(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (<><PageHeader title={t('nav.orders')} subtitle={t('p.orders.subtitle')} /><OrdersList t={t} locale={locale} data={data} sp={sp} base="/admin/orders" /></>);
}
