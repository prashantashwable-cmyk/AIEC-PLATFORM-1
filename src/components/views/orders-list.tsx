import Link from 'next/link';
import { FilterBar, FilterSelect, Pager, enumOptions } from '@/components/common';
import { EmptyState, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { ORDER_STATUS, type Locale } from '@/lib/enums';
import { formatDate, formatINR } from '@/lib/format';
import { withParams } from '@/server/page';
import type { Rec } from '@/server/db';

export function OrdersList({ t, locale, data, sp, base }: { t: TFunction; locale: Locale; data: { rows: Rec[]; total: number; page: number }; sp: Record<string, string>; base: string }) {
  return (
    <>
      <FilterBar submitLabel={t('common.filter')} resetHref={base} resetLabel={t('common.reset')}>
        <FilterSelect name="status" label={t('common.status')} value={sp.status} allLabel={t('common.all')} options={enumOptions(t, 'orderStatus', ORDER_STATUS)} />
      </FilterBar>
      <Section>
        {data.rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('common.noDataHint')} /> : (
          <Table>
            <thead><tr><Th>{t('f.orderNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.customer')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.grossOrderValue')}</Th><Th>{t('common.status')}</Th><Th>{t('f.created')}</Th></tr></thead>
            <tbody>{data.rows.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`${base}/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.order_number}</Link></Td>
                <Td>{o.project_name}<span className="block text-xs text-slate-500">{o.lead_number}</span></Td>
                <Td>{o.customer_name}</Td><Td>{o.legal_name}</Td><Td>{formatINR(o.gross_order_value, locale)}</Td>
                <Td><StatusBadge value={o.status} label={t(`e.orderStatus.${o.status}`)} /></Td><Td>{formatDate(o.created_at, locale)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pager t={t} page={data.page} total={data.total} hrefFor={(p) => withParams(base, { ...sp, page: p })} />
      </Section>
    </>
  );
}
