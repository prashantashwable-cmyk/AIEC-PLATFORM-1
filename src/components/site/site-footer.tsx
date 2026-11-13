import Link from 'next/link';
import { getT } from '@/i18n/server';
import { Logo } from '@/components/logo';

export async function SiteFooter() {
  const { t } = await getT();
  const column = (title: string, links: Array<[string, string]>) => (
    <div>
      <p className="text-sm font-semibold text-ink-fg">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([href, label]) => <li key={href + label}><Link href={href} className="hover:text-ink-fg hover:underline">{label}</Link></li>)}
      </ul>
    </div>
  );
  return (
    <footer className="bg-ink text-ink-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <span className="text-ink-fg"><Logo tagline={t('common.brandFull')} /></span>
          <p className="mt-4 max-w-md text-sm">{t('footer.about')}</p>
          <p className="mt-2 max-w-md text-sm">{t('footer.disclaimer')}</p>
        </div>
        {column(t('landing.custTitle'), [['/enquiry', t('site.requestQuote')], ['/#how-it-works', t('site.howItWorks')], ['/#finance', t('site.finance')]])}
        {column(t('landing.partTitle'), [['/login', t('site.partnerLogin')], ['/#partners', t('site.forPartners')], ['/#areas', t('site.areas')]])}
        {column(t('footer.quickLinks'), [['/login', t('common.login')], ['/privacy', t('footer.privacy')]])}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs">{t('footer.rights', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
