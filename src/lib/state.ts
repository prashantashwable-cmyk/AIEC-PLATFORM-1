import { AppError } from './errors';
import type {
  CollectionStatus, IncidentStatus, LeadStatus, OrderStatus, PartnerStatus, ProjectStatus, ReferralStatus, TaskStatus, TicketStatus,
} from './enums';

type Machine<S extends string> = Record<S, readonly S[]>;

const LEAD_EXCEPTIONS: readonly LeadStatus[] = ['LOST', 'ON_HOLD', 'DUPLICATE', 'DISQUALIFIED', 'CANCELLED'];
const leadFlow: Partial<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ['CONTACTED'],
  CONTACTED: ['QUALIFIED'],
  QUALIFIED: ['SURVEY_PENDING'],
  SURVEY_PENDING: ['SURVEY_COMPLETED'],
  SURVEY_COMPLETED: ['PARTNER_MATCHING'],
  PARTNER_MATCHING: ['QUOTATION_PENDING'],
  QUOTATION_PENDING: ['QUOTATION_RECEIVED'],
  QUOTATION_RECEIVED: ['CUSTOMER_REVIEW', 'QUOTATION_PENDING'],
  CUSTOMER_REVIEW: ['NEGOTIATION', 'SELECTED', 'QUOTATION_PENDING'],
  NEGOTIATION: ['CUSTOMER_REVIEW', 'SELECTED'],
  SELECTED: ['ORDER_PENDING'],
  ORDER_PENDING: ['CONFIRMED', 'CUSTOMER_REVIEW'],
};
/** Lead lifecycle (spec 5.1). Any open lead may move to an exception state; ON_HOLD resumes to its previous state. */
export const LEAD_MACHINE = Object.fromEntries(
  (Object.keys(leadFlow) as LeadStatus[]).map((s) => [s, [...(leadFlow[s] ?? []), ...LEAD_EXCEPTIONS]]),
) as Partial<Machine<LeadStatus>>;
export const LEAD_TERMINAL: readonly LeadStatus[] = ['CONFIRMED', 'LOST', 'DUPLICATE', 'DISQUALIFIED', 'CANCELLED'];

export const PARTNER_MACHINE: Machine<PartnerStatus> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'TERMINATED'],
  REJECTED: ['SUBMITTED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  EXPIRED: ['UNDER_RENEWAL', 'TERMINATED'],
  UNDER_RENEWAL: ['ACTIVE', 'EXPIRED', 'TERMINATED'],
  TERMINATED: [],
};

export const ORDER_MACHINE: Machine<OrderStatus> = {
  PENDING_PARTNER_ACCEPTANCE: ['PARTNER_ACCEPTED', 'PARTNER_DECLINED', 'CANCELLED'],
  PARTNER_ACCEPTED: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  PARTNER_DECLINED: [],
  CONFIRMED: ['COMPLETED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['PARTNER_ACCEPTED', 'CONFIRMED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const PROJECT_MACHINE: Machine<ProjectStatus> = {
  PLANNING: ['IN_PROGRESS', 'ON_HOLD', 'STOP_WORK', 'CANCELLED'],
  IN_PROGRESS: ['QC', 'ON_HOLD', 'STOP_WORK', 'CANCELLED'],
  ON_HOLD: ['PLANNING', 'IN_PROGRESS', 'QC', 'HANDOVER_PENDING', 'STOP_WORK', 'CANCELLED'],
  STOP_WORK: ['PLANNING', 'IN_PROGRESS', 'QC', 'HANDOVER_PENDING', 'CANCELLED'],
  QC: ['HANDOVER_PENDING', 'IN_PROGRESS', 'ON_HOLD', 'STOP_WORK'],
  HANDOVER_PENDING: ['HANDED_OVER', 'QC', 'ON_HOLD', 'STOP_WORK'],
  HANDED_OVER: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const COLLECTION_MACHINE: Machine<CollectionStatus> = {
  PENDING_EVIDENCE: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DISPUTED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'DISPUTED'],
  VERIFIED: ['REFUNDED', 'DISPUTED'],
  REJECTED: [],
  DISPUTED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'REFUNDED'],
  REFUNDED: ['REFUNDED'],
};

export const REFERRAL_MACHINE: Machine<ReferralStatus> = {
  CONSENT_PENDING: ['CONSENTED', 'WITHDRAWN', 'EXPIRED'],
  CONSENTED: ['READY_TO_REFER', 'WITHDRAWN', 'EXPIRED'],
  READY_TO_REFER: ['REFERRED', 'WITHDRAWN', 'EXPIRED'],
  REFERRED: ['LENDER_CONTACTED', 'APPLICATION_IN_PROGRESS', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  LENDER_CONTACTED: ['APPLICATION_IN_PROGRESS', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  APPLICATION_IN_PROGRESS: ['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};
/** Statuses that describe the lender's own process: they must be attributed to the lender or the customer. */
export const REFERRAL_NEEDS_SOURCE: readonly ReferralStatus[] = ['LENDER_CONTACTED', 'APPLICATION_IN_PROGRESS', 'APPROVED', 'REJECTED'];

export const INCIDENT_MACHINE: Machine<IncidentStatus> = {
  REPORTED: ['TRIAGED', 'EMERGENCY_ESCALATION'],
  TRIAGED: ['EMERGENCY_ESCALATION', 'INVESTIGATION'],
  EMERGENCY_ESCALATION: ['INVESTIGATION'],
  INVESTIGATION: ['CORRECTIVE_ACTION'],
  CORRECTIVE_ACTION: ['REVIEWED'],
  REVIEWED: ['CLOSED', 'CORRECTIVE_ACTION'],
  CLOSED: [],
};

export const TICKET_MACHINE: Machine<TicketStatus> = {
  OPEN: ['ACKNOWLEDGED', 'ASSIGNED', 'CLOSED'],
  ACKNOWLEDGED: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export const TASK_MACHINE: Machine<TaskStatus> = {
  TODO: ['IN_PROGRESS', 'DONE_PENDING_REVIEW'],
  IN_PROGRESS: ['DONE_PENDING_REVIEW'],
  DONE_PENDING_REVIEW: ['APPROVED', 'REWORK'],
  REWORK: ['IN_PROGRESS', 'DONE_PENDING_REVIEW'],
  APPROVED: [],
};

export function canTransition<S extends string>(machine: Partial<Machine<S>>, from: S, to: S): boolean {
  return (machine[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(machine: Partial<Machine<S>>, from: S, to: S): void {
  if (!canTransition(machine, from, to)) throw new AppError('INVALID_TRANSITION', { from, to });
}
