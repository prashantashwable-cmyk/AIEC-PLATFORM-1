import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { PRIVACY_NOTICE_VERSION } from '@/lib/config';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { Alert } from '@/components/ui';
import { getSessionUser } from '@/server/auth';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('privacy.title') };
}

export default async function PrivacyPage() {
  const { t } = await getT();
  const user = await getSessionUser();
  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">{t('privacy.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('privacy.version', { version: PRIVACY_NOTICE_VERSION })}</p>
        <p className="mt-5 text-slate-700">{t('privacy.intro')}</p>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <section key={i} className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">{t(`privacy.h${i}`)}</h2>
            <p className="mt-1.5 text-slate-700">{t(`privacy.p${i}`)}</p>
          </section>
        ))}
        <Alert tone="amber" className="mt-8">{t('privacy.legalNote')}</Alert>
      </main>
      <SiteFooter />
    </>
  );
}
