import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { zOptText, zText, zUuid } from '@/lib/validation';
import { audit } from '../audit';
import { requireCompany, requirePerm, type Ctx } from '../ctx';
import { withCtx, type Rec } from '../db';
import { complianceFacts } from './partners';
import { saveFile } from './files';

export async function getPartnerDashboard(ctx: Ctx) {
  const companyId = requireCompany(ctx);
  if (ctx.isTechnician) throw new AppError('FORBIDDEN');
  return withCtx(ctx, async (tx) => {
    const company = await tx.one<Rec>('select id, legal_name, status, grade, category, max_concurrent_projects, safety_block, app.active_project_count(id) as active_projects from companies where id = $1', [companyId]);
    const counts = await tx.one<Rec>(
      `select (select count(*) from partner_matches where company_id = $1 and status = 'INVITED') as invitations,
              (select count(*) from quotations where company_id = $1 and status = 'DRAFT') as drafts,
              (select count(*) from quotations where company_id = $1 and status in ('REVISION_REQUESTED','CLARIFICATION_REQUESTED')) as requests,
              (select count(*) from orders where company_id = $1 and status = 'PENDING_PARTNER_ACCEPTANCE') as orders_pending,
              (select count(*) from project_tasks where company_id = $1 and status = 'DONE_PENDING_REVIEW') as tasks_to_review,
              (select count(*) from partner_collections where company_id = $1 and status = 'PENDING_EVIDENCE') as evidence_pending,
              (select count(*) from commission_invoices where company_id = $1 and status = 'ISSUED') as invoices_open,
              (select count(*) from service_tickets where company_id = $1 and status not in ('RESOLVED','CLOSED')) as tickets_open,
              (select count(*) from projects where company_id = $1 and status = 'STOP_WORK') as stop_work`, [companyId]);
    const facts = await complianceFacts(tx, companyId);
    return { company, counts, facts };
  });
}

// ───────────── catalogue and supply (manufacturers / suppliers) ─────────────
export async function getCatalogue(ctx: Ctx) {
  requirePerm(ctx, 'catalogue.manage');
  const companyId = requireCompany(ctx);
  return withCtx(ctx, async (tx) => ({
    products: await tx.query<Rec>('select * from products where company_id = $1 order by created_at desc', [companyId]),
    // Suppliers see only the material orders addressed to them, never the buyer's wider project data.
    supplyOrders: await tx.query<Rec>(
      `select m.id, m.description, m.quantity, m.unit, m.status, m.expected_date, c.legal_name as buyer from material_orders m join companies c on c.id = m.company_id
        where m.supplier_company_id = $1 order by m.created_at desc`, [companyId]),
  }));
}

export const productSchema = z.object({ id: zUuid.optional(), name: zText(200), model: zOptText(100), category: zText(100), specification: zOptText(2000) });
export async function saveProduct(ctx: Ctx, input: z.infer<typeof productSchema>, file: { name: string; type: string; bytes: Buffer } | null): Promise<void> {
  requirePerm(ctx, 'catalogue.manage');
  const companyId = requireCompany(ctx);
  await withCtx(ctx, async (tx) => {
    const fileId = file ? await saveFile(tx, ctx, file, 'PRODUCT', { companyId }) : null;
    await tx.exec('insert into products (company_id, name, model, category, specification, document_file_id) values ($1,$2,$3,$4,$5,$6)',
      [companyId, input.name, input.model ?? null, input.category, input.specification ?? null, fileId]);
    await audit(tx, ctx, 'catalogue.product_add', 'product', null, { name: input.name }, companyId);
  });
}

export async function setProductActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  requirePerm(ctx, 'catalogue.manage');
  await withCtx(ctx, async (tx) => {
    const n = await tx.exec('update products set is_active = $3 where id = $1 and company_id = $2', [id, requireCompany(ctx), active]);
    if (!n) throw new AppError('NOT_FOUND');
  });
}

// ───────────── capacity and performance (partner self-service views) ─────────────
/** The partner's project load against its own limit and the pilot limit, with the dates of each live project. */
export async function getPartnerCapacity(ctx: Ctx) {
  const companyId = requireCompany(ctx);
  if (ctx.isTechnician) throw new AppError('FORBIDDEN');
  return withCtx(ctx, async (tx) => {
    const company = await tx.one<Rec>('select max_concurrent_projects, app.active_project_count(id) as active from companies where id = $1', [companyId]);
    const projects = await tx.query<Rec>(
      `select p.id, p.project_number, p.status, p.planned_start, p.planned_end, l.project_name,
              ((p.planned_end is not null) and p.planned_end < (now() at time zone 'Asia/Kolkata')::date) as delayed
         from projects p join leads l on l.id = p.lead_id
        where p.company_id = $1 and p.status in ('PLANNING','IN_PROGRESS','ON_HOLD','STOP_WORK','QC','HANDOVER_PENDING')
        order by coalesce(p.planned_start, p.created_at::date), p.project_number`, [companyId]);
    const queued = await tx.query<Rec>(
      `select o.id, o.order_number, o.status, l.project_name from orders o join leads l on l.id = o.lead_id
        where o.company_id = $1 and o.status in ('PENDING_PARTNER_ACCEPTANCE','PARTNER_ACCEPTED') order by o.created_at`, [companyId]);
    const pilot = Number((await tx.maybeOne<{ value: string }>(`select value from system_settings where key = 'pilot_max_active_projects'`))?.value ?? '5');
    const pilotActive = (await tx.one<{ n: number }>('select app.active_project_count() as n')).n;
    return { limit: Number(company.max_concurrent_projects), active: Number(company.active), pilot, pilotActive, projects, queued };
  });
}

/** The partner's own verified performance record: the same events that feed the advisory matching score. */
export async function getPartnerPerformance(ctx: Ctx) {
  const companyId = requireCompany(ctx);
  if (ctx.isTechnician) throw new AppError('FORBIDDEN');
  return withCtx(ctx, async (tx) => {
    const quotes = await tx.one<Rec>(
      `select count(*) filter (where status not in ('DRAFT')) as submitted, count(*) filter (where status = 'SELECTED') as selected from quotations where company_id = $1`, [companyId]);
    const invites = await tx.one<Rec>(
      `select count(*) filter (where status in ('INVITED','ACCEPTED','DECLINED','EXPIRED')) as invited, count(*) filter (where status in ('ACCEPTED','DECLINED')) as answered,
              count(*) filter (where status = 'EXPIRED') as expired from partner_matches where company_id = $1`, [companyId]);
    const score = await tx.one<Rec>(
      `select avg(score)::numeric(5,1)::text as avg_score, count(*) as events from partner_performance_events
        where company_id = $1 and event_type not in ('INVITE_RESPONDED','INVITE_EXPIRED')`, [companyId]);
    const events = await tx.query<Rec>('select id, event_type, score, note, created_at from partner_performance_events where company_id = $1 order by created_at desc limit 30', [companyId]);
    return { quotes, invites, score, events };
  });
}
