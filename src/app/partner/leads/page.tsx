import Link from 'next/link';
import { Badge, EmptyState, PageHeader, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import { formatDateTime, nowMs } from '@/lib/format';
import { load, pageCtx } from '@/server/page';
import { listInvitations } from '@/server/services/matching';

export default async function PartnerLeadsPage() {
  const { ctx, t, locale } = await pageCtx('partner');
  const rows = await load(() => listInvitations(ctx));
  const now = nowMs();
  return (
    <>
      <PageHeader title={t('nav.partnerLeads')} subtitle={t('p.partnerLeads.subtitle')} />
      <Section>
        {rows.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.partnerLeads.empty')} /> : (
          <Table>
            <thead><tr><Th>{t('f.leadNumber')}</Th><Th>{t('f.project')}</Th><Th>{t('f.zone')}</Th><Th>{t('f.requirement')}</Th><Th>{t('f.respondBy')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td><Link href={`/partner/leads/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.lead_number}</Link></Td>
                <Td>{m.project_name}</Td><Td>{t(`zone.${m.zone_code}`)}</Td>
                <Td>{t(`e.liftCategory.${m.lift_category}`)}{m.floors ? <span className="block text-xs text-slate-500">{t('f.floorsN', { count: m.floors })}</span> : null}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(m.respond_due_at, locale)}{m.status === 'INVITED' && new Date(m.respond_due_at).getTime() < now && <Badge tone="red" className="ml-1">{t('m.overdue')}</Badge>}</Td>
                <Td><StatusBadge value={m.status} label={t(`e.matchStatus.${m.status}`)} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
