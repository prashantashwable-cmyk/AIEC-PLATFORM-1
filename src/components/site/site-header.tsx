import Link from 'next/link';
import { Menu } from 'lucide-react';
import { getT } from '@/i18n/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Logo } from '@/components/logo';
import { LinkButton } from '@/components/ui';

export async function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = await getT();
  const links = [
    { href: '/#how-it-works', label: t('site.howItWorks') },
    { href: '/#partners', label: t('site.forPartners') },
    { href: '/#finance', label: t('site.finance') },
    { href: '/#areas', label: t('site.areas') },
  ];
  const account = signedIn ? { href: '/app', label: t('site.myAccount') } : { href: '/login', label: t('common.login') };
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label={t('common.product')}>
          <Logo tagline={t('common.brandFull')} />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label={t('common.menu')}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-slate-700 hover:text-brand-700">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <div className="hidden sm:block"><LinkButton href={account.href} variant="secondary" size="sm">{account.label}</LinkButton></div>
          <div className="hidden md:block"><LinkButton href="/enquiry" variant="accent" size="sm">{t('site.requestQuote')}</LinkButton></div>
          <details className="group relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-lg border border-slate-300 p-2 text-slate-700 [&::-webkit-details-marker]:hidden" aria-label={t('common.menu')}>
              <Menu className="size-5" aria-hidden />
            </summary>
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <nav className="flex flex-col">
                {links.map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{l.label}</Link>
                ))}
                <Link href={account.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{account.label}</Link>
              </nav>
              <LinkButton href="/enquiry" variant="accent" size="sm" className="mt-2 w-full">{t('site.requestQuote')}</LinkButton>
              <div className="mt-3 border-t border-slate-100 pt-3 sm:hidden"><LanguageSwitcher /></div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
