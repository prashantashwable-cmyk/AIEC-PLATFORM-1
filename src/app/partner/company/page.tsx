import { CompanyView } from '@/components/views/company-view';
import { PageHeader } from '@/components/ui';
import { load, pageCtx } from '@/server/page';
import { listZones } from '@/server/services/leads';
import { getCompanyProfile } from '@/server/services/partners';

export default async function CompanyPage() {
  const { ctx, t, locale } = await pageCtx('partner');
  const [profile, zones] = await Promise.all([load(() => getCompanyProfile(ctx)), listZones()]);
  return (<><PageHeader title={t('nav.company')} subtitle={t('p.company.subtitle')} /><CompanyView ctx={ctx} t={t} locale={locale} profile={profile} zones={zones} mode="partner" /></>);
}
