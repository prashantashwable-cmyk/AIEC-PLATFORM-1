import { SyncQueue } from '@/components/tech/tech-forms';
import { PageHeader } from '@/components/ui';
import { pageCtx } from '@/server/page';

export default async function SyncPage() {
  const { t } = await pageCtx('tech');
  return (<><PageHeader title={t('nav.sync')} subtitle={t('p.tech.syncSubtitle')} /><SyncQueue /></>);
}
