import { createMyLeadAction } from '@/app/actions/app';
import { LeadForm } from '@/components/views/lead-form';
import { Alert, PageHeader, Section } from '@/components/ui';
import { pageCtx } from '@/server/page';
import { listZones } from '@/server/services/leads';

export default async function NewRequirementPage() {
  const { t } = await pageCtx('customer');
  const zones = await listZones();
  return (
    <>
      <PageHeader title={t('nav.newRequirement')} subtitle={t('enquiry.subtitle')} back={{ href: '/customer', label: t('nav.myProjects') }} />
      <Alert tone="amber" className="mb-4">{t('enquiry.noDocs')}</Alert>
      <Section><LeadForm action={createMyLeadAction} zones={zones.map((z) => ({ id: z.id, code: z.code }))} mode="customer" /></Section>
    </>
  );
}
