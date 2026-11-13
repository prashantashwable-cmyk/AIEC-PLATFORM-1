// Partner matching (spec 5.6): hard eligibility gates first, then an advisory, explainable score.

export const GATE_REASONS = [
  'NOT_LIFT_CONTRACTOR', 'PARTNER_NOT_ACTIVE', 'LICENCE_INVALID', 'INSURANCE_INVALID', 'NO_CAPABILITY', 'NO_CAPACITY',
  'SAFETY_BLOCK', 'OUT_OF_AREA',
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export interface PartnerFacts {
  category: string;
  status: string;
  safetyBlock: boolean;
  /** Days until the verified lift-contractor licence expires; null when there is no valid verified licence. */
  licenceDaysLeft: number | null;
  /** Days until verified insurance expires; null when there is none. */
  insuranceDaysLeft: number | null;
  /** Verified capability for the required lift category, with the maximum floors it covers. */
  capabilityVerified: boolean;
  capabilityMaxFloors: number | null;
  servesZone: boolean;
  maxConcurrentProjects: number;
  activeProjects: number;
  /** Average of verified performance events (0–100); null when there is no history. */
  performanceAvg: number | null;
  /** Share of invitations answered in time (0–1); null when never invited. */
  responseRate: number | null;
}
export interface LeadFacts { floors: number | null }
export interface Weights { compliance: number; capability: number; capacity: number; performance: number; price: number; response: number }
export const DEFAULT_WEIGHTS: Weights = { compliance: 25, capability: 20, capacity: 20, performance: 15, price: 10, response: 10 };

export function eligibility(p: PartnerFacts, lead: LeadFacts): GateReason[] {
  const reasons: GateReason[] = [];
  if (p.category !== 'ELEVATOR_COMPANY') reasons.push('NOT_LIFT_CONTRACTOR');
  if (p.status !== 'ACTIVE') reasons.push('PARTNER_NOT_ACTIVE');
  if (p.licenceDaysLeft === null || p.licenceDaysLeft < 0) reasons.push('LICENCE_INVALID');
  if (p.insuranceDaysLeft === null || p.insuranceDaysLeft < 0) reasons.push('INSURANCE_INVALID');
  if (!p.capabilityVerified || p.capabilityMaxFloors === null || (lead.floors !== null && p.capabilityMaxFloors < lead.floors)) reasons.push('NO_CAPABILITY');
  if (p.maxConcurrentProjects - p.activeProjects <= 0) reasons.push('NO_CAPACITY');
  if (p.safetyBlock) reasons.push('SAFETY_BLOCK');
  if (!p.servesZone) reasons.push('OUT_OF_AREA');
  return reasons;
}

function validityScore(daysLeft: number): number {
  if (daysLeft >= 180) return 100;
  if (daysLeft >= 90) return 85;
  if (daysLeft >= 30) return 70;
  return 50;
}

export interface ScoreBreakdown { compliance: number; capability: number; capacity: number; performance: number; price: number; response: number; total: number }

/**
 * Advisory score for an ELIGIBLE partner. Price is neutral (50) at matching time because no
 * quotation exists yet; missing history is neutral (60) rather than rewarded or punished.
 * Commercial terms such as subscriptions are deliberately not an input.
 */
export function score(p: PartnerFacts, lead: LeadFacts, w: Weights = DEFAULT_WEIGHTS): ScoreBreakdown {
  const compliance = validityScore(Math.min(p.licenceDaysLeft ?? 0, p.insuranceDaysLeft ?? 0));
  const margin = (p.capabilityMaxFloors ?? 0) - (lead.floors ?? 0);
  const capability = lead.floors === null ? 85 : margin >= 2 ? 100 : 85;
  const free = Math.max(0, p.maxConcurrentProjects - p.activeProjects);
  const capacity = p.maxConcurrentProjects > 0 ? Math.round((free / p.maxConcurrentProjects) * 100) : 0;
  const performance = p.performanceAvg === null ? 60 : Math.round(p.performanceAvg);
  const price = 50;
  const response = p.responseRate === null ? 60 : Math.round(p.responseRate * 100);
  const total =
    (compliance * w.compliance + capability * w.capability + capacity * w.capacity + performance * w.performance + price * w.price + response * w.response) / 100;
  return { compliance, capability, capacity, performance, price, response, total: Math.round(total * 100) / 100 };
}
