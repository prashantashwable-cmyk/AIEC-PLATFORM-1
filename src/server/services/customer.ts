import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { zEnum, zOptText, zText } from '@/lib/validation';
import { CUSTOMER_TYPE } from '@/lib/enums';
import { audit, notifyPermission } from '../audit';
import { requireCustomer, type Ctx } from '../ctx';
import { withCtx, type Rec } from '../db';
import { transitionLead } from './leads';

/** The customer's own requirements. Every query is additionally scoped by row-level security. */
export async function getCustomerHome(ctx: Ctx) {
  const customerId = requireCustomer(ctx);
  return withCtx(ctx, async (tx) => {
    const leads = await tx.query<Rec>(
      `select l.id, l.lead_number, l.project_name, l.status, l.lift_category, l.created_at, z.code as zone_code,
              (select count(*) from quotations q where q.lead_id = l.id and q.status = 'SUBMITTED') as quotations,
              (select p.status from projects p where p.lead_id = l.id) as project_status
         from leads l join zones z on z.id = l.zone_id where l.customer_id = $1 order by l.created_at desc`, [customerId]);
    return { leads };
  });
}

export async function getCustomerLead(ctx: Ctx, leadId: string) {
  const customerId = requireCustomer(ctx);
  return withCtx(ctx, async (tx) => {
    const lead = await tx.one<Rec>('select l.*, z.code as zone_code from leads l join zones z on z.id = l.zone_id where l.id = $1 and l.customer_id = $2', [leadId, customerId]);
    const [events, survey, order, project] = await Promise.all([
      tx.query<Rec>(`select to_status, created_at from lead_events where lead_id = $1 and source <> 'NOTE' and (from_status is null or from_status <> to_status) order by created_at`, [leadId]),
      tx.maybeOne<Rec>(
        `select s.status, s.scheduled_at, s.visited_at, s.floors, s.stops, s.shaft_width_mm, s.shaft_depth_mm, s.pit_depth_mm, s.overhead_mm, u.full_name as surveyor
           from site_surveys s join users u on u.id = s.surveyor_id where s.lead_id = $1 order by s.created_at desc limit 1`, [leadId]),
      tx.maybeOne<Rec>(
        `select o.id, o.order_number, o.status, o.gross_order_value, o.contract_reference, o.contract_accepted_on, o.contract_file_id, o.confirmed_at, co.legal_name,
                q.quotation_number, v.version_no from orders o join companies co on co.id = o.company_id join quotations q on q.id = o.quotation_id
           join quotation_versions v on v.id = o.quotation_version_id where o.lead_id = $1 and o.status not in ('PARTNER_DECLINED') order by o.created_at desc limit 1`, [leadId]),
      tx.maybeOne<Rec>('select p.*, su.full_name as supervisor_name from projects p left join users su on su.id = p.supervisor_user_id where p.lead_id = $1', [leadId]),
    ]);
    const pid = project?.id ?? null;
    const [milestones, evidence, collections, documents, warranty, defects] = pid ? await Promise.all([
      tx.query<Rec>('select * from project_milestones where project_id = $1 order by seq', [pid]),
      tx.query<Rec>('select e.file_id, e.caption, e.received_at, f.mime_type from work_evidence e join file_objects f on f.id = e.file_id where e.project_id = $1 order by e.received_at desc limit 40', [pid]),
      tx.query<Rec>(
        `select pc.id, pc.amount_received, pc.collection_date, pc.payment_mode, pc.status, pc.customer_confirmed_at, pc.partner_receipt_no, m.name as milestone_name
           from partner_collections pc left join project_milestones m on m.id = pc.milestone_id where pc.project_id = $1 order by pc.collection_date desc`, [pid]),
      tx.query<Rec>('select id, doc_type, reference_number, issue_date, expiry_date, verification_status, file_id from compliance_documents where project_id = $1 order by created_at', [pid]),
      tx.maybeOne<Rec>('select * from warranties where project_id = $1', [pid]),
      tx.query<Rec>('select description, severity, status, created_at from qc_defects where project_id = $1 order by created_at desc', [pid]),
    ]) : [[], [], [], [], null, []] as [Rec[], Rec[], Rec[], Rec[], Rec | null, Rec[]];
    return { lead, events, survey, order, project, milestones, evidence, collections, documents, warranty, defects };
  });
}

export async function resumeMyLead(ctx: Ctx, leadId: string): Promise<void> {
  const customerId = requireCustomer(ctx);
  await withCtx(ctx, async (tx) => {
    const lead = await tx.one<Rec>('select status, status_before_hold, lead_number from leads where id = $1 and customer_id = $2', [leadId, customerId]);
    if (lead.status !== 'ON_HOLD' || !lead.status_before_hold) throw new AppError('INVALID_TRANSITION');
    await transitionLead(tx, ctx, leadId, lead.status_before_hold, { note: 'Customer resumed the requirement' });
    await notifyPermission(tx, 'lead.view.all', 'CUSTOMER_RESUMED', { number: lead.lead_number }, `/admin/leads/${leadId}`);
  });
}

export async function getProfile(ctx: Ctx) {
  const customerId = requireCustomer(ctx);
  return withCtx(ctx, async (tx) => {
    const customer = await tx.one<Rec>('select * from customers where id = $1', [customerId]);
    const consents = await tx.query<Rec>(
      `select cc.*, l.lead_number from customer_consents cc left join leads l on l.id = cc.lead_id where cc.customer_id = $1 order by cc.granted_at desc`, [customerId]);
    return { customer, consents };
  });
}

export const profileSchema = z.object({ name: zText(120), email: z.string().trim().email('INVALID').optional(), customerType: zEnum(CUSTOMER_TYPE) });
/** Correction of the customer's own personal data (data-principal right). */
export async function updateProfile(ctx: Ctx, input: z.infer<typeof profileSchema>): Promise<void> {
  const customerId = requireCustomer(ctx);
  await withCtx(ctx, async (tx) => {
    await tx.exec('update customers set name = $2, email = $3, customer_type = $4 where id = $1', [customerId, input.name, input.email ?? null, input.customerType]);
    await tx.exec('update users set full_name = $2, email = $3 where id = $1', [ctx.userId, input.name, input.email ?? null]);
    await audit(tx, ctx, 'customer.profile_update', 'customer', customerId, {});
  });
}

export const dataRequestSchema = z.object({ kind: zEnum(['ACCESS', 'CORRECTION', 'DELETION', 'WITHDRAW_CONTACT_CONSENT'] as const), note: zOptText(1000) });
/** Records a data-rights request for AIEC to action. Contact consent withdrawal takes effect immediately. */
export async function submitDataRequest(ctx: Ctx, input: z.infer<typeof dataRequestSchema>): Promise<void> {
  const customerId = requireCustomer(ctx);
  await withCtx(ctx, async (tx) => {
    if (input.kind === 'WITHDRAW_CONTACT_CONSENT') {
      await tx.exec(`update customer_consents set withdrawn_at = now() where customer_id = $1 and purpose = 'CONTACT' and withdrawn_at is null`, [customerId]);
    }
    await audit(tx, ctx, 'customer.data_request', 'customer', customerId, { kind: input.kind, note: input.note ?? null });
    await notifyPermission(tx, 'settings.manage', 'DATA_REQUEST', { kind: input.kind, name: ctx.name }, '/admin/audit?action=customer.data_request');
  });
}
