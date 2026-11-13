import { LedgerView } from '@/components/views/ledger-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx, readParams, type SearchParams } from '@/server/page';
import { listInvoices, listLedger } from '@/server/services/money';

export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { ctx, t, locale } = await pageCtx('admin');
  const sp = await readParams(searchParams);
  const [ledger, inv] = await Promise.all([load(() => listLedger(ctx, { status: sp.status, page: Number(sp.page) || 1 })), load(() => listInvoices(ctx))]);
  return (<><PageHeader title={t('nav.commissions')} subtitle={t('p.commission.subtitle')} /><LedgerView ctx={ctx} t={t} locale={locale} ledger={ledger} inv={inv} sp={sp} base="/admin/commissions" /></>);
}
