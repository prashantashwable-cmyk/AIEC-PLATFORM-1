import { ServiceView } from '@/components/views/service-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getServiceOverview } from '@/server/services/service';

export default async function ServicePage() {
  const { ctx, t, locale } = await pageCtx('customer');
  const data = await load(() => getServiceOverview(ctx));
  return (<><PageHeader title={t('nav.customerService')} subtitle={t('p.service.subtitle')} /><ServiceView ctx={ctx} t={t} locale={locale} data={data} mode="customer" /></>);
}
