import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { zOptText, zUuid } from '@/lib/validation';
import { api, jsonBody } from '@/server/api';
import type { Ctx } from '@/server/ctx';
import { withCtx } from '@/server/db';
import * as finance from '@/server/services/finance';
import * as leads from '@/server/services/leads';
import * as matching from '@/server/services/matching';
import * as money from '@/server/services/money';
import * as orders from '@/server/services/orders';
import * as partners from '@/server/services/partners';
import * as projects from '@/server/services/projects';
import * as quality from '@/server/services/quality';
import * as quotations from '@/server/services/quotations';
import * as service from '@/server/services/service';
import * as surveys from '@/server/services/surveys';

// JSON API (spec 11.5). Thin layer only: every rule, permission check and audit entry lives in
// the same services the web workspaces use. Envelope: { ok, data } | { ok: false, error }.

type Handler = (ctx: Ctx, args: { params: string[]; body: Record<string, unknown>; query: URLSearchParams }) => Promise<unknown>;
interface Route { method: 'GET' | 'POST' | 'PATCH'; pattern: string; status?: number; handler: Handler }

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? '_')] ??= /^[A-Z_]+$/.test(issue.message) ? issue.message : 'INVALID';
  throw new AppError('VALIDATION', undefined, fields);
}
const upload = z.object({ fileName: z.string().min(1).max(150), mimeType: z.string(), dataBase64: z.string().min(1), caption: zOptText(300) });
const toFile = (u: z.infer<typeof upload>) => ({ name: u.fileName, type: u.mimeType, bytes: Buffer.from(u.dataBase64, 'base64') });

const ROUTES: Route[] = [
  { method: 'POST', pattern: 'leads', status: 201, handler: (ctx, { body }) => leads.createLead(ctx, parse(leads.leadInputSchema, body)) },
  { method: 'GET', pattern: 'leads', handler: (ctx, { query }) => leads.listLeads(ctx, { status: query.get('status') ?? undefined, q: query.get('q') ?? undefined, page: Number(query.get('page')) || 1 }) },
  { method: 'GET', pattern: 'leads/:id', handler: (ctx, { params }) => leads.getLead(ctx, parse(zUuid, params[0])) },
  { method: 'PATCH', pattern: 'leads/:id', handler: async (ctx, { params, body }) => {
    const input = parse(z.object({ assignedTo: zUuid.optional(), note: zOptText(1000), contacted: z.boolean().optional() }), body);
    const id = parse(zUuid, params[0]);
    if (input.assignedTo) await leads.assignLead(ctx, id, input.assignedTo);
    if (input.contacted) await leads.markContacted(ctx, id, input.note ?? 'Contacted');
    else if (input.note) await leads.addLeadNote(ctx, id, input.note);
    return { id };
  } },
  { method: 'POST', pattern: 'leads/:id/qualify', handler: (ctx, { params, body }) => leads.qualifyLead(ctx, parse(leads.qualifySchema, { ...body, id: params[0] })) },

  { method: 'POST', pattern: 'surveys', status: 201, handler: async (ctx, { body }) => ({ id: await surveys.scheduleSurvey(ctx, parse(surveys.scheduleSurveySchema, body)) }) },
  { method: 'POST', pattern: 'surveys/:id/evidence', status: 201, handler: (ctx, { params, body }) => {
    const u = parse(upload.extend({ capturedAt: z.string().optional() }), body);
    return surveys.addSurveyEvidence(ctx, parse(zUuid, params[0]), toFile(u), u.caption ?? null, u.capturedAt ?? null);
  } },
  { method: 'POST', pattern: 'surveys/:id/submit', handler: (ctx, { params, body }) => surveys.saveSurvey(ctx, parse(surveys.surveyDataSchema, { ...body, id: params[0], submit: '1' })) },

  { method: 'GET', pattern: 'partners/match', handler: async (ctx, { query }) => {
    const leadId = parse(zUuid, query.get('leadId'));
    const summary = await matching.runMatching(ctx, leadId);
    return { ...summary, matches: (await leads.getLead(ctx, leadId)).matches };
  } },
  { method: 'POST', pattern: 'partners', status: 201, handler: async (ctx, { body }) => {
    const input = parse(partners.companySchema.extend({ adminPhone: z.string().optional(), adminName: z.string().optional() }), body);
    return { id: await partners.registerCompany(ctx, input, input.adminPhone && input.adminName ? { phone: input.adminPhone, name: input.adminName } : undefined) };
  } },
  { method: 'POST', pattern: 'partners/:id/verification', handler: (ctx, { params, body }) => partners.changePartnerStatus(ctx, parse(partners.partnerStatusSchema, { ...body, id: params[0] })) },

  { method: 'POST', pattern: 'quotations', handler: (ctx, { body }) => quotations.saveQuotation(ctx, parse(quotations.quotationDraftSchema, { ...body, submit: undefined }), null) },
  { method: 'POST', pattern: 'quotations/:id/submit', handler: (ctx, { params, body }) => quotations.saveQuotation(ctx, parse(quotations.quotationDraftSchema, { ...body, id: params[0], submit: '1' }), null) },
  { method: 'POST', pattern: 'quotations/:id/negotiate', handler: (ctx, { params, body }) =>
    quotations.customerAction(ctx, parse(quotations.customerActionSchema, { ...body, quotationId: params[0], action: 'NEGOTIATE' })) },

  { method: 'POST', pattern: 'orders', status: 201, handler: (ctx, { body }) => quotations.customerAction(ctx, parse(quotations.customerActionSchema, { ...body, action: 'SELECT' })) },
  { method: 'POST', pattern: 'orders/:id/accept', handler: (ctx, { params, body }) => orders.respondOrder(ctx, parse(orders.respondOrderSchema, { decision: 'accept', ...body, id: params[0] })) },
  { method: 'POST', pattern: 'orders/:id/confirm', handler: async (ctx, { params }) => ({ projectId: await orders.confirmOrder(ctx, parse(zUuid, params[0])) }) },

  { method: 'POST', pattern: 'projects/:id/tasks', status: 201, handler: (ctx, { params, body }) => projects.createTask(ctx, parse(projects.taskSchema, { ...body, projectId: params[0] })) },
  { method: 'POST', pattern: 'projects/:id/milestones', handler: (ctx, { body }) => projects.updateMilestone(ctx, parse(projects.milestoneSchema, body)) },
  { method: 'POST', pattern: 'projects/:id/evidence', status: 201, handler: (ctx, { params, body }) => {
    const u = parse(upload.extend({ taskId: zUuid.optional(), clientEventId: zUuid.optional() }), body);
    return withCtx(ctx, (tx) => projects.addWorkEvidence(tx, ctx, { projectId: parse(zUuid, params[0]), taskId: u.taskId, caption: u.caption, capturedAt: new Date(), clientEventId: u.clientEventId }, toFile(u)));
  } },

  { method: 'POST', pattern: 'collections/evidence', status: 201, handler: async (ctx, { body }) => {
    const file = body.file ? toFile(parse(upload, body.file)) : null;
    return { id: await money.submitCollection(ctx, parse(money.collectionSchema, body), file) };
  } },
  { method: 'POST', pattern: 'collections/:id/reconcile', handler: (ctx, { params, body }) => money.reconcileCollection(ctx, parse(money.reconcileSchema, { ...body, id: params[0] })) },
  { method: 'GET', pattern: 'commissions', handler: (ctx, { query }) => money.listLedger(ctx, { status: query.get('status') ?? undefined, page: Number(query.get('page')) || 1 }) },
  { method: 'POST', pattern: 'commissions/:id/invoice', status: 201, handler: async (ctx, { params }) => ({ invoiceId: await money.createInvoice(ctx, parse(zUuid, params[0])) }) },
  { method: 'POST', pattern: 'commissions/:id/adjust', status: 201, handler: (ctx, { params, body }) => money.adjustCommission(ctx, parse(money.adjustmentSchema, { ...body, entryId: params[0] })) },

  { method: 'POST', pattern: 'finance/referrals', status: 201, handler: async (ctx, { body }) => ({ id: await finance.giveFinanceConsent(ctx, parse(finance.consentSchema, body)) }) },
  { method: 'POST', pattern: 'finance/referrals/:id/withdraw-consent', handler: (ctx, { params }) => finance.withdrawFinanceConsent(ctx, parse(zUuid, params[0])) },

  { method: 'POST', pattern: 'qc/inspections', status: 201, handler: (ctx, { body }) => quality.createInspection(ctx, parse(quality.inspectionSchema, body)) },
  { method: 'POST', pattern: 'incidents', status: 201, handler: async (ctx, { body }) => {
    const input = parse(quality.incidentSchema, body);
    return { id: await withCtx(ctx, (tx) => quality.reportIncident(tx, ctx, input)) };
  } },
  { method: 'POST', pattern: 'service/tickets', status: 201, handler: async (ctx, { body }) => ({ id: await service.createTicket(ctx, parse(service.ticketSchema, body)) }) },
];

function match(method: string, segments: string[]): { route: Route; params: string[] } | null {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const parts = route.pattern.split('/');
    if (parts.length !== segments.length) continue;
    const params: string[] = [];
    if (parts.every((part, i) => (part.startsWith(':') ? (params.push(segments[i]), true) : part === segments[i]))) return { route, params };
  }
  return null;
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const found = match(request.method, path);
  if (!found) return api(request, async () => { throw new AppError('NOT_FOUND'); });
  return api(request, async (ctx) => {
    const body = request.method === 'GET' ? {} : await jsonBody(request);
    const result = await found.route.handler(ctx, { params: found.params, body, query: new URL(request.url).searchParams });
    return result ?? { done: true };
  }, found.route.status);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
