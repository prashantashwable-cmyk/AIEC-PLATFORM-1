import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/config';
import { fromPaise, toPaise } from '@/lib/commission';
import { type OrderStatus } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { ORDER_MACHINE, assertTransition } from '@/lib/state';
import { zEnum, zMoney, zOptDate, zOptText, zUuid } from '@/lib/validation';
import { audit, getSetting, notifyCompany, notifyCustomer, notifyPermission, notifyUsers } from '../audit';
import { can, requireCompany, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';
import { saveFile } from './files';
import { transitionLead } from './leads';
import { complianceFacts } from './partners';

type Upload = { name: string; type: string; bytes: Buffer } | null;

async function setOrderStatus(tx: Tx, ctx: Ctx | null, orderId: string, from: OrderStatus, to: OrderStatus, reason: string | null): Promise<void> {
  assertTransition(ORDER_MACHINE, from, to);
  await tx.exec('update orders set status = $2, status_reason = $3, updated_at = now() where id = $1', [orderId, to, reason]);
  await tx.exec('insert into order_state_events (order_id, from_status, to_status, actor_id, reason) values ($1,$2,$3,$4,$5)',
    [orderId, from, to, ctx?.userId ?? null, reason]);
  await audit(tx, ctx, 'order.status', 'order', orderId, { from, to, reason });
}

/** Orders visible to the caller: staff (order.view.all), the partner company, or the customer. RLS enforces the same. */
export async function listOrders(ctx: Ctx, filter: { status?: string; page?: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (can(ctx, 'order.view.all')) where.push('true');
  else if (can(ctx, 'order.accept')) { params.push(requireCompany(ctx)); where.push(`o.company_id = $${params.length}`); }
  else throw new AppError('FORBIDDEN');
  if (filter.status) { params.push(filter.status); where.push(`o.status = $${params.length}`); }
  const page = Math.max(1, filter.page ?? 1);
  return withCtx(ctx, async (tx) => {
    const from = `from orders o join companies co on co.id = o.company_id join customers c on c.id = o.customer_id join leads l on l.id = o.lead_id
                  where ${where.join(' and ')}`;
    const total = (await tx.one<{ n: number }>(`select count(*) as n ${from}`, params)).n;
    const rows = await tx.query<Rec>(
      `select o.id, o.order_number, o.status, o.gross_order_value, o.eligible_value, o.created_at, o.confirmed_at, co.legal_name, c.name as customer_name,
              l.project_name, l.lead_number ${from} order by o.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page };
  });
}

export interface OrderGate { key: string; ok: boolean }

/** Pre-confirmation checklist (spec 5.9). Every gate must pass; capacity is re-checked under lock at confirmation. */
async function orderGates(tx: Tx, order: Rec): Promise<{ gates: OrderGate[]; active: number; max: number; partnerActive: number; partnerMax: number }> {
  const facts = await complianceFacts(tx, order.company_id);
  const company = await tx.one<Rec>('select status, safety_block, max_concurrent_projects from companies where id = $1', [order.company_id]);
  const max = Number(await getSetting(tx, 'pilot_max_active_projects'));
  const active = (await tx.one<{ n: number }>('select app.active_project_count() as n')).n;
  const partnerActive = (await tx.one<{ n: number }>('select app.active_project_count($1) as n', [order.company_id])).n;
  const milestoneSum = (await tx.one<{ s: string | null }>('select sum(percent)::text as s from quotation_milestones where version_id = $1', [order.quotation_version_id])).s;
  const gates: OrderGate[] = [
    { key: 'customerSelection', ok: true },
    { key: 'partnerAcceptance', ok: ['PARTNER_ACCEPTED', 'CONFIRMED', 'COMPLETED'].includes(order.status) || (order.status === 'ON_HOLD' && Boolean(order.partner_responded_at)) },
    { key: 'frozenScope', ok: Boolean(order.quotation_version_id) },
    { key: 'contract', ok: Boolean(order.contract_reference && order.contract_accepted_on) },
    { key: 'paymentSchedule', ok: milestoneSum !== null && Number(milestoneSum) === 100 },
    { key: 'eligibleValue', ok: order.eligible_value !== null },
    { key: 'approvalPath', ok: Boolean(order.approval_path_note) },
    { key: 'licence', ok: facts.licenceDaysLeft !== null },
    { key: 'insurance', ok: facts.insuranceDaysLeft !== null },
    { key: 'partnerStatus', ok: company.status === 'ACTIVE' && !company.safety_block },
    { key: 'aiecCapacity', ok: active < max },
    { key: 'partnerCapacity', ok: partnerActive < company.max_concurrent_projects },
    { key: 'supervisor', ok: Boolean(order.supervisor_user_id) },
  ];
  return { gates, active, max, partnerActive, partnerMax: company.max_concurrent_projects };
}

export async function getOrder(ctx: Ctx, id: string) {
  return withCtx(ctx, async (tx) => {
    const order = await tx.one<Rec>(
      `select o.*, co.legal_name, c.name as customer_name, c.phone as customer_phone, l.lead_number, l.project_name, l.address, q.quotation_number,
              v.version_no, v.manufacturer, v.model, v.total_amount, v.warranty_months, su.full_name as supervisor_name,
              (select id from projects p where p.order_id = o.id) as project_id
         from orders o join companies co on co.id = o.company_id join customers c on c.id = o.customer_id join leads l on l.id = o.lead_id
         join quotations q on q.id = o.quotation_id join quotation_versions v on v.id = o.quotation_version_id
         left join users su on su.id = o.supervisor_user_id where o.id = $1`, [id]);
    const [events, milestones, supervisors] = await Promise.all([
      tx.query<Rec>('select e.*, u.full_name as actor from order_state_events e left join users u on u.id = e.actor_id where e.order_id = $1 order by e.created_at', [id]),
      tx.query<Rec>('select seq, name, percent from quotation_milestones where version_id = $1 order by seq', [order.quotation_version_id]),
      ctx.isInternal || ctx.companyId === order.company_id
        ? tx.query<Rec>(
          `select distinct u.id, u.full_name from user_roles ur join users u on u.id = ur.user_id
            where ur.company_id = $1 and ur.revoked_at is null and ur.role_code in ('PARTNER_ADMIN','PARTNER_SUPERVISOR') order by u.full_name`, [order.company_id])
        : Promise.resolve([] as Rec[]),
    ]);
    const checklist = ctx.isInternal ? await orderGates(tx, order) : null;
    return { order, events, milestones, supervisors, checklist };
  });
}

export const respondOrderSchema = z.object({ id: zUuid, decision: zEnum(['accept', 'decline'] as const), supervisorUserId: zUuid.optional(), reason: zOptText(500) });

/** Partner acceptance is mandatory before confirmation. A decline returns the customer to quotation review. */
export async function respondOrder(ctx: Ctx, input: z.infer<typeof respondOrderSchema>): Promise<void> {
  requirePerm(ctx, 'order.accept');
  const companyId = requireCompany(ctx);
  const accept = input.decision === 'accept';
  if (!accept && !input.reason) throw new AppError('REASON_REQUIRED');
  // Authorised against the partner's own order, then applied as one trusted transaction (it also touches other partners' quotations).
  await withSystem(async (tx) => {
    const order = await tx.one<Rec>('select * from orders where id = $1 and company_id = $2 for update', [input.id, companyId]);
    if (order.status !== 'PENDING_PARTNER_ACCEPTANCE') throw new AppError('INVALID_TRANSITION');
    if (accept) {
      if (input.supervisorUserId) await assertCompanySupervisor(tx, companyId, input.supervisorUserId);
      await tx.exec('update orders set partner_responded_at = now(), partner_responded_by = $2, supervisor_user_id = coalesce($3, supervisor_user_id) where id = $1',
        [input.id, ctx.userId, input.supervisorUserId ?? null]);
      await setOrderStatus(tx, ctx, input.id, order.status, 'PARTNER_ACCEPTED', null);
      await notifyPermission(tx, 'order.manage', 'ORDER_ACCEPTED', { number: order.order_number }, `/admin/orders/${input.id}`);
    } else {
      await tx.exec('update orders set partner_responded_at = now(), partner_responded_by = $2, partner_decline_reason = $3 where id = $1', [input.id, ctx.userId, input.reason]);
      await setOrderStatus(tx, ctx, input.id, order.status, 'PARTNER_DECLINED', input.reason ?? null);
      await tx.exec(`update quotations set status = 'WITHDRAWN', updated_at = now() where id = $1`, [order.quotation_id]);
      await tx.exec(`update quotations q set status = 'SUBMITTED', updated_at = now() from quotation_versions v
                      where v.id = q.current_version_id and v.submitted_at is not null and q.lead_id = $1 and q.status = 'NOT_SELECTED'`, [order.lead_id]);
      await transitionLead(tx, ctx, order.lead_id, 'CUSTOMER_REVIEW', { note: 'Selected partner declined the order' });
      await notifyPermission(tx, 'order.manage', 'ORDER_DECLINED', { number: order.order_number }, `/admin/orders/${input.id}`);
    }
    await notifyCustomer(tx, order.customer_id, accept ? 'ORDER_ACCEPTED' : 'ORDER_DECLINED', { number: order.order_number }, `/customer/projects/${order.lead_id}`);
  });
}

async function assertCompanySupervisor(tx: Tx, companyId: string, userId: string): Promise<void> {
  await tx.one(
    `select 1 from user_roles where user_id = $1 and company_id = $2 and revoked_at is null and role_code in ('PARTNER_ADMIN','PARTNER_SUPERVISOR') limit 1`,
    [userId, companyId]);
}

export async function assignSupervisor(ctx: Ctx, orderId: string, userId: string): Promise<void> {
  requirePerm(ctx, 'order.accept', 'order.manage');
  await withCtx(ctx, async (tx) => {
    const order = await tx.one<Rec>('select id, company_id, status from orders where id = $1 for update', [orderId]);
    if (!ctx.isInternal && order.company_id !== ctx.companyId) throw new AppError('FORBIDDEN');
    if (['PARTNER_DECLINED', 'CANCELLED', 'COMPLETED'].includes(order.status)) throw new AppError('INVALID_TRANSITION');
    await assertCompanySupervisor(tx, order.company_id, userId);
    await tx.exec('update orders set supervisor_user_id = $2, updated_at = now() where id = $1', [orderId, userId]);
    await tx.exec('update projects set supervisor_user_id = $2 where order_id = $1', [orderId, userId]);
    await tx.exec(
      `insert into project_team_assignments (project_id, user_id, company_id, assigned_by)
       select p.id, $2, p.company_id, $3 from projects p where p.order_id = $1 on conflict do nothing`, [orderId, userId, ctx.userId]);
    await audit(tx, ctx, 'order.supervisor', 'order', orderId, { supervisorUserId: userId }, order.company_id);
  });
}

export const orderTermsSchema = z.object({
  id: zUuid, eligibleValue: zMoney, exclusionsNote: zOptText(1000), contractReference: zOptText(200), contractAcceptedOn: zOptDate, approvalPathNote: zOptText(2000),
});
/** Records the commercial frame: net eligible value (agreement-defined exclusions), contract and approval path. */
export async function updateOrderTerms(ctx: Ctx, input: z.infer<typeof orderTermsSchema>, contractFile: Upload): Promise<void> {
  requirePerm(ctx, 'order.manage');
  await withCtx(ctx, async (tx) => {
    const order = await tx.one<Rec>('select * from orders where id = $1 for update', [input.id]);
    if (!['PENDING_PARTNER_ACCEPTANCE', 'PARTNER_ACCEPTED', 'ON_HOLD'].includes(order.status)) throw new AppError('INVALID_TRANSITION');
    if (toPaise(input.eligibleValue) > toPaise(order.gross_order_value)) throw new AppError('ELIGIBLE_VALUE_EXCEEDS', undefined, { eligibleValue: 'INVALID_AMOUNT' });
    const fileId = contractFile ? await saveFile(tx, ctx, contractFile, 'CONTRACT', { companyId: order.company_id, customerId: order.customer_id }) : null;
    await tx.exec(
      `update orders set eligible_value = $2, exclusions_note = $3, contract_reference = $4, contract_accepted_on = $5, approval_path_note = $6,
              contract_file_id = coalesce($7, contract_file_id), updated_at = now() where id = $1`,
      [input.id, input.eligibleValue, input.exclusionsNote ?? null, input.contractReference ?? null, input.contractAcceptedOn ?? null, input.approvalPathNote ?? null, fileId]);
    await audit(tx, ctx, 'order.terms', 'order', input.id, { eligibleValue: input.eligibleValue, contractReference: input.contractReference ?? null }, order.company_id);
  });
}

const GATE_ERRORS: Record<string, string> = {
  partnerAcceptance: 'ORDER_NOT_ACCEPTED', contract: 'CONTRACT_REQUIRED', paymentSchedule: 'MILESTONES_TOTAL', eligibleValue: 'ELIGIBLE_VALUE_REQUIRED',
  approvalPath: 'APPROVAL_PATH_REQUIRED', licence: 'LICENCE_INVALID', insurance: 'INSURANCE_INVALID', partnerStatus: 'PARTNER_NOT_ACTIVE',
  aiecCapacity: 'CAPACITY_FULL', partnerCapacity: 'PARTNER_CAPACITY_FULL', supervisor: 'SUPERVISOR_REQUIRED',
};

/**
 * Confirms the order and opens the project. Serialised with an advisory lock so that two
 * simultaneous confirmations can never exceed the pilot capacity. Confirmation does not
 * mean statutory permission has been obtained.
 */
export async function confirmOrder(ctx: Ctx, orderId: string): Promise<string> {
  requirePerm(ctx, 'order.confirm');
  return withCtx(ctx, async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('aiec:project-capacity'))`);
    const order = await tx.one<Rec>('select * from orders where id = $1 for update', [orderId]);
    if (['CONFIRMED', 'COMPLETED', 'CANCELLED', 'PARTNER_DECLINED'].includes(order.status)) throw new AppError('INVALID_TRANSITION');
    if (order.status !== 'PARTNER_ACCEPTED') throw new AppError('ORDER_NOT_ACCEPTED');
    const { gates, active, max } = await orderGates(tx, order);
    const failed = gates.find((g) => !g.ok);
    if (failed) throw new AppError(GATE_ERRORS[failed.key] ?? 'INVALID_TRANSITION', { active, max });

    await tx.exec('update orders set confirmed_at = now(), confirmed_by = $2 where id = $1', [orderId, ctx.userId]);
    await setOrderStatus(tx, ctx, orderId, order.status, 'CONFIRMED', null);
    const project = await tx.one<{ id: string; project_number: string }>(
      `insert into projects (order_id, lead_id, company_id, customer_id, supervisor_user_id) values ($1,$2,$3,$4,$5) returning id, project_number`,
      [orderId, order.lead_id, order.company_id, order.customer_id, order.supervisor_user_id]);
    await tx.exec(`insert into project_state_events (project_id, to_status, actor_id, reason) values ($1, 'PLANNING', $2, 'Order confirmed')`, [project.id, ctx.userId]);
    await tx.exec('insert into project_team_assignments (project_id, user_id, company_id, assigned_by) values ($1,$2,$3,$4)',
      [project.id, order.supervisor_user_id, order.company_id, ctx.userId]);

    // Payment milestones are frozen from the selected quotation version; the last one absorbs rounding.
    const milestones = await tx.query<Rec>('select seq, name, percent::text as percent from quotation_milestones where version_id = $1 order by seq', [order.quotation_version_id]);
    const gross = toPaise(order.gross_order_value);
    let allocated = 0n;
    for (const [i, m] of milestones.entries()) {
      const amount = i === milestones.length - 1 ? gross - allocated : (gross * BigInt(Math.round(Number(m.percent) * 100))) / 10000n;
      allocated += amount;
      await tx.exec('insert into project_milestones (project_id, company_id, seq, name, percent, amount_due) values ($1,$2,$3,$4,$5,$6)',
        [project.id, order.company_id, m.seq, m.name, m.percent, fromPaise(amount)]);
    }
    await tx.exec(`update quotations set status = 'NOT_SELECTED', updated_at = now() where lead_id = $1 and id <> $2 and status not in ('WITHDRAWN','EXPIRED','NOT_SELECTED')`,
      [order.lead_id, order.quotation_id]);
    await transitionLead(tx, ctx, order.lead_id, 'CONFIRMED', { note: `Order ${order.order_number} confirmed` });
    await notifyCompany(tx, order.company_id, 'ORDER_CONFIRMED', { number: order.order_number }, `/partner/projects/${project.id}`);
    await notifyUsers(tx, [order.supervisor_user_id], 'PROJECT_ASSIGNED', { number: project.project_number }, `/partner/projects/${project.id}`);
    await notifyCustomer(tx, order.customer_id, 'ORDER_CONFIRMED', { number: order.order_number }, `/customer/projects/${order.lead_id}`);
    return project.id;
  });
}

export const orderExceptionSchema = z.object({ id: zUuid, to: zEnum(['ON_HOLD', 'CANCELLED', 'RESUME'] as const), reason: zOptText(500) });
export async function setOrderException(ctx: Ctx, input: z.infer<typeof orderExceptionSchema>): Promise<void> {
  requirePerm(ctx, 'order.manage');
  if (input.to !== 'RESUME' && !input.reason) throw new AppError('REASON_REQUIRED');
  await withCtx(ctx, async (tx) => {
    const order = await tx.one<Rec>('select * from orders where id = $1 for update', [input.id]);
    if (input.to === 'RESUME') {
      if (order.status !== 'ON_HOLD') throw new AppError('INVALID_TRANSITION');
      await setOrderStatus(tx, ctx, input.id, 'ON_HOLD', order.confirmed_at ? 'CONFIRMED' : 'PARTNER_ACCEPTED', 'Resumed');
      return;
    }
    await setOrderStatus(tx, ctx, input.id, order.status, input.to, input.reason ?? null);
    if (input.to === 'CANCELLED') {
      const project = await tx.maybeOne<Rec>('select id, status from projects where order_id = $1 for update', [input.id]);
      if (project && !['HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(project.status)) {
        await tx.exec(`update projects set status = 'CANCELLED', status_reason = $2, updated_at = now() where id = $1`, [project.id, input.reason]);
        await tx.exec(`insert into project_state_events (project_id, from_status, to_status, actor_id, reason) values ($1,$2,'CANCELLED',$3,$4)`,
          [project.id, project.status, ctx.userId, input.reason]);
      }
      await tx.exec(`update leads set status = 'CANCELLED', updated_at = now() where id = $1 and status in ('ORDER_PENDING','CONFIRMED')`, [order.lead_id]);
      await tx.exec(`insert into lead_events (lead_id, from_status, to_status, actor_id, reason) values ($1, null, 'CANCELLED', $2, $3)`, [order.lead_id, ctx.userId, `Order cancelled: ${input.reason}`]);
    }
    await notifyCompany(tx, order.company_id, 'ORDER_STATUS', { number: order.order_number, status: input.to }, `/partner/orders/${input.id}`);
    await notifyCustomer(tx, order.customer_id, 'ORDER_STATUS', { number: order.order_number, status: input.to }, `/customer/projects/${order.lead_id}`);
  });
}
