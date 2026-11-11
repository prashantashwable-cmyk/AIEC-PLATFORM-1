// Single source of truth for every explicit state / category used by the
// database CHECK constraints, validation schemas, state machines and UI labels.

export const LOCALES = ['en', 'hi', 'mr'] as const;
export type Locale = (typeof LOCALES)[number];

export const LEAD_STATUS = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'SURVEY_PENDING', 'SURVEY_COMPLETED', 'PARTNER_MATCHING',
  'QUOTATION_PENDING', 'QUOTATION_RECEIVED', 'CUSTOMER_REVIEW', 'NEGOTIATION', 'SELECTED',
  'ORDER_PENDING', 'CONFIRMED', 'LOST', 'ON_HOLD', 'DUPLICATE', 'DISQUALIFIED', 'CANCELLED',
] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_SOURCE = [
  'WEBSITE', 'CUSTOMER_APP', 'WHATSAPP', 'PHONE', 'BUILDER_REFERRAL', 'ARCHITECT_REFERRAL',
  'SURVEYOR', 'DIGITAL_ADS', 'CUSTOMER_REFERRAL',
] as const;
export const CUSTOMER_TYPE = ['INDIVIDUAL_OWNER', 'BUILDER', 'HOUSING_SOCIETY', 'ARCHITECT', 'COMMERCIAL_OWNER'] as const;
export const BUILDING_TYPE = [
  'RESIDENTIAL_BUNGALOW', 'RESIDENTIAL_APARTMENT', 'COMMERCIAL', 'HOSPITAL', 'INDUSTRIAL', 'MIXED_USE', 'OTHER',
] as const;
export const LIFT_CATEGORY = [
  'PASSENGER_RESIDENTIAL', 'PASSENGER_COMMERCIAL', 'HOME_LIFT', 'GOODS', 'HOSPITAL_BED', 'FIRE_SERVICE', 'CUSTOM',
] as const;
export type LiftCategory = (typeof LIFT_CATEGORY)[number];
/** Categories that always need additional technical review (spec 3.2). */
export const COMPLEX_LIFT_CATEGORIES: readonly LiftCategory[] = ['GOODS', 'HOSPITAL_BED', 'FIRE_SERVICE', 'CUSTOM'];
export const TIMELINE = ['IMMEDIATE', 'ONE_TO_THREE_MONTHS', 'THREE_TO_SIX_MONTHS', 'SIX_PLUS_MONTHS', 'UNDECIDED'] as const;
export const SITE_READINESS = ['NOT_STARTED', 'UNDER_CONSTRUCTION', 'SHAFT_READY', 'EXISTING_BUILDING', 'UNKNOWN'] as const;

export const SURVEY_STATUS = ['SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'REWORK_REQUIRED', 'CANCELLED'] as const;
export type SurveyStatus = (typeof SURVEY_STATUS)[number];

export const COMPANY_CATEGORY = [
  'ELEVATOR_COMPANY', 'MANUFACTURER', 'SUPPLIER', 'INSTALLATION_SUBCONTRACTOR', 'SERVICE_PROVIDER', 'QC_PROVIDER',
] as const;
export const ENTITY_TYPE = ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'OTHER'] as const;
export const PARTNER_STATUS = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'UNDER_RENEWAL', 'TERMINATED',
] as const;
export type PartnerStatus = (typeof PARTNER_STATUS)[number];
export const PARTNER_GRADE = ['UNGRADED', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export const LICENSE_TYPE = ['LIFT_CONTRACTOR', 'ELECTRICAL_CONTRACTOR', 'OTHER'] as const;
export const INSURANCE_TYPE = ['PUBLIC_LIABILITY', 'WORKMEN_COMPENSATION', 'CONTRACTOR_ALL_RISK', 'OTHER'] as const;
export const VERIFICATION_STATUS = ['PENDING', 'VERIFIED', 'REJECTED'] as const;

export const MATCH_STATUS = ['SUGGESTED', 'INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;
export const QUOTATION_STATUS = [
  'DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'CLARIFICATION_REQUESTED', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN', 'EXPIRED',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUS)[number];
export const SELECTION_ACTION = ['SELECT', 'NEGOTIATE', 'CLARIFY', 'REQUEST_ANOTHER', 'REJECT_ALL', 'HOLD'] as const;
export type SelectionAction = (typeof SELECTION_ACTION)[number];

export const ORDER_STATUS = [
  'PENDING_PARTNER_ACCEPTANCE', 'PARTNER_ACCEPTED', 'PARTNER_DECLINED', 'CONFIRMED', 'ON_HOLD', 'COMPLETED', 'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];
export const PROJECT_STATUS = [
  'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'STOP_WORK', 'QC', 'HANDOVER_PENDING', 'HANDED_OVER', 'CLOSED', 'CANCELLED',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
/** Statuses that occupy one of the pilot's concurrent project slots. */
export const ACTIVE_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'STOP_WORK', 'QC', 'HANDOVER_PENDING',
];
export const MILESTONE_STATUS = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export const TASK_STATUS = ['TODO', 'IN_PROGRESS', 'DONE_PENDING_REVIEW', 'APPROVED', 'REWORK'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const MATERIAL_STATUS = ['PLANNED', 'ORDERED', 'DISPATCHED', 'DELIVERED'] as const;

export const COLLECTION_STATUS = [
  'PENDING_EVIDENCE', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'DISPUTED', 'REFUNDED',
] as const;
export type CollectionStatus = (typeof COLLECTION_STATUS)[number];
export const PAYMENT_MODE = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'DEMAND_DRAFT', 'CASH', 'LOAN_DISBURSEMENT', 'OTHER'] as const;
export const EVIDENCE_KIND = ['BANK_PROOF', 'PARTNER_RECEIPT', 'SCREENSHOT', 'OTHER'] as const;
export const LEDGER_STATUS = ['VERIFIED', 'INVOICED', 'DUE', 'PAID', 'DISPUTED'] as const;
export const LEDGER_TYPE = ['COMMISSION', 'ADJUSTMENT', 'REFUND_REVERSAL'] as const;
export const INVOICE_STATUS = ['ISSUED', 'DUE', 'PAID', 'CANCELLED'] as const;

export const REFERRAL_STATUS = [
  'CONSENT_PENDING', 'CONSENTED', 'READY_TO_REFER', 'REFERRED', 'LENDER_CONTACTED', 'APPLICATION_IN_PROGRESS',
  'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUS)[number];
export const STATUS_SOURCE = ['LENDER', 'CUSTOMER'] as const;
export const LENDER_TYPE = ['BANK', 'NBFC', 'HFC', 'OTHER'] as const;
export const AGREEMENT_STATUS = ['NONE', 'IN_NEGOTIATION', 'SIGNED', 'EXPIRED'] as const;
export const INTEGRATION_STATUS = ['SANDBOX', 'MANUAL', 'LIVE'] as const;
export const CONTACT_PREFERENCE = ['PHONE', 'WHATSAPP', 'EMAIL'] as const;

export const COMPLIANCE_DOC_TYPE = [
  'ERECTION_PERMISSION', 'APPROVED_DRAWINGS', 'INSPECTION_REPORT', 'WORKING_LICENCE', 'MAINTENANCE_RECORD',
  'SAFETY_AUDIT', 'INCIDENT_REPORT', 'PRODUCT_CERTIFICATE', 'WARRANTY_RECORD', 'STATE_SPECIFIC',
] as const;
export const COMPLIANCE_GATE = ['PROJECT_START', 'HANDOVER'] as const;
export const SOURCE_VERIFICATION = ['UNVERIFIED', 'VERIFIED'] as const;

export const QC_RESULT = ['PASS', 'FAIL', 'CONDITIONAL'] as const;
export const SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const DEFECT_STATUS = ['OPEN', 'CORRECTIVE_ACTION', 'RESOLVED', 'CLOSED'] as const;
export const CORRECTIVE_STATUS = ['OPEN', 'DONE', 'VERIFIED'] as const;
export const INCIDENT_STATUS = [
  'REPORTED', 'TRIAGED', 'EMERGENCY_ESCALATION', 'INVESTIGATION', 'CORRECTIVE_ACTION', 'REVIEWED', 'CLOSED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];

export const TICKET_KIND = ['BREAKDOWN', 'MAINTENANCE', 'WARRANTY_CLAIM', 'COMPLAINT'] as const;
export const TICKET_PRIORITY = ['NORMAL', 'EMERGENCY'] as const;
export const TICKET_STATUS = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];
export const AMC_STATUS = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
export const DISPUTE_KIND = ['PAYMENT', 'COMMISSION', 'QUALITY', 'SERVICE', 'OTHER'] as const;
export const DISPUTE_STATUS = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'] as const;

export const INTERNAL_ROLES = [
  'SUPER_ADMIN', 'OPS_MANAGER', 'CITY_MANAGER', 'SALES_EXEC', 'SURVEYOR', 'FINANCE_COORD', 'QC_COORD',
] as const;
export const COMPANY_ROLES = ['PARTNER_ADMIN', 'PARTNER_SUPERVISOR', 'TECHNICIAN', 'SUPPLIER', 'SERVICE_PARTNER'] as const;
export const ROLES = [...INTERNAL_ROLES, ...COMPANY_ROLES, 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

/** Pilot target zones (spec 3.1). Activation is controlled per zone in the database. */
export const ZONES = [
  'PUNE', 'PCMC', 'WAKAD', 'HINJAWADI', 'BANER', 'BALEWADI', 'RAVET', 'TATHAWADE', 'CHAKAN', 'TALEGAON',
] as const;
export type ZoneCode = (typeof ZONES)[number];
