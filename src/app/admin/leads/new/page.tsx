import { createLeadAction } from '@/app/actions/app';
import { LeadForm } from '@/components/views/lead-form';
import { Alert, PageHeader, Section } from '@/components/ui';
import { pageCtx } from '@/server/page';
import { listZones } from '@/server/services/leads';

export default async function NewLeadPage() {
  const { t } = await pageCtx('admin');
  const zones = await listZones();
  return (
    <>
      <PageHeader title={t('a.newLead')} subtitle={t('p.leads.newSubtitle')} back={{ href: '/admin/leads', label: t('nav.leads') }} />
      <Alert tone="amber" className="mb-4">{t('enquiry.noDocs')}</Alert>
      <Section><LeadForm action={createLeadAction} zones={zones.map((z) => ({ id: z.id, code: z.code }))} mode="staff" /></Section>
    </>
  );
}
