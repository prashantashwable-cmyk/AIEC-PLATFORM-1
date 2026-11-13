import Link from 'next/link';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { SURVEY_STATUS } from '@/lib/enums';
import { formatDateTime } from '@/lib/format';
import { load, pageCtx, readParams, withParams, type SearchParams } from '@/server/page';
import { listSurveys } from '@/server/services/surveys';

export default async function SurveysPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const data = await load(() => listSurveys(ctx, { status: sp.status, page: Number(sp.page) || 1 }));
  return (
    <>
      <PageHeader title={t('nav.surveys')} subtitle={t('p.surveys.subtitle')} />
      <FilterBar submitLabel={t('common.filter')} resetHref="/admin/surveys" resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'surveyStatus', SURVEY_STATUS)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.scheduledAt')}</Th><Th>{t('f.project')}</Th><Th>{t('f.address')}</Th><Th>{t('f.surveyor')}</Th><Th>{t('common.status')}</Th><Th /></tr></thead>
            <tbody>{data.rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap">{formatDateTime(s.scheduled_at, locale)}</Td>
                <Td>{s.project_name}<span className="block text-xs text-slate-500">{s.lead_number} · {s.customer_name}</span></Td>
                <Td>{s.address}<span className="block text-xs text-slate-500">{t(`zone.${s.zone_code}`)}</span></Td>
                <Td>{s.surveyor}</Td>
                <Td><StatusBadge value={s.status} label={t(`e.surveyStatus.${s.status}`)} /></Td>
                <Td><Link href={`/admin/surveys/${s.id}`} className="font-medium text-brand-700 hover:underline">{t('common.open')}</Link></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams('/admin/surveys', { ...sp, page: p })} />
      </Section>
    </>
  );
}
