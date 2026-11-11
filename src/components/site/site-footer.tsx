import Link from 'next/link';
import { getT } from '@/i18n/server';
import { Logo } from '@/components/logo';

export async function SiteFooter() {
  const { t } = await getT();
  return (
    <footer className="bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[2fr_1fr]">
        <div>
          <Logo dark tagline={t('common.brandFull')} />
          <p className="mt-4 max-w-2xl text-sm text-brand-200">{t('footer.about')}</p>
          <p className="mt-2 max-w-2xl text-sm text-brand-200">{t('footer.disclaimer')}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{t('footer.quickLinks')}</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/enquiry" className="hover:text-white hover:underline">{t('site.requestQuote')}</Link></li>
            <li><Link href="/login" className="hover:text-white hover:underline">{t('common.login')}</Link></li>
            <li><Link href="/privacy" className="hover:text-white hover:underline">{t('footer.privacy')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-brand-300">{t('footer.rights', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
