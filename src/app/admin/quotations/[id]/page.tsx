import { QuotationView } from '@/components/views/quotation-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { getQuotation } from '@/server/services/quotations';

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const data = await load(() => getQuotation(ctx, id));
  return (
    <>
      <PageHeader title={t('p.quotation.title')} back={{ href: `/admin/leads/${data.quotation.lead_id}`, label: data.quotation.lead_number }} />
      <QuotationView t={t} locale={locale} data={data} />
    </>
  );
}
