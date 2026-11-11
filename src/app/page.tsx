import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, Building2, ClipboardList, FileSpreadsheet, HandCoins, Landmark, MapPin, Ruler,
  ShieldCheck, Hammer, UserCheck, Users, Activity, CheckCircle2,
} from 'lucide-react';
import { getT } from '@/i18n/server';
import { ZONES } from '@/lib/enums';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import { LinkButton } from '@/components/ui';
import { getSessionUser } from '@/server/auth';

export default async function LandingPage() {
  const { t } = await getT();
  const user = await getSessionUser();

  const steps = [
    { icon: ClipboardList, n: 1 }, { icon: Ruler, n: 2 }, { icon: FileSpreadsheet, n: 3 }, { icon: UserCheck, n: 4 }, { icon: Activity, n: 5 },
  ];
  const audiences = [
    { key: 'cust', icon: Users, id: 'customers' },
    { key: 'part', icon: Building2, id: 'partners' },
    { key: 'fin', icon: Landmark, id: 'lenders' },
  ];
  const principles = [
    { icon: ShieldCheck, text: t('landing.principle1') },
    { icon: UserCheck, text: t('landing.principle2') },
    { icon: Hammer, text: t('landing.principle3') },
    { icon: Landmark, text: t('landing.principle4') },
  ];

  return (
    <>
      <SiteHeader signedIn={Boolean(user)} />
      <main id="main">
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-accent-500/20 blur-3xl" aria-hidden />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[3fr_2fr] lg:py-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/20">
                <MapPin className="size-3.5" aria-hidden /> {t('landing.badge')}
              </p>
              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{t('landing.heroTitle')}</h1>
              <p className="mt-5 max-w-2xl text-base text-brand-100 sm:text-lg">{t('landing.heroBody')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/enquiry" variant="accent" size="lg" data-testid="hero-cta">
                  {t('landing.heroPrimary')} <ArrowRight className="size-4" aria-hidden />
                </LinkButton>
                <LinkButton href="#how-it-works" size="lg" className="bg-white/10 ring-1 ring-white/30 hover:bg-white/20">
                  {t('landing.heroSecondary')}
                </LinkButton>
              </div>
            </div>
            <ul className="space-y-3 self-center">
              {[t('landing.trust1'), t('landing.trust2'), t('landing.trust3')].map((text) => (
                <li key={text} className="flex items-start gap-3 rounded-xl bg-white/10 p-4 ring-1 ring-white/15">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-accent-400" aria-hidden />
                  <span className="text-sm font-medium">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('landing.stepsTitle')}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">{t('landing.stepsBody')}</p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map(({ icon: Icon, n }) => (
                <li key={n} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{n}</span>
                    <Icon className="size-5 text-brand-700" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{t(`landing.step${n}Title`)}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{t(`landing.step${n}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('landing.whoTitle')}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {audiences.map(({ key, icon: Icon, id }) => (
                <article key={key} id={id} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-6" aria-hidden /></span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(`landing.${key}Title`)}</h3>
                  <p className="mt-2 text-sm text-slate-600">{t(`landing.${key}Body`)}</p>
                  <ul className="mt-4 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {t(`landing.${key}Point${i}`)}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('landing.principleTitle')}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {principles.map(({ icon: Icon, text }) => (
                <div key={text} className="rounded-xl border-l-4 border-accent-500 bg-brand-950 p-5 text-white">
                  <Icon className="size-6 text-accent-400" aria-hidden />
                  <p className="mt-3 font-semibold">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm text-slate-600">{t('landing.principleNote')}</p>
          </div>
        </section>

        <section id="areas" className="scroll-mt-20 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{t('landing.areasTitle')}</h2>
            <p className="mt-2 max-w-3xl text-slate-600">{t('landing.areasBody')}</p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {ZONES.map((zone) => (
                <li key={zone} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-800">
                  <MapPin className="size-3.5 text-brand-600" aria-hidden /> {t(`zone.${zone}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="finance" className="scroll-mt-20 bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <HandCoins className="size-7 text-brand-700" aria-hidden />
              <h2 className="mt-3 text-xl font-bold text-slate-900">{t('landing.financeTitle')}</h2>
              <p className="mt-2 text-sm text-slate-700">{t('landing.financeBody')}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <Building2 className="size-7 text-brand-700" aria-hidden />
              <h2 className="mt-3 text-xl font-bold text-slate-900">{t('landing.partnerCtaTitle')}</h2>
              <p className="mt-2 text-sm text-slate-700">{t('landing.partnerCtaBody')}</p>
              <Link href="/login" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                {t('landing.partnerCtaButton')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-brand-800 text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 py-12 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold">{t('landing.ctaTitle')}</h2>
              <p className="mt-1 text-brand-100">{t('landing.ctaBody')}</p>
            </div>
            <LinkButton href="/enquiry" variant="accent" size="lg">{t('landing.heroPrimary')} <ArrowRight className="size-4" aria-hidden /></LinkButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
