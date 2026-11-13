import Link from 'next/link';
import {
  Activity, ArrowRight, Building2, ClipboardList, FileSpreadsheet, HandCoins, Landmark, MapPin, Ruler, ScrollText, ShieldCheck, SlidersHorizontal,
  TriangleAlert, UserCheck, IndianRupee,
} from 'lucide-react';
import { getT } from '@/i18n/server';
import { ZONES } from '@/lib/enums';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { CompareSection, Hero, PrincipleBand, SplitSection, StatsRow } from '@/components/site/landing-sections';
import { LinkButton } from '@/components/ui';
import { getSessionUser } from '@/server/auth';

export default async function LandingPage() {
  const { t, locale } = await getT();
  const user = await getSessionUser();
  const steps = [ClipboardList, Ruler, FileSpreadsheet, UserCheck, Activity];
  const features = [ShieldCheck, SlidersHorizontal, IndianRupee, Landmark, TriangleAlert, ScrollText];

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main">
        <Hero t={t} locale={locale} />
        <StatsRow t={t} />

        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('landing.stepsTitle')}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">{t('landing.stepsBody')}</p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((Icon, i) => (
                <li key={i} className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-on-brand">{i + 1}</span>
                    <Icon className="size-5 text-brand-600" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{t(`landing.step${i + 1}Title`)}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{t(`landing.step${i + 1}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <SplitSection t={t} locale={locale} />
        <CompareSection t={t} />

        <section id="partners" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('landing.featTitle')}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">{t('landing.featBody')}</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((Icon, i) => (
                <article key={i} className="rounded-2xl border border-slate-200 p-6 transition-shadow hover:shadow-lg">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-6" aria-hidden /></span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(`landing.feat${i + 1}Title`)}</h3>
                  <p className="mt-2 text-sm text-slate-600">{t(`landing.feat${i + 1}Body`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <PrincipleBand t={t} />

        <section id="areas" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('landing.areasTitle')}</h2>
            <p className="mt-2 max-w-3xl text-slate-600">{t('landing.areasBody')}</p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {ZONES.map((zone) => (
                <li key={zone} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-surface px-3.5 py-1.5 text-sm font-medium text-slate-800">
                  <MapPin className="size-3.5 text-brand-600" aria-hidden /> {t(`zone.${zone}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="finance" className="scroll-mt-20 bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-6">
              <HandCoins className="size-7 text-brand-600" aria-hidden />
              <h2 className="mt-3 text-xl font-bold text-slate-900">{t('landing.financeTitle')}</h2>
              <p className="mt-2 text-sm text-slate-700">{t('landing.financeBody')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-6">
              <Building2 className="size-7 text-brand-600" aria-hidden />
              <h2 className="mt-3 text-xl font-bold text-slate-900">{t('landing.partnerCtaTitle')}</h2>
              <p className="mt-2 text-sm text-slate-700">{t('landing.partnerCtaBody')}</p>
              <Link href="/login" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                {t('landing.partnerCtaButton')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-14">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 rounded-3xl bg-gradient-to-r from-brand-700 to-accent-600 px-6 py-10 text-on-brand md:flex-row md:items-center md:px-10">
            <div>
              <h2 className="text-2xl font-extrabold">{t('landing.ctaTitle')}</h2>
              <p className="mt-1 opacity-90">{t('landing.ctaBody')}</p>
            </div>
            <LinkButton href="/enquiry" variant="secondary" size="lg" className="rounded-full">{t('landing.heroPrimary')} <ArrowRight className="size-4" aria-hidden /></LinkButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
