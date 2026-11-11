import { notFound } from 'next/navigation';
import { registerCompanyAction } from '@/app/actions/app';
import { CompanyForm } from '@/components/views/company-form';
import { PageHeader, Section } from '@/components/ui';
import { pageCtx } from '@/server/page';

export default async function NewPartnerPage() {
  const { ctx, t } = await pageCtx('admin');
  if (!ctx.permissions.has('partner.manage')) notFound();
  return (
    <>
      <PageHeader title={t('a.newPartner')} subtitle={t('p.partners.newSubtitle')} back={{ href: '/admin/partners', label: t('nav.partners') }} />
      <Section><CompanyForm action={registerCompanyAction} withAdmin submitLabel={t('a.registerPartner')} /></Section>
    </>
  );
}
