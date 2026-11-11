import { ProjectView } from '@/components/views/project-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { getProject } from '@/server/services/projects';

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => getProject(ctx, id));
  return (
    <>
      <PageHeader title={`${data.project.project_name} · ${data.project.project_number}`} back={{ href: '/admin/projects', label: t('nav.projects') }} />
      <ProjectView ctx={ctx} t={t} locale={locale} data={data} mode="staff" tab={sp.tab ?? 'overview'} base={`/admin/projects/${id}`} />
    </>
  );
}
