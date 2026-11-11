import { ProjectsList } from '@/components/views/projects-list';
import { PageHeader } from '@/components/ui';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { listProjects } from '@/server/services/projects';

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listProjects(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (<><PageHeader title={t('nav.projects')} subtitle={t('p.projects.subtitle')} /><ProjectsList t={t} locale={locale} data={data} sp={sp} base="/admin/projects" /></>);
}
