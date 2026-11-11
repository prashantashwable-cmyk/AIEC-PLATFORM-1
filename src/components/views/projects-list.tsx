import Link from 'next/link';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { EmptyState, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { PROJECT_STATUS, type Locale } from '@/lib/enums';
import { formatDate, formatINR } from '@/lib/format';
import type { Rec } from '@/server/db';
import { withParams } from '@/server/page';

export function ProjectsList({ t, locale, data, sp, base, showValue = true }: { t: TFunction; locale: Locale; data: { rows: Rec[]; total: number; page: number }; sp: Record<string, string>; base: string; showValue?: boolean }) {
  return (
    <>
      <FilterBar submitLabel={t('common.filter')} resetHref={base} resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'projectStatus', PROJECT_STATUS)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.projectNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.customer')}</Th><Th>{t('f.partner')}</Th>{showValue && <Th>{t('f.grossOrderValue')}</Th>}<Th>{t('f.milestones')}</Th><Th>{t('f.plannedEnd')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{data.rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td><Link href={`${base}/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.project_number}</Link></Td>
                <Td>{p.project_name}</Td><Td>{p.customer_name}</Td><Td>{p.legal_name}</Td>
                {showValue && <Td>{formatINR(p.gross_order_value, locale)}</Td>}
                <Td>{p.milestones_done} / {p.milestones_total}</Td><Td>{formatDate(p.planned_end, locale)}</Td>
                <Td><StatusBadge value={p.status} label={t(`e.projectStatus.${p.status}`)} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(n) => withParams(base, { ...sp, page: n })} />
      </Section>
    </>
  );
}
