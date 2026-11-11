import { ArrowRight, BadgeCheck, Building2, CheckCircle2, HardHat, Landmark, MapPin, ShieldCheck, Users, XCircle } from 'lucide-react';
import type { TFunction } from '@/i18n';
import type { Locale } from '@/lib/enums';
import { formatINR } from '@/lib/format';
import { Badge, LinkButton } from '@/components/ui';

/** Illustrative comparison card (sample figures, clearly labelled) showing what customers get. */
export function QuoteMock({ t, locale }: { t: TFunction; locale: Locale }) {
  const rows = [
    { name: t('landing.mockPartnerA'), total: 600000, score: 86, months: 12, weeks: 8, best: true },
    { name: t('landing.mockPartnerB'), total: 645000, score: 81, months: 18, weeks: 10, best: false },
    { name: t('landing.mockPartnerC'), total: 628000, score: 78, months: 12, weeks: 9, best: false },
  ];
  return (
    <div className="rounded-2xl border border-hero-line bg-hero-tile p-4 shadow-xl backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-hero-fg">{t('landing.mockTitle')}</p>
        <span className="rounded-full border border-hero-line px-2 py-0.5 text-[11px] text-hero-muted">{t('landing.mockNote')}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className={`rounded-xl border bg-surface p-3 text-slate-900 ${r.best ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'}`}>
            <p className="text-sm font-semibold">{r.name}</p>
            <p className="mt-1 text-xl font-bold">{formatINR(r.total, locale)}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge tone="green"><BadgeCheck className="mr-1 size-3" aria-hidden />{t('landing.mockLicence')}</Badge>
              <Badge tone="green">{t('landing.mockInsurance')}</Badge>
            </div>
            <dl className="mt-3 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between gap-2"><dt>{t('landing.mockWarranty')}</dt><dd className="font-medium text-slate-900">{t('common.months', { count: r.months })}</dd></div>
              <div className="flex justify-between gap-2"><dt>{t('landing.mockDelivery')}</dt><dd className="font-medium text-slate-900">{t('common.weeks', { count: r.weeks })}</dd></div>
              <div className="flex justify-between gap-2"><dt>{t('landing.mockScore')}</dt><dd className="font-medium text-brand-700">{r.score}</dd></div>
            </dl>
            <div className={`mt-3 rounded-lg px-2 py-1.5 text-center text-xs font-semibold ${r.best ? 'bg-brand-600 text-on-brand' : 'border border-slate-300 text-slate-700'}`}>{t('landing.mockSelect')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero({ t, locale, compact = false }: { t: TFunction; locale: Locale; compact?: boolean }) {
  const tiles = [
    { icon: Users, key: 'tileCustomer' }, { icon: Building2, key: 'tilePartner' }, { icon: HardHat, key: 'tileTech' }, { icon: Landmark, key: 'tileLender' },
  ];
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to text-hero-fg">
      <div className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-brand-400/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-accent-400/20 blur-3xl" aria-hidden />
      <div className={`relative mx-auto max-w-6xl px-4 ${compact ? 'py-10' : 'py-14 lg:py-20'}`}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-hero-line bg-hero-tile px-3 py-1 text-xs font-semibold">
            <MapPin className="size-3.5 text-brand-500" aria-hidden /> {t('landing.badge')}
          </p>
          <h1 className={`mt-5 font-extrabold tracking-tight ${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-5xl'}`}>{t('landing.heroTitle')}</h1>
          <p className={`mx-auto mt-5 max-w-2xl text-hero-muted ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>{t('landing.heroBody')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/enquiry" size="lg" className="rounded-full" data-testid="hero-cta">{t('landing.heroPrimary')} <ArrowRight className="size-4" aria-hidden /></LinkButton>
            <LinkButton href="/#how-it-works" size="lg" variant="secondary" className="rounded-full">{t('landing.heroSecondary')}</LinkButton>
          </div>
        </div>
        <div className={`mx-auto max-w-4xl ${compact ? 'mt-8' : 'mt-12'}`}><QuoteMock t={t} locale={locale} /></div>
        {!compact && (
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(({ icon: Icon, key }) => (
              <li key={key} className="rounded-xl border border-hero-line bg-hero-tile p-4 backdrop-blur">
                <Icon className="size-6 text-brand-500" aria-hidden />
                <p className="mt-2 font-semibold">{t(`landing.${key}`)}</p>
                <p className="mt-0.5 text-sm text-hero-muted">{t(`landing.${key}Body`)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function StatsRow({ t }: { t: TFunction }) {
  const stats = [['4', 'stat1Label'], ['2–3', 'stat2Label'], ['7', 'stat3Label'], ['3', 'stat4Label']];
  return (
    <section className="border-y border-slate-200 bg-surface">
      <dl className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([value, key]) => (
          <div key={key}>
            <dd className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-4xl font-extrabold text-transparent">{value}</dd>
            <dt className="mt-1 text-sm text-slate-600">{t(`landing.${key}`)}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SplitSection({ t, locale }: { t: TFunction; locale: Locale }) {
  return (
    <section className="bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-hero-from via-hero-via to-hero-to p-4 sm:p-6"><QuoteMock t={t} locale={locale} /></div>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('landing.splitTitle')}</h2>
          <p className="mt-3 text-slate-600">{t('landing.splitBody')}</p>
          <ul className="mt-6 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-800"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />{t(`landing.split${i}`)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function CompareSection({ t }: { t: TFunction }) {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('landing.compareTitle')}</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-surface p-6">
            <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('landing.compareBefore')}</p>
            <ul className="mt-4 space-y-3">{[1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700"><XCircle className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />{t(`landing.before${i}`)}</li>
            ))}</ul>
          </div>
          <div className="rounded-2xl bg-ink p-6 text-ink-fg shadow-xl">
            <p className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{t('landing.compareAfter')}</p>
            <ul className="mt-4 space-y-3">{[1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent-400" aria-hidden />{t(`landing.after${i}`)}</li>
            ))}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PrincipleBand({ t }: { t: TFunction }) {
  return (
    <section className="bg-ink text-ink-fg">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('landing.principleTitle')}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <ShieldCheck className="size-6 text-accent-400" aria-hidden />
              <p className="mt-3 font-semibold">{t(`landing.principle${i}`)}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-ink-muted">{t('landing.principleNote')}</p>
      </div>
    </section>
  );
}
