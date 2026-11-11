import Link from 'next/link';
import { Split } from '@/components/common';
import { IncidentForm } from '@/components/views/incident-form';
import { EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { listProjects } from '@/server/services/projects';
import { listIncidents } from '@/server/services/quality';

export default async function IncidentsPage() {
  const { ctx, t, locale } = await pageCtx('admin');
  const [rows, projects] = await Promise.all([
    load(() => listIncidents(ctx)),
    ctx.permissions.has('project.view.all') ? listProjects(ctx, {}).then((d) => d.rows) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t('nav.incidents')} subtitle={t('p.incidents.subtitle')} />
      <Split
        main={<Section>
          {rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.incidents.empty')} /> : (
            <Table>
              <thead><tr><Th>{t('f.incident')}</Th><Th>{t('f.occurredAt')}</Th><Th>{t('f.project')}</Th><Th>{t('f.severity')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>{rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <Td><Link href={`/admin/incidents/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.incident_number}</Link><span className="block max-w-sm truncate text-xs text-slate-500">{i.description}</span></Td>
                  <Td className="whitespace-nowrap">{formatDateTime(i.occurred_at, locale)}</Td><Td>{i.project_number ?? '—'}<span className="block text-xs text-slate-500">{i.legal_name}</span></Td>
                  <Td><StatusBadge value={i.severity} label={t(`e.severity.${i.severity}`)} /></Td><Td><StatusBadge value={i.status} label={t(`e.incidentStatus.${i.status}`)} /></Td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Section>}
        side={<Section title={t('a.reportIncident')}><IncidentForm projects={projects.map((p) => ({ id: p.id, label: `${p.project_number} · ${p.project_name}` }))} /></Section>}
      />
    </>
  );
}
