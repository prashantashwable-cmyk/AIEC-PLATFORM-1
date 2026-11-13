import { CompanyView } from '@/components/views/company-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { listZones } from '@/server/services/leads';
import { getCompanyProfile } from '@/server/services/partners';

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, t, locale } = await pageCtx('admin');
  const [profile, zones] = await Promise.all([load(() => getCompanyProfile(ctx, id)), listZones()]);
  return (
    <>
      <PageHeader title={profile.company.legal_name} subtitle={t(`e.companyCategory.${profile.company.category}`)} back={{ href: '/admin/partners', label: t('nav.partners') }} />
      <CompanyView ctx={ctx} t={t} locale={locale} profile={profile} zones={zones} mode="staff" />
    </>
  );
}
