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
