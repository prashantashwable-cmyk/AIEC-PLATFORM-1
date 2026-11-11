'use server';

import { z } from 'zod';
import type { ActionResult } from '@/components/ui/form';
import { EVIDENCE_KIND, LEAD_SOURCE } from '@/lib/enums';
import { AppError } from '@/lib/errors';
import { zBool, zEnum, zInt, zOptText, zPhone, zText, zUuid } from '@/lib/validation';
import { runAction } from '@/server/action';
import { withCtx } from '@/server/db';
import * as admin from '@/server/services/admin';
import * as customer from '@/server/services/customer';
import { fileFromForm } from '@/server/services/files';
import * as finance from '@/server/services/finance';
import * as leads from '@/server/services/leads';
import * as matching from '@/server/services/matching';
import * as money from '@/server/services/money';
import { markNotificationsRead } from '@/server/services/notifications';
import * as orders from '@/server/services/orders';
import * as partnerhome from '@/server/services/partnerhome';
import * as partners from '@/server/services/partners';
import * as projects from '@/server/services/projects';
import * as quality from '@/server/services/quality';
import * as quotations from '@/server/services/quotations';
import * as service from '@/server/services/service';
import * as surveys from '@/server/services/surveys';

type R = Promise<ActionResult>;
const idOnly = z.object({ id: zUuid });
const yesNo = zEnum(['yes', 'no'] as const);

// ───────────── leads ─────────────
export async function createLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(leads.leadInputSchema.extend({ source: zEnum(LEAD_SOURCE) }), fd, async (input, ctx) => {
    const lead = await leads.createLead(ctx, input);
    return { redirect: ctx.isInternal ? `/admin/leads/${lead.id}` : `/customer/projects/${lead.id}` };
  });
}
export async function createMyLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(leads.leadInputSchema.omit({ name: true, phone: true, customerType: true }), fd, async (input, ctx) => {
    const lead = await leads.createLead(ctx, { ...input, name: ctx.name, phone: ctx.phone, customerType: 'INDIVIDUAL_OWNER' });
    return { redirect: `/customer/projects/${lead.id}` };
  });
}
export async function contactLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, note: zText(1000) }), fd, (i, ctx) => leads.markContacted(ctx, i.id, i.note));
}
export async function leadNoteAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, note: zText(1000) }), fd, (i, ctx) => leads.addLeadNote(ctx, i.id, i.note));
}
export async function qualifyLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(leads.qualifySchema, fd, (i, ctx) => leads.qualifyLead(ctx, i));
}
export async function assignLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, userId: zUuid }), fd, (i, ctx) => leads.assignLead(ctx, i.id, i.userId));
}
export async function leadExceptionAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, to: zEnum(['LOST', 'ON_HOLD', 'DISQUALIFIED', 'CANCELLED', 'RESUME'] as const), reason: zOptText(500) }), fd,
    (i, ctx) => (i.to === 'RESUME' ? leads.resumeLead(ctx, i.id) : leads.setLeadException(ctx, i.id, i.to, i.reason ?? '')));
}
export async function duplicateReviewAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, decision: yesNo }), fd, (i, ctx) => leads.reviewDuplicate(ctx, i.id, i.decision === 'yes'));
}

// ───────────── surveys ─────────────
export async function scheduleSurveyAction(_p: ActionResult, fd: FormData): R {
  return runAction(surveys.scheduleSurveySchema, fd, async (i, ctx) => { await surveys.scheduleSurvey(ctx, i); });
}
export async function saveSurveyAction(_p: ActionResult, fd: FormData): R {
  return runAction(surveys.surveyDataSchema, fd, (i, ctx) => surveys.saveSurvey(ctx, i));
}
export async function addSurveyEvidenceAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, caption: zOptText(300), capturedAt: zOptText(40), file: z.instanceof(File, { error: 'FILE_REQUIRED' }) }), fd, async (i, ctx) => {
    const file = await fileFromForm(i.file);
    if (file) await surveys.addSurveyEvidence(ctx, i.id, file, i.caption ?? null, i.capturedAt ?? null);
  });
}
export async function reviewSurveyAction(_p: ActionResult, fd: FormData): R {
  return runAction(surveys.reviewSurveySchema, fd, (i, ctx) => surveys.reviewSurvey(ctx, i));
}

// ───────────── matching and quotations ─────────────
export async function runMatchingAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, async (i, ctx) => { await matching.runMatching(ctx, i.id); });
}
export async function invitePartnersAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, companyIds: z.array(zUuid).default([]) }), fd, async (i, ctx) => { await matching.invitePartners(ctx, i.id, i.companyIds); });
}
export async function releaseQuotationsAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, async (i, ctx) => { await quotations.releaseToCustomer(ctx, i.id); });
}
export async function respondInvitationAction(_p: ActionResult, fd: FormData): R {
  return runAction(matching.respondInvitationSchema, fd, async (i, ctx) => {
    const quotationId = await matching.respondInvitation(ctx, i);
    return quotationId ? { redirect: `/partner/quotations/${quotationId}` } : { redirect: '/partner/leads' };
  });
}
export async function saveQuotationAction(_p: ActionResult, fd: FormData): R {
  return runAction(quotations.quotationDraftSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => {
    await quotations.saveQuotation(ctx, i, await fileFromForm(i.file));
    return { message: i.submit ? 'm.quotationSubmitted' : 'common.saved' };
  });
}
export async function startRevisionAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, (i, ctx) => quotations.startRevision(ctx, i.id));
}
export async function clarifyResponseAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, note: zText(1000) }), fd, (i, ctx) => quotations.respondClarification(ctx, i.id, i.note));
}
export async function withdrawQuotationAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, reason: zText(500) }), fd, (i, ctx) => quotations.withdrawQuotation(ctx, i.id, i.reason));
}
export async function customerDecisionAction(_p: ActionResult, fd: FormData): R {
  return runAction(quotations.customerActionSchema, fd, async (i, ctx) => { await quotations.customerAction(ctx, i); return { message: 'm.decisionRecorded' }; });
}
export async function publishRuleAction(_p: ActionResult, fd: FormData): R {
  return runAction(matching.ruleSchema, fd, (i, ctx) => matching.publishMatchingRule(ctx, i));
}

// ───────────── partners ─────────────
export async function registerCompanyAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.companySchema.extend({ adminPhone: zPhone.optional(), adminName: zOptText(120) }), fd, async (i, ctx) => {
    const byStaff = ctx.permissions.has('partner.manage');
    if (byStaff && (!i.adminName || !i.adminPhone)) throw new AppError('VALIDATION', undefined, { adminName: 'REQUIRED', adminPhone: 'REQUIRED' });
    const id = await partners.registerCompany(ctx, i, byStaff && i.adminPhone ? { phone: i.adminPhone, name: i.adminName! } : undefined);
    return { redirect: byStaff ? `/admin/partners/${id}` : '/partner/company' };
  });
}
export async function updateCompanyAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.companySchema.extend({ companyId: zUuid.optional() }), fd, (i, ctx) => partners.updateCompany(ctx, i, i.companyId));
}
export async function addLicenceAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.licenceSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => partners.addLicence(ctx, i, await fileFromForm(i.file)));
}
export async function addInsuranceAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.insuranceSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => partners.addInsurance(ctx, i, await fileFromForm(i.file)));
}
export async function setCapabilityAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.capabilitySchema, fd, (i, ctx) => partners.setCapability(ctx, i));
}
export async function setAreasAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ companyId: zUuid.optional(), zoneIds: z.array(zUuid).default([]), maxConcurrentProjects: zInt(0, 50) }), fd,
    (i, ctx) => partners.setServiceAreas(ctx, i.zoneIds, i.maxConcurrentProjects, i.companyId));
}
export async function submitCompanyAction(_p: ActionResult, _fd: FormData): R {
  return runAction(z.object({}), _fd, (_i, ctx) => partners.submitForReview(ctx));
}
export async function partnerStatusAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.partnerStatusSchema, fd, (i, ctx) => partners.changePartnerStatus(ctx, i));
}
export async function partnerDocReviewAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.docReviewSchema, fd, (i, ctx) => partners.reviewPartnerDocument(ctx, i));
}
export async function verifyCapabilityAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ companyId: zUuid, liftCategory: zText(40), verified: yesNo }), fd,
    (i, ctx) => partners.verifyCapability(ctx, i.companyId, i.liftCategory, i.verified === 'yes'));
}
export async function governanceAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.governanceSchema, fd, (i, ctx) => partners.updateGovernance(ctx, i));
}
export async function performanceEventAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.performanceSchema, fd, (i, ctx) => partners.addPerformanceEvent(ctx, i));
}
export async function addTeamMemberAction(_p: ActionResult, fd: FormData): R {
  return runAction(partners.teamMemberSchema, fd, (i, ctx) => partners.addTeamMember(ctx, i));
}
export async function removeTeamMemberAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ userId: zUuid, role: zText(40) }), fd, (i, ctx) => partners.removeTeamMember(ctx, i.userId, i.role));
}
export async function expirySweepAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({}), fd, async (_i, ctx) => {
    if (!ctx.isInternal) return;
    await partners.runExpirySweep();
  });
}

// ───────────── orders ─────────────
export async function respondOrderAction(_p: ActionResult, fd: FormData): R {
  return runAction(orders.respondOrderSchema, fd, (i, ctx) => orders.respondOrder(ctx, i));
}
export async function assignSupervisorAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, userId: zUuid }), fd, (i, ctx) => orders.assignSupervisor(ctx, i.id, i.userId));
}
export async function orderTermsAction(_p: ActionResult, fd: FormData): R {
  return runAction(orders.orderTermsSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => orders.updateOrderTerms(ctx, i, await fileFromForm(i.file)));
}
export async function confirmOrderAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, async (i, ctx) => ({ redirect: `/admin/projects/${await orders.confirmOrder(ctx, i.id)}` }));
}
export async function orderExceptionAction(_p: ActionResult, fd: FormData): R {
  return runAction(orders.orderExceptionSchema, fd, (i, ctx) => orders.setOrderException(ctx, i));
}

// ───────────── projects ─────────────
export async function projectStatusAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.projectStatusSchema, fd, (i, ctx) => projects.changeProjectStatus(ctx, i));
}
export async function readinessAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.readinessSchema, fd, (i, ctx) => projects.updateReadiness(ctx, i));
}
export async function createTaskAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.taskSchema, fd, (i, ctx) => projects.createTask(ctx, i));
}
export async function reviewTaskAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.taskReviewSchema, fd, (i, ctx) => projects.reviewTask(ctx, i));
}
export async function taskProgressAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ taskId: zUuid, to: zEnum(['IN_PROGRESS', 'DONE_PENDING_REVIEW'] as const), note: zOptText(1000) }), fd,
    (i, ctx) => withCtx(ctx, (tx) => projects.updateTaskProgress(tx, ctx, i)));
}
export async function milestoneAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.milestoneSchema, fd, (i, ctx) => projects.updateMilestone(ctx, i));
}
export async function assignTeamAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ projectId: zUuid, userId: zUuid }), fd, (i, ctx) => projects.assignTeamMember(ctx, i.projectId, i.userId));
}
export async function workEvidenceAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ projectId: zUuid, taskId: zUuid.optional(), caption: zOptText(300), file: z.instanceof(File, { error: 'FILE_REQUIRED' }) }), fd, async (i, ctx) => {
    const file = await fileFromForm(i.file);
    if (file) await withCtx(ctx, (tx) => projects.addWorkEvidence(tx, ctx, { projectId: i.projectId, taskId: i.taskId, caption: i.caption, capturedAt: new Date() }, file));
  });
}
export async function materialAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.materialSchema, fd, (i, ctx) => projects.addMaterialOrder(ctx, i));
}
export async function materialStatusAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.materialStatusSchema, fd, (i, ctx) => projects.updateMaterialStatus(ctx, i));
}
export async function complianceDocAction(_p: ActionResult, fd: FormData): R {
  return runAction(projects.complianceDocSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => projects.addComplianceDocument(ctx, i, await fileFromForm(i.file)));
}

// ───────────── money ─────────────
export async function submitCollectionAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.collectionSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => { await money.submitCollection(ctx, i, await fileFromForm(i.file)); });
}
export async function addCollectionEvidenceAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, kind: zEnum(EVIDENCE_KIND), file: z.instanceof(File).optional() }), fd,
    async (i, ctx) => money.addCollectionEvidence(ctx, i.id, i.kind, await fileFromForm(i.file)));
}
export async function confirmCollectionAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, (i, ctx) => money.customerConfirmCollection(ctx, i.id));
}
export async function reconcileAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.reconcileSchema, fd, (i, ctx) => money.reconcileCollection(ctx, i));
}
export async function refundAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.refundSchema, fd, (i, ctx) => money.recordRefund(ctx, i));
}
export async function createInvoiceAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ companyId: zUuid }), fd, async (i, ctx) => { await money.createInvoice(ctx, i.companyId); });
}
export async function invoicePaymentAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.invoicePaymentSchema, fd, (i, ctx) => money.recordInvoicePayment(ctx, i));
}
export async function adjustCommissionAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.adjustmentSchema, fd, (i, ctx) => money.adjustCommission(ctx, i));
}
export async function commissionPolicyAction(_p: ActionResult, fd: FormData): R {
  return runAction(money.policySchema, fd, (i, ctx) => money.publishCommissionPolicy(ctx, i));
}

// ───────────── finance referral ─────────────
export async function financeConsentAction(_p: ActionResult, fd: FormData): R {
  return runAction(finance.consentSchema, fd, async (i, ctx) => { await finance.giveFinanceConsent(ctx, i); return { message: 'm.consentRecorded' }; });
}
export async function withdrawConsentAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, (i, ctx) => finance.withdrawFinanceConsent(ctx, i.id));
}
export async function referralUpdateAction(_p: ActionResult, fd: FormData): R {
  return runAction(finance.referralUpdateSchema, fd, (i, ctx) => finance.updateReferral(ctx, i));
}
export async function lenderAction(_p: ActionResult, fd: FormData): R {
  return runAction(finance.lenderSchema, fd, (i, ctx) => finance.saveLender(ctx, i));
}

// ───────────── compliance, QC, incidents ─────────────
export async function complianceDecisionAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.docDecisionSchema, fd, (i, ctx) => quality.reviewComplianceDocument(ctx, i));
}
export async function requirementAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.requirementSchema, fd, (i, ctx) => quality.saveRequirement(ctx, i));
}
export async function regulatorySourceAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.sourceSchema, fd, (i, ctx) => quality.saveRegulatorySource(ctx, i));
}
export async function inspectionAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.inspectionSchema, fd, (i, ctx) => quality.createInspection(ctx, i));
}
export async function correctiveActionAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.correctiveSchema, fd, (i, ctx) => quality.updateCorrectiveAction(ctx, i));
}
export async function reportIncidentAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.incidentSchema, fd, async (i, ctx) => { await withCtx(ctx, (tx) => quality.reportIncident(tx, ctx, i)); return { message: 'm.incidentReported' }; });
}
export async function incidentUpdateAction(_p: ActionResult, fd: FormData): R {
  return runAction(quality.incidentUpdateSchema, fd, (i, ctx) => quality.updateIncident(ctx, i));
}

// ───────────── service ─────────────
export async function createTicketAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.ticketSchema, fd, async (i, ctx) => { await service.createTicket(ctx, i); return { message: 'm.ticketCreated' }; });
}
export async function ticketUpdateAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.ticketUpdateSchema, fd, (i, ctx) => service.updateTicket(ctx, i));
}
export async function visitAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.visitSchema, fd, (i, ctx) => service.recordVisit(ctx, i));
}
export async function amcAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.amcSchema, fd, (i, ctx) => service.createAmc(ctx, i));
}
export async function raiseDisputeAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.disputeSchema, fd, (i, ctx) => service.raiseDispute(ctx, i));
}
export async function disputeDecisionAction(_p: ActionResult, fd: FormData): R {
  return runAction(service.disputeDecisionSchema, fd, (i, ctx) => service.decideDispute(ctx, i));
}

// ───────────── administration ─────────────
export async function createStaffAction(_p: ActionResult, fd: FormData): R {
  return runAction(admin.staffSchema, fd, (i, ctx) => admin.createStaffUser(ctx, i));
}
export async function staffRoleAction(_p: ActionResult, fd: FormData): R {
  return runAction(admin.roleChangeSchema, fd, (i, ctx) => admin.changeStaffRole(ctx, i));
}
export async function userActiveAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ userId: zUuid, active: yesNo }), fd, (i, ctx) => admin.setUserActive(ctx, i.userId, i.active === 'yes'));
}
export async function userZonesAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ userId: zUuid, zoneIds: z.array(zUuid).default([]) }), fd, (i, ctx) => admin.setUserZones(ctx, i.userId, i.zoneIds));
}
export async function permissionAction(_p: ActionResult, fd: FormData): R {
  return runAction(admin.permissionToggleSchema, fd, (i, ctx) => admin.togglePermission(ctx, i));
}
export async function settingAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ key: zText(60), value: z.string().trim().max(2000).default('') }), fd, (i, ctx) => admin.saveSetting(ctx, i.key, i.value));
}
export async function zoneAction(_p: ActionResult, fd: FormData): R {
  return runAction(admin.zoneSchema, fd, (i, ctx) => admin.setZoneActive(ctx, i));
}

// ───────────── customer account and notifications ─────────────
export async function resumeMyLeadAction(_p: ActionResult, fd: FormData): R {
  return runAction(idOnly, fd, (i, ctx) => customer.resumeMyLead(ctx, i.id));
}
export async function profileAction(_p: ActionResult, fd: FormData): R {
  return runAction(customer.profileSchema, fd, (i, ctx) => customer.updateProfile(ctx, i));
}
export async function dataRequestAction(_p: ActionResult, fd: FormData): R {
  return runAction(customer.dataRequestSchema, fd, async (i, ctx) => { await customer.submitDataRequest(ctx, i); return { message: 'm.requestRecorded' }; });
}
export async function markReadAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid.optional(), all: zBool }), fd, (i, ctx) => markNotificationsRead(ctx, i.all ? undefined : i.id));
}

// ───────────── catalogue ─────────────
export async function productAction(_p: ActionResult, fd: FormData): R {
  return runAction(partnerhome.productSchema.extend({ file: z.instanceof(File).optional() }), fd, async (i, ctx) => partnerhome.saveProduct(ctx, i, await fileFromForm(i.file)));
}
export async function productActiveAction(_p: ActionResult, fd: FormData): R {
  return runAction(z.object({ id: zUuid, active: yesNo }), fd, (i, ctx) => partnerhome.setProductActive(ctx, i.id, i.active === 'yes'));
}
