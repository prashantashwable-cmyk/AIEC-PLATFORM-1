import { OrderView } from '@/components/views/order-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getOrder } from '@/server/services/orders';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const data = await load(() => getOrder(ctx, id));
  return (<><PageHeader title={`${t('f.order')} ${data.order.order_number}`} back={{ href: '/admin/orders', label: t('nav.orders') }} /><OrderView ctx={ctx} t={t} locale={locale} data={data} mode="staff" /></>);
}
