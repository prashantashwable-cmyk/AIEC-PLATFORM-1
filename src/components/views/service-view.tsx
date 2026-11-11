import { amcAction, createTicketAction, raiseDisputeAction, ticketUpdateAction, visitAction } from '@/app/actions/app';
import { Split, enumOptions } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, Badge, EmptyState, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import { DISPUTE_KIND, TICKET_KIND, TICKET_PRIORITY, type Locale, type TicketStatus } from '@/lib/enums';
import { formatDate, formatDateTime, isoDateIST } from '@/lib/format';
import { TICKET_MACHINE } from '@/lib/state';
import type { Ctx } from '@/server/ctx';
import type { getServiceOverview } from '@/server/services/service';

type Data = Awaited<ReturnType<typeof getServiceOverview>>;

/** Service desk shared by all roles: tickets, warranties, AMC contracts and visits. Data is already scoped per role. */
export function ServiceView({ ctx, t, locale, data, mode }: { ctx: Ctx; t: TFunction; locale: Locale; data: Data; mode: 'staff' | 'partner' | 'customer' }) {
  const { tickets, warranties, amcs, visits, projects, providers } = data;
  const can = (p: string) => ctx.permissions.has(p);
  const allowed = (status: TicketStatus): string[] => TICKET_MACHINE[status].filter((to) => {
    if (mode === 'staff') return can('service.manage');
    if (mode === 'partner') return ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'].includes(to) && can('service.perform');
    return ['CLOSED', 'IN_PROGRESS'].includes(to) && status === 'RESOLVED' || to === 'CLOSED';
  });
  const projectOptions = projects.map((p) => ({ value: p.id, label: `${p.project_number} · ${p.project_name}` }));

  return (
    <Split
      main={<>
        <Section title={t('p.service.tickets')}>
          {tickets.length === 0 ? <EmptyState title={t('common.noData')} hint={t('p.service.empty')} /> : (
            <ul className="divide-y divide-slate-100">{tickets.map((k) => {
              const next = allowed(k.status as TicketStatus);
              return (
                <li key={k.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{k.ticket_number} · {t(`e.ticketKind.${k.kind}`)}
                      {k.priority === 'EMERGENCY' && <Badge tone="red" className="ml-2">{t('e.ticketPriority.EMERGENCY')}</Badge>}
                      {k.ack_overdue && <Badge tone="red" className="ml-2">{t('m.ackOverdue')}</Badge>}</p>
                    <StatusBadge value={k.status} label={t(`e.ticketStatus.${k.status}`)} />
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{k.description}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(k.created_at, locale)} · {k.customer_name}{k.project_number ? ` · ${k.project_number}` : ''}{k.legal_name ? ` · ${k.legal_name}` : ''}</p>
                  {k.resolution_note && <p className="mt-1 text-sm text-emerald-800">{t('f.resolution')}: {k.resolution_note}</p>}
                  {next.length > 0 && (
                    <ActionForm action={ticketUpdateAction} hideSuccess className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={k.id} />
                      <SelectField name="to" aria-label={t('f.newStatus')} required placeholder={t('f.newStatus')} options={next.map((s) => ({ value: s, label: t(`e.ticketStatus.${s}`) }))} />
                      {mode === 'staff' && <SelectField name="companyId" aria-label={t('f.assignTo')} placeholder={t('f.assignTo')} options={providers.map((c) => ({ value: c.id, label: c.legal_name }))} />}
                      {mode !== 'customer' && <Field name="note" placeholder={t('f.resolution')} aria-label={t('f.resolution')} />}
                      <SubmitButton size="sm" variant="secondary">{t('a.updateStatus')}</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}</ul>
          )}
        </Section>

        <Section title={t('p.service.warranties')}>
          {warranties.length === 0 ? <EmptyState title={t('p.service.noWarranty')} /> : (
            <Table>
              <thead><tr><Th>{t('f.project')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.validity')}</Th><Th>{t('f.remaining')}</Th></tr></thead>
              <tbody>{warranties.map((w) => (
                <tr key={w.id}><Td>{w.project_number} · {w.project_name}<span className="block text-xs text-slate-500">{w.customer_name}</span></Td><Td>{w.legal_name}</Td>
                  <Td>{formatDate(w.starts_on, locale)} – {formatDate(w.ends_on, locale)}</Td>
                  <Td>{Number(w.days_left) < 0 ? <Badge tone="red">{t('e.amcStatus.EXPIRED')}</Badge> : <Badge tone={Number(w.days_left) <= 30 ? 'amber' : 'green'}>{t('common.days', { count: w.days_left })}</Badge>}</Td></tr>
              ))}</tbody>
            </Table>
          )}
        </Section>

        <Section title={t('p.service.amc')} description={t('p.service.amcNote')}>
          {amcs.length === 0 ? <EmptyState title={t('common.noData')} /> : (
            <Table>
              <thead><tr><Th>{t('f.project')}</Th><Th>{t('f.partner')}</Th><Th>{t('f.validity')}</Th><Th>{t('f.visitsPerYear')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>{amcs.map((a) => (
                <tr key={a.id}><Td>{a.project_number ?? '—'}<span className="block text-xs text-slate-500">{a.customer_name}</span></Td><Td>{a.legal_name}</Td>
                  <Td>{formatDate(a.starts_on, locale)} – {formatDate(a.ends_on, locale)}</Td><Td>{a.visits_per_year}</Td><Td><StatusBadge value={a.status} label={t(`e.amcStatus.${a.status}`)} /></Td></tr>
              ))}</tbody>
            </Table>
          )}
          {visits.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">{visits.map((v) => (
              <li key={v.id}>{formatDate(v.visited_on, locale)}{v.ticket_number ? ` · ${v.ticket_number}` : ''} — {v.notes}</li>
            ))}</ul>
          )}
        </Section>
      </>}
      side={<>
        {mode === 'customer' && (
          <Section title={t('a.newTicket')}>
            <ActionForm action={createTicketAction} className="space-y-3">
              <Alert tone="red">{t('m.emergencyFirst')}</Alert>
              <SelectField name="kind" label={t('f.type')} required options={enumOptions(t, 'ticketKind', TICKET_KIND)} />
              <SelectField name="priority" label={t('f.priority')} options={enumOptions(t, 'ticketPriority', TICKET_PRIORITY)} defaultValue="NORMAL" />
              <SelectField name="projectId" label={t('f.project')} placeholder={t('common.none')} options={projectOptions} />
              <TextareaField name="description" label={t('f.description')} required />
              <SubmitButton data-testid="ticket-submit">{t('common.submit')}</SubmitButton>
            </ActionForm>
          </Section>
        )}
        {mode === 'partner' && can('service.perform') && (tickets.length > 0 || amcs.length > 0) && (
          <Section title={t('a.recordVisit')}>
            <ActionForm action={visitAction} className="space-y-3">
              <SelectField name="ticketId" label={t('f.ticket')} placeholder={t('common.none')} options={tickets.map((k) => ({ value: k.id, label: k.ticket_number }))} />
              <SelectField name="amcId" label={t('p.service.amc')} placeholder={t('common.none')} options={amcs.map((a) => ({ value: a.id, label: `${a.customer_name} · ${formatDate(a.ends_on, locale)}` }))} />
              <Field name="visitedOn" type="date" label={t('common.date')} required defaultValue={isoDateIST()} />
              <TextareaField name="notes" label={t('common.notes')} required />
              <SubmitButton variant="secondary">{t('common.save')}</SubmitButton>
            </ActionForm>
          </Section>
        )}
        {mode !== 'customer' && (can('service.manage') || can('service.perform')) && projectOptions.length > 0 && (
          <Section title={t('a.recordAmc')}>
            <ActionForm action={amcAction} className="space-y-3">
              <SelectField name="projectId" label={t('f.project')} required placeholder={t('common.select')} options={projectOptions} />
              {mode === 'staff' && <SelectField name="companyId" label={t('f.partner')} placeholder={t('m.sameAsProject')} options={providers.map((c) => ({ value: c.id, label: c.legal_name }))} />}
              <div className="grid grid-cols-2 gap-3"><Field name="startsOn" type="date" label={t('f.startsOn')} required /><Field name="endsOn" type="date" label={t('f.endsOn')} required /></div>
              <Field name="visitsPerYear" type="number" min={1} max={52} label={t('f.visitsPerYear')} defaultValue={4} required />
              <TextareaField name="terms" label={t('f.terms')} rows={2} />
              <SubmitButton variant="secondary">{t('common.save')}</SubmitButton>
            </ActionForm>
          </Section>
        )}
        <Section title={t('a.raiseDispute')} description={t('p.service.disputeNote')}>
          <ActionForm action={raiseDisputeAction} className="space-y-3">
            <SelectField name="kind" label={t('f.type')} required options={enumOptions(t, 'disputeKind', DISPUTE_KIND)} />
            <TextareaField name="description" label={t('f.description')} required />
            <SubmitButton variant="secondary">{t('common.submit')}</SubmitButton>
          </ActionForm>
        </Section>
      </>}
    />
  );
}
