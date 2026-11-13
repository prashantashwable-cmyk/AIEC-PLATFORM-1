import { TechWork } from '@/components/tech/tech-work';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getMyWork } from '@/server/services/tech';

export default async function TechHome() {
  const { ctx, t } = await pageCtx('tech');
  const work = await load(() => getMyWork(ctx));
  // Plain JSON for the client component (and for the on-device cache).
  const initial = JSON.parse(JSON.stringify(work));
  return (<><PageHeader title={t('nav.myWork')} subtitle={t('p.tech.subtitle')} /><TechWork initial={initial} /></>);
}
