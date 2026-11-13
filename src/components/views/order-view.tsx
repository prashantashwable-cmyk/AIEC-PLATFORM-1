import Link from 'next/link';
import { assignSupervisorAction, confirmOrderAction, orderExceptionAction, orderTermsAction, respondOrderAction } from '@/app/actions/app';
import { Check, FileLink, Split, Timeline } from '@/components/common';
import { ActionForm, Field, SelectField, SubmitButton, TextareaField } from '@/components/ui/form';
import { Alert, DataList, Section, StatusBadge, Table, Td, Th } from '@/components/ui';
import type { TFunction } from '@/i18n';
import type { Locale } from '@/lib/enums';
import { commissionFor } from '@/lib/commission';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { displayPhone } from '@/lib/phone';
import type { Ctx } from '@/server/ctx';
import type { getOrder } from '@/server/services/orders';

type OrderData = Awaited<ReturnType<typeof getOrder>>;

export function OrderView({ ctx, t, locale, data, mode }: { ctx: Ctx; t: TFunction; locale: Locale; data: OrderData; mode: 'staff' | 'partner' }) {
  const { order: o, events, milestones, supervisors, checklist } = data;
  const can = (p: string) => ctx.permissions.has(p);
  const staff = mode === 'staff';
  const openForTerms = ['PENDING_PARTNER_ACCEPTANCE', 'PARTNER_ACCEPTED', 'ON_HOLD'].includes(o.status);
  const supervisorOptions = supervisors.map((u) => ({ value: u.id, label: u.full_name }));
  const projectHref = o.project_id ? `/${staff ? 'admin' : 'partner'}/projects/${o.project_id}` : null;

  return (
    <Split
      main={<>
        <Alert tone="blue">{t('p.order.notStatutory')}</Alert>
        <Section title={t('p.order.summary')} actions={<StatusBadge value={o.status} label={t(`e.orderStatus.${o.status}`)} />}>
          <DataList columns={3} items={[
            { label: t('f.project'), value: `${o.project_name} · ${o.lead_number}` }, { label: t('f.address'), value: o.address },
            { label: t('f.customer'), value: `${o.customer_name} · ${displayPhone(o.customer_phone)}` }, { label: t('f.partner'), value: o.legal_name },
            { label: t('f.frozenQuotation'), value: `${o.quotation_number} · v${o.version_no}` }, { label: t('f.product'), value: `${o.manufacturer ?? ''} ${o.model ?? ''}` },
            { label: t('f.grossOrderValue'), value: formatINR(o.gross_order_value, locale) },
            { label: t('f.eligibleValue'), value: o.eligible_value === null ? '—' : formatINR(o.eligible_value, locale) },
            { label: t('f.commissionRate'), value: `${Number(o.commission_rate_percent)}%` },
            ...(staff && o.eligible_value !== null ? [{ label: t('f.potentialCommission'), value: formatINR(commissionFor(String(o.eligible_value), String(o.commission_rate_percent)), locale) }] : []),
            { label: t('f.exclusionsNote'), value: o.exclusions_note ?? '—' },
            { label: t('f.contractReference'), value: o.contract_reference ?? '—' }, { label: t('f.contractAcceptedOn'), value: formatDate(o.contract_accepted_on, locale) },
            { label: t('f.contractDocument'), value: <FileLink id={o.contract_file_id} label={t('common.view')} /> },
            { label: t('f.approvalPath'), value: o.approval_path_note ?? '—' }, { label: t('f.supervisor'), value: o.supervisor_name ?? '—' },
            { label: t('f.confirmedAt'), value: formatDateTime(o.confirmed_at, locale) },
          ]} />
          {projectHref && <p className="mt-3 text-sm"><Link href={projectHref} className="font-medium text-brand-700 hover:underline">{t('a.openProject')}</Link></p>}
          {o.partner_decline_reason && <Alert tone="red" className="mt-3" title={t('e.orderStatus.PARTNER_DECLINED')}>{o.partner_decline_reason}</Alert>}
        </Section>

        <Section title={t('f.paymentMilestones')} description={t('p.order.milestonesNote')}>
          <Table className="max-w-xl">
            <thead><tr><Th>#</Th><Th>{t('f.milestone')}</Th><Th>%</Th><Th>{t('f.amount')}</Th></tr></thead>
            <tbody>{milestones.map((m) => (
              <tr key={m.seq}><Td>{m.seq}</Td><Td>{m.name}</Td><Td>{Number(m.percent)}%</Td><Td>{formatINR(Math.round(Number(o.gross_order_value) * Number(m.percent)) / 100, locale)}</Td></tr>
            ))}</tbody>
          </Table>
        </Section>

        {staff && can('order.manage') && openForTerms && (
          <Section title={t('p.order.terms')} description={t('p.order.termsNote')}>
            <ActionForm action={orderTermsAction} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={o.id} />
              <Field name="eligibleValue" label={t('f.eligibleValue')} required inputMode="decimal" defaultValue={o.eligible_value ?? ''} hint={t('f.eligibleValueHint')} />
              <Field name="exclusionsNote" label={t('f.exclusionsNote')} defaultValue={o.exclusions_note ?? ''} />
              <Field name="contractReference" label={t('f.contractReference')} defaultValue={o.contract_reference ?? ''} />
              <Field name="contractAcceptedOn" type="date" label={t('f.contractAcceptedOn')} defaultValue={o.contract_accepted_on ?? ''} />
              <Field name="file" type="file" accept="application/pdf,image/*" label={t('f.contractDocument')} hint={t('f.fileHint')} />
              <TextareaField name="approvalPathNote" label={t('f.approvalPath')} defaultValue={o.approval_path_note ?? ''} hint={t('f.approvalPathHint')} />
              <div><SubmitButton>{t('common.save')}</SubmitButton></div>
            </ActionForm>
          </Section>
        )}
      </>}
      side={<>
        {!staff && o.status === 'PENDING_PARTNER_ACCEPTANCE' && can('order.accept') && (
          <Section title={t('p.order.respond')} description={t('p.order.respondNote')}>
            <ActionForm action={respondOrderAction} className="space-y-3">
              <input type="hidden" name="id" value={o.id} />
              <SelectField name="supervisorUserId" label={t('f.supervisor')} placeholder={t('common.select')} options={supervisorOptions} />
              <TextareaField name="reason" label={t('f.declineReason')} rows={2} />
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="decision" value="accept" variant="success">{t('a.acceptOrder')}</SubmitButton>
                <SubmitButton name="decision" value="decline" variant="danger" confirm={t('m.confirmDecline')}>{t('a.declineOrder')}</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        )}

        {checklist && (
          <Section title={t('p.order.checklist')} description={t('p.order.checklistNote')}>
            <ul className="space-y-1.5">
              {checklist.gates.map((g) => (
                <Check key={g.key} ok={g.ok} label={t(`og.${g.key}`)}
                  hint={g.key === 'aiecCapacity' ? `${checklist.active} / ${checklist.max}` : g.key === 'partnerCapacity' ? `${checklist.partnerActive} / ${checklist.partnerMax}` : undefined} />
              ))}
            </ul>
            {can('order.confirm') && o.status === 'PARTNER_ACCEPTED' && (
              <ActionForm action={confirmOrderAction} className="mt-4">
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton confirm={t('m.confirmOrder')} data-testid="confirm-order">{t('a.confirmOrder')}</SubmitButton>
              </ActionForm>
            )}
          </Section>
        )}

        {((staff && can('order.manage')) || (!staff && can('order.accept'))) && !['PARTNER_DECLINED', 'CANCELLED', 'COMPLETED'].includes(o.status) && supervisorOptions.length > 0 && (
          <Section title={t('f.supervisor')}>
            <ActionForm action={assignSupervisorAction} className="space-y-3">
              <input type="hidden" name="id" value={o.id} />
              <SelectField name="userId" label={t('f.supervisor')} required placeholder={t('common.select')} defaultValue={o.supervisor_user_id ?? ''} options={supervisorOptions} />
              <SubmitButton variant="secondary">{t('a.assign')}</SubmitButton>
            </ActionForm>
          </Section>
        )}

        {staff && can('order.manage') && ['PARTNER_ACCEPTED', 'CONFIRMED', 'ON_HOLD', 'PENDING_PARTNER_ACCEPTANCE'].includes(o.status) && (
          <Section title={t('p.lead.exception')}>
            <ActionForm action={orderExceptionAction} className="space-y-3">
              <input type="hidden" name="id" value={o.id} />
              <SelectField name="to" label={t('f.newStatus')} required placeholder={t('common.select')}
                options={(o.status === 'ON_HOLD' ? ['RESUME', 'CANCELLED'] : o.status === 'PENDING_PARTNER_ACCEPTANCE' ? ['CANCELLED'] : ['ON_HOLD', 'CANCELLED'])
                  .map((v) => ({ value: v, label: v === 'RESUME' ? t('a.resume') : t(`e.orderStatus.${v}`) }))} />
              <TextareaField name="reason" label={t('f.reason')} rows={2} />
              <SubmitButton variant="danger" confirm={t('m.confirmStatusChange')}>{t('a.changeStatus')}</SubmitButton>
            </ActionForm>
          </Section>
        )}

        <Section title={t('p.lead.history')}>
          <Timeline items={events.map((e) => ({
            key: e.id, title: t(`e.orderStatus.${e.to_status}`), meta: `${formatDateTime(e.created_at, locale)} · ${e.actor ?? t('common.system')}`, body: e.reason ?? undefined,
          }))} />
        </Section>
      </>}
    />
  );
}
