import { z } from 'zod';
import { DISPUTE_KIND, TICKET_KIND, TICKET_PRIORITY, type TicketStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { addWorkingDays } from '@/lib/sla';
import { TICKET_MACHINE, assertTransition } from '@/lib/state';
import { zDate, zEnum, zInt, zOptText, zText, zUuid } from '@/lib/validation';
import { audit, getHolidays, getSetting, notifyCompany, notifyCustomer, notifyPermission, notifyUsers } from '../audit';
import { can, requireCustomer, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec } from '../db';

export const ticketSchema = z.object({ projectId: zUuid.optional(), kind: zEnum(TICKET_KIND), priority: zEnum(TICKET_PRIORITY).default('NORMAL'), description: zText(2000) });

/** Customer raises a service request, warranty claim or complaint. Emergencies are escalated immediately. */
export async function createTicket(ctx: Ctx, input: z.infer<typeof ticketSchema>): Promise<string> {
  const customerId = requireCustomer(ctx);
  return withCtx(ctx, async (tx) => {
    const project = input.projectId ? await tx.one<Rec>('select id, company_id from projects where id = $1 and customer_id = $2', [input.projectId, customerId]) : null;
    const ackDue = addWorkingDays(new Date(), Number(await getSetting(tx, 'sla_complaint_ack_days')), await getHolidays(tx));
    const ticket = await tx.one<{ id: string; ticket_number: string }>(
      `insert into service_tickets (customer_id, project_id, company_id, kind, priority, description, ack_due_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, ticket_number`,
      [customerId, project?.id ?? null, project?.company_id ?? null, input.kind, input.priority, input.description, ackDue, ctx.userId]);
    await audit(tx, ctx, 'service.ticket_create', 'service_ticket', ticket.id, { kind: input.kind, priority: input.priority }, project?.company_id ?? null);
    const type = input.priority === 'EMERGENCY' ? 'TICKET_EMERGENCY' : 'TICKET_NEW';
    await notifyPermission(tx, 'service.manage', type, { number: ticket.ticket_number }, '/admin/service');
    if (project) await notifyCompany(tx, project.company_id, type, { number: ticket.ticket_number }, '/partner/service');
    return ticket.id;
  });
}

export async function getServiceOverview(ctx: Ctx) {
  if (ctx.isInternal) requirePerm(ctx, 'service.manage');
  return withCtx(ctx, async (tx) => {
    // Row-level security scopes every list to the caller (staff: all, partner: own company, customer: own records).
    const [tickets, warranties, amcs, visits, disputes, projects, providers] = await Promise.all([
      tx.query<Rec>(
        `select t.*, c.name as customer_name, co.legal_name, p.project_number,
                (t.status = 'OPEN' and t.ack_due_at < now()) as ack_overdue
           from service_tickets t join customers c on c.id = t.customer_id left join companies co on co.id = t.company_id left join projects p on p.id = t.project_id
          order by (t.status = 'CLOSED'), (t.priority = 'EMERGENCY') desc, t.created_at desc limit 200`),
      tx.query<Rec>(
        `select w.*, p.project_number, l.project_name, co.legal_name, c.name as customer_name, (w.ends_on - (now() at time zone 'Asia/Kolkata')::date) as days_left
           from warranties w join projects p on p.id = w.project_id join leads l on l.id = p.lead_id join companies co on co.id = w.company_id
           join customers c on c.id = w.customer_id order by w.ends_on limit 200`),
      tx.query<Rec>(
        `select a.*, co.legal_name, c.name as customer_name, p.project_number from amc_contracts a join companies co on co.id = a.company_id
           join customers c on c.id = a.customer_id left join projects p on p.id = a.project_id order by a.ends_on limit 200`),
      tx.query<Rec>('select v.*, t.ticket_number from maintenance_visits v left join service_tickets t on t.id = v.ticket_id order by v.visited_on desc limit 100'),
      tx.query<Rec>(
        `select d.*, co.legal_name, c.name as customer_name, o.order_number from disputes d left join companies co on co.id = d.company_id
           left join customers c on c.id = d.customer_id left join orders o on o.id = d.order_id order by (d.status in ('RESOLVED','REJECTED')), d.created_at desc limit 200`),
      tx.query<Rec>(`select p.id, p.project_number, l.project_name, p.customer_id, p.company_id from projects p join leads l on l.id = p.lead_id order by p.created_at desc limit 200`),
      ctx.isInternal ? tx.query<Rec>(`select id, legal_name from companies where status = 'ACTIVE' and category in ('ELEVATOR_COMPANY','SERVICE_PROVIDER') order by legal_name`) : Promise.resolve([] as Rec[]),
    ]);
    return { tickets, warranties, amcs, visits, disputes, projects, providers };
  });
}

export const ticketUpdateSchema = z.object({
  id: zUuid, to: zEnum(['ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const), companyId: zUuid.optional(), note: zOptText(1000),
});
/** AIEC acknowledges and assigns; the assigned partner works and resolves; the customer or AIEC closes. */
export async function updateTicket(ctx: Ctx, input: z.infer<typeof ticketUpdateSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const t = await tx.one<Rec>('select * from service_tickets where id = $1 for update', [input.id]);
    const staff = ctx.isInternal && can(ctx, 'service.manage');
    const partner = Boolean(ctx.companyId && ctx.companyId === t.company_id && can(ctx, 'service.perform'));
    const owner = Boolean(ctx.customerId && ctx.customerId === t.customer_id);
    const allowed = { ACKNOWLEDGED: staff || partner, ASSIGNED: staff, IN_PROGRESS: staff || partner || owner, RESOLVED: staff || partner, CLOSED: staff || owner }[input.to];
    if (!allowed) throw new AppError('FORBIDDEN');
    assertTransition(TICKET_MACHINE, t.status as TicketStatus, input.to);
    if (input.to === 'ASSIGNED' && !input.companyId && !t.company_id) throw new AppError('VALIDATION', undefined, { companyId: 'REQUIRED' });
    if (input.to === 'RESOLVED' && !input.note) throw new AppError('VALIDATION', undefined, { note: 'REQUIRED' });
    if (input.to === 'ASSIGNED' && input.companyId) await tx.one(`select 1 from companies where id = $1 and status = 'ACTIVE'`, [input.companyId]);
    await tx.exec(
      `update service_tickets set status = $2, updated_at = now(), company_id = coalesce($3, company_id),
              acknowledged_at = case when $2 in ('ACKNOWLEDGED','ASSIGNED') then coalesce(acknowledged_at, now()) else acknowledged_at end,
              resolved_at = case when $2 = 'RESOLVED' then now() when $2 = 'IN_PROGRESS' then null else resolved_at end,
              resolution_note = case when $2 = 'RESOLVED' then $4 else resolution_note end where id = $1`,
      [input.id, input.to, input.to === 'ASSIGNED' ? input.companyId ?? null : null, input.note ?? null]);
    await audit(tx, ctx, 'service.ticket_status', 'service_ticket', input.id, { from: t.status, to: input.to }, t.company_id);
    await notifyCustomer(tx, t.customer_id, 'TICKET_UPDATE', { number: t.ticket_number, status: input.to }, '/customer/service');
    const company = input.companyId ?? t.company_id;
    if (company && (input.to === 'ASSIGNED' || owner)) await notifyCompany(tx, company, 'TICKET_UPDATE', { number: t.ticket_number, status: input.to }, '/partner/service');
  });
}

export const visitSchema = z.object({ ticketId: zUuid.optional(), amcId: zUuid.optional(), visitedOn: zDate, notes: zText(2000) });
export async function recordVisit(ctx: Ctx, input: z.infer<typeof visitSchema>): Promise<void> {
  requirePerm(ctx, 'service.perform');
  if (!input.ticketId && !input.amcId) throw new AppError('VALIDATION', undefined, { ticketId: 'REQUIRED' });
  await withCtx(ctx, async (tx) => {
    const parent = input.ticketId
      ? await tx.one<Rec>('select company_id, customer_id from service_tickets where id = $1 and company_id = $2', [input.ticketId, ctx.companyId])
      : await tx.one<Rec>('select company_id, customer_id from amc_contracts where id = $1 and company_id = $2', [input.amcId, ctx.companyId]);
    await tx.exec('insert into maintenance_visits (ticket_id, amc_id, company_id, customer_id, visited_on, notes, recorded_by) values ($1,$2,$3,$4,$5,$6,$7)',
      [input.ticketId ?? null, input.amcId ?? null, parent.company_id, parent.customer_id, input.visitedOn, input.notes, ctx.userId]);
    await audit(tx, ctx, 'service.visit', 'maintenance_visit', null, { ticketId: input.ticketId ?? null, amcId: input.amcId ?? null }, parent.company_id);
  });
}

export const amcSchema = z.object({ projectId: zUuid, companyId: zUuid.optional(), startsOn: zDate, endsOn: zDate, visitsPerYear: zInt(1, 52), terms: zOptText(2000) });
/** Records an AMC agreed between customer and service partner. AIEC tracks it; it is not a party to the maintenance work. */
export async function createAmc(ctx: Ctx, input: z.infer<typeof amcSchema>): Promise<void> {
  requirePerm(ctx, 'service.manage', 'service.perform');
  if (input.endsOn <= input.startsOn) throw new AppError('VALIDATION', undefined, { endsOn: 'INVALID_DATE' });
  await withCtx(ctx, async (tx) => {
    const project = await tx.one<Rec>('select id, company_id, customer_id from projects where id = $1', [input.projectId]);
    const companyId = ctx.isInternal ? input.companyId ?? project.company_id : ctx.companyId;
    if (!ctx.isInternal && project.company_id !== ctx.companyId) throw new AppError('FORBIDDEN');
    const row = await tx.one<{ id: string }>(
      'insert into amc_contracts (project_id, company_id, customer_id, starts_on, ends_on, visits_per_year, terms, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [project.id, companyId, project.customer_id, input.startsOn, input.endsOn, input.visitsPerYear, input.terms ?? null, ctx.userId]);
    await audit(tx, ctx, 'service.amc_create', 'amc_contract', row.id, { projectId: project.id }, companyId);
    await notifyCustomer(tx, project.customer_id, 'AMC_RECORDED', {}, '/customer/service');
  });
}

export const disputeSchema = z.object({ kind: zEnum(DISPUTE_KIND), orderId: zUuid.optional(), description: zText(2000) });
/** Customers, partners and staff can raise a dispute; it is resolved on documented evidence. */
export async function raiseDispute(ctx: Ctx, input: z.infer<typeof disputeSchema>): Promise<void> {
  await withCtx(ctx, async (tx) => {
    const order = input.orderId ? await tx.one<Rec>('select id, company_id, customer_id from orders where id = $1', [input.orderId]) : null; // RLS-scoped
    const row = await tx.one<{ id: string; dispute_number: string }>(
      'insert into disputes (kind, order_id, company_id, customer_id, raised_by, description) values ($1,$2,$3,$4,$5,$6) returning id, dispute_number',
      [input.kind, order?.id ?? null, order?.company_id ?? ctx.companyId, order?.customer_id ?? (ctx.companyId ? null : ctx.customerId), ctx.userId, input.description]);
    await audit(tx, ctx, 'dispute.raise', 'dispute', row.id, { kind: input.kind }, order?.company_id ?? ctx.companyId);
    await notifyPermission(tx, 'dispute.manage', 'DISPUTE_RAISED', { number: row.dispute_number }, '/admin/disputes');
  });
}

export const disputeDecisionSchema = z.object({ id: zUuid, to: zEnum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED'] as const), resolution: zOptText(2000) });
export async function decideDispute(ctx: Ctx, input: z.infer<typeof disputeDecisionSchema>): Promise<void> {
  requirePerm(ctx, 'dispute.manage');
  if (input.to !== 'UNDER_REVIEW' && !input.resolution) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    const d = await tx.one<Rec>('select * from disputes where id = $1 for update', [input.id]);
    if (['RESOLVED', 'REJECTED'].includes(d.status)) throw new AppError('INVALID_TRANSITION');
    const closing = input.to !== 'UNDER_REVIEW';
    await tx.exec(
      `update disputes set status = $2, resolution = coalesce($3, resolution), resolved_by = case when $4 then $5::uuid end, resolved_at = case when $4 then now() end where id = $1`,
      [input.id, input.to, input.resolution ?? null, closing, ctx.userId]);
    await audit(tx, ctx, 'dispute.decide', 'dispute', input.id, { from: d.status, to: input.to }, d.company_id);
    await notifyUsers(tx, [d.raised_by], 'DISPUTE_UPDATE', { number: d.dispute_number, status: input.to }, null);
  });
}
