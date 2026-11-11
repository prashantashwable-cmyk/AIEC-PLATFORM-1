import type { Metadata } from 'next';
import { getT } from '@/i18n/server';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { Card } from '@/components/ui';
import { displayPhone } from '@/lib/phone';
import { getSessionUser } from '@/server/auth';
import { listZones } from '@/server/services/leads';
import { EnquiryForm } from './enquiry-form';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('enquiry.title') };
}

export default async function EnquiryPage() {
  const { t } = await getT();
  const [user, zones] = await Promise.all([getSessionUser(), listZones()]);
  const asCustomer = user && user.customerId && !user.isInternal ? { name: user.name, phone: displayPhone(user.phone) } : undefined;
  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">{t('enquiry.title')}</h1>
        <p className="mt-2 text-slate-600">{t('enquiry.subtitle')}</p>
        <Card className="mt-6 p-5 sm:p-7">
          <EnquiryForm zones={zones.map((z) => ({ id: z.id, code: z.code }))} signedIn={Boolean(user)} defaults={asCustomer} />
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
