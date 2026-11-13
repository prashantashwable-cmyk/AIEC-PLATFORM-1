import { NotificationsView } from '@/components/views/notifications-view';
import { pageCtx, readParams, type SearchParams } from '@/server/page';

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('partner');
  const sp = await readParams(searchParams);
  return <NotificationsView ctx={ctx} t={t} locale={locale} page={Number(sp.page) || 1} basePath="/partner/notifications" />;
}
