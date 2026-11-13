import type { Role } from './enums';

/** Granular permission codes (spec 4.2). The database copy is the runtime source of truth. */
export const PERMISSIONS = [
  'lead.create', 'lead.view.all', 'lead.view.city', 'lead.view.assigned', 'lead.update', 'lead.qualify', 'lead.assign',
  'customer.view',
  'survey.schedule', 'survey.perform', 'survey.review',
  'partner.view', 'partner.manage', 'partner.verify', 'partner.activate',
  'matching.run', 'quotation.invite', 'quotation.view.all', 'quotation.release',
  'order.view.all', 'order.manage', 'order.confirm',
  'project.view.all', 'project.manage',
  'payment.reconcile', 'commission.view', 'commission.calculate', 'commission.adjust', 'commission.policy',
  'finance.referral.view', 'finance.referral.manage', 'lender.manage',
  'compliance.view', 'compliance.document.approve', 'compliance.manage',
  'qc.review', 'incident.manage', 'service.manage', 'dispute.manage',
  'user.manage', 'settings.manage', 'audit.view', 'report.view',
  // partner company side
  'company.manage', 'quotation.submit', 'order.accept', 'project.assign', 'milestone.update',
  'payment.evidence.submit', 'commission.view.own', 'team.manage', 'task.perform', 'evidence.submit',
  'catalogue.manage', 'service.perform',
  // customer side
  'customer.self',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const INTERNAL_ALL = PERMISSIONS.filter(
  (p) => ![
    'company.manage', 'quotation.submit', 'order.accept', 'project.assign', 'milestone.update', 'payment.evidence.submit',
    'commission.view.own', 'team.manage', 'task.perform', 'evidence.submit', 'catalogue.manage', 'service.perform', 'customer.self',
    'lead.view.city', 'lead.view.assigned', 'survey.perform',
  ].includes(p),
);

export const ROLE_SCOPE: Record<Role, 'INTERNAL' | 'COMPANY' | 'CUSTOMER'> = {
  SUPER_ADMIN: 'INTERNAL', OPS_MANAGER: 'INTERNAL', CITY_MANAGER: 'INTERNAL', SALES_EXEC: 'INTERNAL', SURVEYOR: 'INTERNAL',
  FINANCE_COORD: 'INTERNAL', QC_COORD: 'INTERNAL',
  PARTNER_ADMIN: 'COMPANY', PARTNER_SUPERVISOR: 'COMPANY', TECHNICIAN: 'COMPANY', SUPPLIER: 'COMPANY', SERVICE_PARTNER: 'COMPANY',
  CUSTOMER: 'CUSTOMER',
};

/** Default role → permission mapping, applied when a permission is first introduced. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: INTERNAL_ALL,
  OPS_MANAGER: [
    'lead.create', 'lead.view.all', 'lead.update', 'lead.qualify', 'lead.assign', 'customer.view',
    'survey.schedule', 'survey.review', 'partner.view', 'partner.manage', 'partner.verify',
    'matching.run', 'quotation.invite', 'quotation.view.all', 'quotation.release',
    'order.view.all', 'order.manage', 'order.confirm', 'project.view.all', 'project.manage',
    'payment.reconcile', 'commission.view', 'compliance.view', 'service.manage', 'dispute.manage', 'incident.manage', 'report.view',
  ],
  CITY_MANAGER: [
    'lead.create', 'lead.view.city', 'lead.update', 'lead.qualify', 'lead.assign', 'customer.view',
    'survey.schedule', 'survey.review', 'partner.view', 'report.view',
  ],
  SALES_EXEC: ['lead.create', 'lead.view.assigned', 'lead.update', 'lead.qualify', 'customer.view'],
  SURVEYOR: ['survey.perform'],
  FINANCE_COORD: ['finance.referral.view', 'finance.referral.manage', 'lender.manage'],
  QC_COORD: ['qc.review', 'compliance.view', 'compliance.document.approve', 'incident.manage', 'project.view.all'],
  PARTNER_ADMIN: [
    'company.manage', 'quotation.submit', 'order.accept', 'project.assign', 'milestone.update', 'payment.evidence.submit',
    'commission.view.own', 'team.manage', 'task.perform', 'evidence.submit', 'catalogue.manage', 'service.perform',
  ],
  PARTNER_SUPERVISOR: ['project.assign', 'milestone.update', 'task.perform', 'evidence.submit', 'service.perform'],
  TECHNICIAN: ['task.perform', 'evidence.submit'],
  SUPPLIER: ['company.manage', 'catalogue.manage'],
  SERVICE_PARTNER: ['company.manage', 'service.perform', 'task.perform', 'evidence.submit'],
  CUSTOMER: ['customer.self'],
};
