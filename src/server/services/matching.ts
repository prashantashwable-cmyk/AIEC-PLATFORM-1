import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { eligibility, score, type PartnerFacts, type Weights } from '@/lib/matching';
import { addWorkingDays } from '@/lib/sla';
import { zEnum, zInt, zOptText, zUuid } from '@/lib/validation';
import { audit, getHolidays, getSetting, notifyCompany, notifyPermission } from '../audit';
import { requireCompany, requirePerm, type Ctx } from '../ctx';
import { withCtx, withSystem, type Rec, type Tx } from '../db';
import { leadScope, transitionLead } from './leads';

const MAX_INVITES = 3;

async function partnerFacts(tx: Tx, lead: Rec): Promise<Array<Rec & { facts: PartnerFacts }>> {
  const rows = await tx.query<Rec>(
    `select c.id, c.legal_name, c.category, c.status, c.safety_block, c.max_concurrent_projects,
            app.active_project_count(c.id) as active_projects,
            (select max(l.expiry_date - (now() at time zone 'Asia/Kolkata')::date) from company_licenses l
              where l.company_id = c.id and l.license_type = 'LIFT_CONTRACTOR' and l.verification_status = 'VERIFIED'
                and l.expiry_date >= (now() at time zone 'Asia/Kolkata')::date) as licence_days,
            (select max(i.expiry_date - (now() at time zone 'Asia/Kolkata')::date) from company_insurance_policies i
              where i.company_id = c.id and i.verification_status = 'VERIFIED' and i.expiry_date >= (now() at time zone 'Asia/Kolkata')::date) as insurance_days,
            (select pc.max_floors from partner_capabilities pc where pc.company_id = c.id and pc.lift_category = $1 and pc.verified) as cap_floors,
            exists (select 1 from partner_service_areas a where a.company_id = c.id and a.zone_id = $2) as serves_zone,
            (select avg(e.score) from partner_performance_events e where e.company_id = c.id and e.event_type not in ('INVITE_RESPONDED','INVITE_EXPIRED')) as perf_avg,
            (select count(*) filter (where e.event_type = 'INVITE_RESPONDED')::float / nullif(count(*), 0)
               from partner_performance_events e where e.company_id = c.id and e.event_type in ('INVITE_RESPONDED','INVITE_EXPIRED')) as response_rate
       from companies c where c.status not in ('DRAFT','TERMINATED') order by c.legal_name`, [lead.lift_category, lead.zone_id]);
  return rows.map((r) => ({
    ...r,
    facts: {
      category: r.category, status: r.status, safetyBlock: r.safety_block,
      licenceDaysLeft: r.licence_days, insuranceDaysLeft: r.insurance_days,
      capabilityVerified: r.cap_floors !== null, capabilityMaxFloors: r.cap_floors, servesZone: r.serves_zone,
      maxConcurrentProjects: r.max_concurrent_projects, activeProjects: r.active_projects,
      performanceAvg: r.perf_avg === null ? null : Number(r.perf_avg), responseRate: r.response_rate === null ? null : Number(r.response_rate),
    },
  }));
}

async function activeRule(tx: Tx): Promise<{ id: string; version: number; weights: Weights }> {
  const r = await tx.one<Rec>('select * from matching_rule_versions where is_active');
  return {
    id: r.id, version: r.version,
    weights: { compliance: r.w_compliance, capability: r.w_capability, capacity: r.w_capacity, performance: r.w_performance, price: r.w_price, response: r.w_response },
  };
}

const MATCHABLE = ['SURVEY_COMPLETED', 'PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED', 'CUSTOMER_REVIEW'];

/**
 * Evaluates every partner against the hard eligibility gates, then scores only the eligible ones
 * with the active, versioned rule. Ineligible partners are stored with their reasons.
 */
export async function runMatching(ctx: Ctx, leadId: string): Promise<{ eligible: number; ineligible: number }> {
  requirePerm(ctx, 'matching.run');
  return withCtx(ctx, async (tx) => {
    const scope = leadScope(ctx, 'l', 2);
    const lead = await tx.one<Rec>(`select l.* from leads l where l.id = $1 and ${scope.sql} for update`, [leadId, ...scope.params]);
    if (!MATCHABLE.includes(lead.status)) throw new AppError('INVALID_TRANSITION');
    const rule = await activeRule(tx);
    const partners = await partnerFacts(tx, lead);
    let eligibleCount = 0;
    for (const p of partners) {
      const reasons = eligibility(p.facts, { floors: lead.floors });
      const ok = reasons.length === 0;
      const s = ok ? score(p.facts, { floors: lead.floors }, rule.weights) : null;
      if (ok) eligibleCount++;
      // Scores and reasons are refreshed only while a match is still a suggestion; invitations keep their history.
      await tx.exec(
        `insert into partner_matches (lead_id, company_id, rule_version_id, eligible, ineligibility_reasons, score,
                                      s_compliance, s_capability, s_capacity, s_performance, s_price, s_response)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (lead_id, company_id) do update set rule_version_id = excluded.rule_version_id, eligible = excluded.eligible,
            ineligibility_reasons = excluded.ineligibility_reasons, score = excluded.score, s_compliance = excluded.s_compliance,
            s_capability = excluded.s_capability, s_capacity = excluded.s_capacity, s_performance = excluded.s_performance,
            s_price = excluded.s_price, s_response = excluded.s_response
          where partner_matches.status = 'SUGGESTED'`,
        [leadId, p.id, rule.id, ok, reasons, s?.total ?? null, s?.compliance ?? null, s?.capability ?? null, s?.capacity ?? null,
          s?.performance ?? null, s?.price ?? null, s?.response ?? null]);
    }
    if (lead.status === 'SURVEY_COMPLETED') await transitionLead(tx, ctx, leadId, 'PARTNER_MATCHING', { note: `Matching rule v${rule.version}` });
    await audit(tx, ctx, 'matching.run', 'lead', leadId, { ruleVersion: rule.version, eligible: eligibleCount, evaluated: partners.length });
    return { eligible: eligibleCount, ineligible: partners.length - eligibleCount };
  });
}

/** Invites eligible partners to quote (two or three where available). Gates are re-checked at invitation time. */
export async function invitePartners(ctx: Ctx, leadId: string, companyIds: string[]): Promise<number> {
  requirePerm(ctx, 'quotation.invite');
  if (!companyIds.length) throw new AppError('VALIDATION', undefined, { companyIds: 'REQUIRED' });
  return withCtx(ctx, async (tx) => {
    const scope = leadScope(ctx, 'l', 2);
    const lead = await tx.one<Rec>(`select l.* from leads l where l.id = $1 and ${scope.sql} for update`, [leadId, ...scope.params]);
    if (!['PARTNER_MATCHING', 'QUOTATION_PENDING', 'QUOTATION_RECEIVED'].includes(lead.status)) throw new AppError('INVALID_TRANSITION');
    const live = (await tx.one<{ n: number }>(`select count(*) as n from partner_matches where lead_id = $1 and status in ('INVITED','ACCEPTED')`, [leadId])).n;
    if (live + companyIds.length > MAX_INVITES) throw new AppError('INVITE_LIMIT');
    const facts = new Map((await partnerFacts(tx, lead)).map((p) => [p.id as string, p]));
    const due = addWorkingDays(new Date(), Number(await getSetting(tx, 'sla_partner_response_days')), await getHolidays(tx));
    for (const companyId of companyIds) {
      const p = facts.get(companyId);
      if (!p || eligibility(p.facts, { floors: lead.floors }).length) throw new AppError('PARTNER_NOT_ELIGIBLE');
      const n = await tx.exec(
        `update partner_matches set status = 'INVITED', invited_at = now(), invited_by = $3, respond_due_at = $4
          where lead_id = $1 and company_id = $2 and eligible and status in ('SUGGESTED','EXPIRED')`, [leadId, companyId, ctx.userId, due]);
      if (!n) throw new AppError('PARTNER_NOT_ELIGIBLE');
      await notifyCompany(tx, companyId, 'LEAD_INVITATION', { number: lead.lead_number }, '/partner/leads');
    }
    if (lead.status === 'PARTNER_MATCHING') await transitionLead(tx, ctx, leadId, 'QUOTATION_PENDING', { note: `${companyIds.length} partner(s) invited` });
    await audit(tx, ctx, 'matching.invite', 'lead', leadId, { companyIds });
    return companyIds.length;
  });
}

// ───────────── partner side: lead inbox ─────────────
export async function listInvitations(ctx: Ctx): Promise<Rec[]> {
  requirePerm(ctx, 'quotation.submit');
  const companyId = requireCompany(ctx);
  return withCtx(ctx, (tx) => tx.query<Rec>(
    `select m.id, m.status, m.invited_at, m.respond_due_at, m.responded_at, l.lead_number, l.project_name, l.lift_category, l.floors, l.lift_count,
            l.timeline, z.code as zone_code, q.id as quotation_id
       from partner_matches m join leads l on l.id = m.lead_id join zones z on z.id = l.zone_id
       left join quotations q on q.lead_id = m.lead_id and q.company_id = m.company_id
      where m.company_id = $1 and m.status in ('INVITED','ACCEPTED','DECLINED','EXPIRED') order by m.invited_at desc`, [companyId]));
}

export async function getInvitation(ctx: Ctx, matchId: string) {
  requirePerm(ctx, 'quotation.submit');
  const companyId = requireCompany(ctx);
  return withCtx(ctx, async (tx) => {
    const match = await tx.one<Rec>('select * from partner_matches where id = $1 and company_id = $2', [matchId, companyId]);
    // After a decline or expiry the lead is no longer visible to this partner (RLS), so only the match is returned.
    const lead = await tx.maybeOne<Rec>(
      `select l.id, l.lead_number, l.project_name, l.address, l.building_type, l.floors, l.lift_category, l.lift_count, l.timeline, l.site_readiness,
              l.needs_technical_review, z.code as zone_code, c.name as customer_name, c.customer_type,
              case when $2 then c.phone else null end as customer_phone
         from leads l join zones z on z.id = l.zone_id join customers c on c.id = l.customer_id where l.id = $1`, [match.lead_id, match.status === 'ACCEPTED']);
    const survey = lead ? await tx.maybeOne<Rec>(`select * from site_surveys where lead_id = $1 and status = 'REVIEWED' order by reviewed_at desc limit 1`, [match.lead_id]) : null;
    const evidence = survey ? await tx.query<Rec>(
      'select e.file_id, e.caption, f.mime_type from survey_evidence e join file_objects f on f.id = e.file_id where e.survey_id = $1', [survey.id]) : [];
    const quotation = await tx.maybeOne<Rec>('select id, quotation_number, status from quotations where lead_id = $1 and company_id = $2', [match.lead_id, companyId]);
    return { match, lead, survey, evidence, quotation };
  });
}

export const respondInvitationSchema = z.object({ id: zUuid, decision: zEnum(['accept', 'decline'] as const), reason: zOptText(500) });
export async function respondInvitation(ctx: Ctx, input: z.infer<typeof respondInvitationSchema>): Promise<string | null> {
  requirePerm(ctx, 'quotation.submit');
  const companyId = requireCompany(ctx);
  const accept = input.decision === 'accept';
  if (!accept && !input.reason) throw new AppError('REASON_REQUIRED');
  return withCtx(ctx, async (tx) => {
    const match = await tx.one<Rec>('select * from partner_matches where id = $1 and company_id = $2 for update', [input.id, companyId]);
    if (match.status !== 'INVITED') throw new AppError('INVALID_TRANSITION');
    const lead = await tx.one<Rec>('select id, lead_number, floors from leads where id = $1', [match.lead_id]);
    let quotationId: string | null = null;
    if (accept) {
      const survey = await tx.maybeOne<Rec>(`select floors, stops from site_surveys where lead_id = $1 and status = 'REVIEWED' order by reviewed_at desc limit 1`, [match.lead_id]);
      const quotationDue = addWorkingDays(new Date(), Number(await getSetting(tx, 'sla_quotation_days')), await getHolidays(tx));
      quotationId = (await tx.one<{ id: string }>('insert into quotations (lead_id, company_id, due_at) values ($1, $2, $3) returning id', [match.lead_id, companyId, quotationDue])).id;
      const version = await tx.one<{ id: string }>(
        'insert into quotation_versions (quotation_id, version_no, floors, stops, created_by) values ($1, 1, $2, $3, $4) returning id',
        [quotationId, survey?.floors ?? lead.floors ?? null, survey?.stops ?? null, ctx.userId]);
      await tx.exec('update quotations set current_version_id = $2 where id = $1', [quotationId, version.id]);
    }
    await tx.exec('update partner_matches set status = $2, responded_at = now(), decline_reason = $3 where id = $1',
      [input.id, accept ? 'ACCEPTED' : 'DECLINED', accept ? null : input.reason]);
    await audit(tx, ctx, 'matching.respond', 'partner_match', input.id, { accept, reason: input.reason ?? null }, companyId);
    await notifyPermission(tx, 'quotation.invite', accept ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
      { number: lead.lead_number, name: ctx.companyName }, `/admin/leads/${lead.id}`);
    return quotationId;
  }).then(async (quotationId) => {
    // Response reliability is recorded outside the partner's own write scope.
    await withSystem((tx) => tx.exec(
      `insert into partner_performance_events (company_id, event_type, score, note) values ($1, 'INVITE_RESPONDED', 100, 'Invitation answered in time')`, [companyId]));
    return quotationId;
  });
}

export const ruleSchema = z.object({
  compliance: zInt(0, 100), capability: zInt(0, 100), capacity: zInt(0, 100), performance: zInt(0, 100), price: zInt(0, 100), response: zInt(0, 100),
});
/** Publishes a new matching-rule version. Older versions stay on record for explainability. */
export async function publishMatchingRule(ctx: Ctx, w: z.infer<typeof ruleSchema>): Promise<void> {
  requirePerm(ctx, 'settings.manage');
  if (w.compliance + w.capability + w.capacity + w.performance + w.price + w.response !== 100) throw new AppError('WEIGHTS_TOTAL');
  await withCtx(ctx, async (tx) => {
    const next = (await tx.one<{ v: number }>('select coalesce(max(version), 0) + 1 as v from matching_rule_versions')).v;
    await tx.exec('update matching_rule_versions set is_active = false where is_active');
    await tx.exec(
      `insert into matching_rule_versions (version, w_compliance, w_capability, w_capacity, w_performance, w_price, w_response, is_active, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8)`, [next, w.compliance, w.capability, w.capacity, w.performance, w.price, w.response, ctx.userId]);
    await audit(tx, ctx, 'matching.rule_publish', 'matching_rule', null, { version: next, ...w });
  });
}
