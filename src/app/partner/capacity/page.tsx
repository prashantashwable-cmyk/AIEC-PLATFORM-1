import Link from 'next/link';
import { Alert, Badge, EmptyState, PageHeader, Section, Stat, StatusBadge, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getPartnerCapacity } from '@/server/services/partnerhome';

export default async function CapacityPage() {
  const { ctx, t, locale } = await pageCtx('partner');
  const d = await load(() => getPartnerCapacity(ctx));
  const full = d.active >= d.limit;
  const pilotFull = d.pilotActive >= d.pilot;
  return (
    <>
      <PageHeader title={t('nav.capacity')} subtitle={t('p.capacity.subtitle')} />
      {full && <Alert tone="amber" className="mb-4" title={t('p.capacity.full')} />}
      {!full && pilotFull && <Alert tone="amber" className="mb-4" title={t('p.capacity.pilotFull')} />}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t('p.capacity.yourProjects')} value={t('p.capacity.used', { active: d.active, max: d.limit })} tone={full ? 'red' : 'green'}
          hint={t('p.capacity.free', { count: Math.max(0, d.limit - d.active) })} />
        <Stat label={t('p.capacity.pilotProjects')} value={t('p.capacity.used', { active: d.pilotActive, max: d.pilot })} tone={pilotFull ? 'amber' : 'gray'} hint={t('p.capacity.pilotNote')} />
        <Stat label={t('p.capacity.queued')} value={String(d.queued.length)} tone={d.queued.length ? 'blue' : 'gray'} hint={t('p.capacity.queuedNote')} href="/partner/orders" />
      </div>
      <Section title={t('p.capacity.schedule')} description={t('p.capacity.scheduleNote')}>
        {d.projects.length === 0 ? <EmptyState title={t('p.capacity.none')} /> : (
          <Table>
            <thead><tr><Th>{t('f.project')}</Th><Th>{t('common.status')}</Th><Th>{t('f.plannedStart')}</Th><Th>{t('f.plannedEnd')}</Th></tr></thead>
            <tbody>{d.projects.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/partner/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.project_number}</Link><div className="text-xs text-slate-500">{p.project_name}</div></Td>
                <Td><StatusBadge value={p.status} label={t(`e.projectStatus.${p.status}`)} /></Td>
                <Td>{p.planned_start ? formatDate(p.planned_start, locale) : '—'}</Td>
                <Td>{p.planned_end ? formatDate(p.planned_end, locale) : '—'}{p.delayed && <> <Badge tone="red">{t('p.capacity.delayed')}</Badge></>}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
