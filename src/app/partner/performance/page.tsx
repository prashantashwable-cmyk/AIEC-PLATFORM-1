import { Alert, EmptyState, PageHeader, Section, Stat, Table, Td, Th } from '@/components/ui';
import { formatDateTime, formatNumber } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { getPartnerPerformance } from '@/server/services/partnerhome';

// Invitation events carry a fixed English note written by the system; the translated event name already says the same thing, so the note is hidden for them.
export default async function PerformancePage() {
  const { ctx, t, locale } = await pageCtx('partner');
  const d = await load(() => getPartnerPerformance(ctx));
  const submitted = Number(d.quotes.submitted);
  const selected = Number(d.quotes.selected);
  const invited = Number(d.invites.invited);
  const answered = Number(d.invites.answered);
  const pct = (a: number, b: number) => (b > 0 ? `${formatNumber(Math.round((a * 100) / b), locale)}%` : '—');
  return (
    <>
      <PageHeader title={t('nav.performance')} subtitle={t('p.performance.subtitle')} />
      <Alert tone="blue" className="mb-4" title={t('p.performance.note')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('p.performance.avgScore')} value={d.score.avg_score ?? '—'} hint={t('p.performance.events', { count: Number(d.score.events) })} />
        <Stat label={t('p.performance.invitations')} value={String(invited)} hint={t('p.performance.answeredRate', { rate: pct(answered, invited) })}
          tone={Number(d.invites.expired) > 0 ? 'amber' : 'gray'} />
        <Stat label={t('p.performance.expired')} value={String(Number(d.invites.expired))} tone={Number(d.invites.expired) > 0 ? 'amber' : 'green'} />
        <Stat label={t('p.performance.quotations')} value={String(submitted)} hint={t('p.performance.selectedRate', { selected, rate: pct(selected, submitted) })} />
      </div>
      <Section title={t('p.performance.recent')}>
        {d.events.length === 0 ? <EmptyState title={t('p.performance.none')} /> : (
          <Table>
            <thead><tr><Th>{t('p.performance.event')}</Th><Th>{t('p.performance.score')}</Th><Th>{t('common.notes')}</Th><Th>{t('common.date')}</Th></tr></thead>
            <tbody>{d.events.map((e) => (
              <tr key={e.id}><Td>{t(`perf.${e.event_type}`)}</Td><Td>{e.score}</Td><Td>{e.event_type.startsWith('INVITE_') ? '—' : (e.note ?? '—')}</Td><Td className="whitespace-nowrap">{formatDateTime(e.created_at, locale)}</Td></tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
