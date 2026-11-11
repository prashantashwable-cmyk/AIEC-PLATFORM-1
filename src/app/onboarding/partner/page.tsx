import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registerCompanyAction } from '@/app/actions/app';
import { Logo } from '@/components/logo';
import { CompanyForm } from '@/components/views/company-form';
import { Alert, Card } from '@/components/ui';
import { getT } from '@/i18n/server';
import { requireUser } from '@/server/auth';

/** Self-registration of a partner company. The company starts in DRAFT and is activated only after AIEC verification. */
export default async function PartnerOnboardingPage() {
  const ctx = await requireUser();
  if (ctx.companyId) redirect('/partner/company');
  if (ctx.isInternal) redirect('/admin/partners/new');
  const { t } = await getT();
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/app" className="text-slate-900"><Logo tagline={t('common.brandFull')} /></Link>
      <h1 className="mt-6 text-2xl font-bold">{t('portal.registerPartner')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('p.partners.onboardingSubtitle')}</p>
      <Alert tone="blue" className="mt-4">{t('landing.partnerCtaBody')}</Alert>
      <Card className="mt-5 p-5"><CompanyForm action={registerCompanyAction} submitLabel={t('a.registerPartner')} /></Card>
    </main>
  );
}
