import { HazardForm } from '@/components/tech/tech-forms';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getMyWork } from '@/server/services/tech';

export default async function HazardPage() {
  const { ctx, t } = await pageCtx('tech');
  const { projects } = await load(() => getMyWork(ctx));
  return (<><PageHeader title={t('nav.hazard')} subtitle={t('p.tech.hazardSubtitle')} /><HazardForm projects={projects.map((p) => ({ id: p.id, label: `${p.project_number} · ${p.project_name}` }))} /></>);
}
