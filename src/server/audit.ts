import type { Ctx } from './ctx';
import type { Tx } from './db';

/** Appends an audit record. Audit rows are append-only at database level. */
export async function audit(
  tx: Tx, ctx: Ctx | null, action: string, entityType: string, entityId: string | null,
  details: Record<string, unknown> = {}, companyId: string | null = null,
): Promise<void> {
  await tx.exec(
    `insert into audit_logs (actor_id, actor_roles, action, entity_type, entity_id, company_id, details, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx?.userId ?? null, ctx?.roles ?? [], action, entityType, entityId, companyId ?? null, JSON.stringify(details), ctx?.ip ?? null],
  );
}

type Params = Record<string, string | number | null>;

export async function notifyUsers(tx: Tx, userIds: Array<string | null | undefined>, type: string, params: Params, link: string | null): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  await tx.exec(
    'insert into notifications (user_id, type, params, link) select unnest($1::uuid[]), $2, $3, $4',
    [ids, type, JSON.stringify(params), link],
  );
}
export async function notifyPermission(tx: Tx, permission: string, type: string, params: Params, link: string | null): Promise<void> {
  await tx.query('select app.notify_permission($1, $2, $3, $4)', [permission, type, JSON.stringify(params), link]);
}
export async function notifyCompany(tx: Tx, companyId: string, type: string, params: Params, link: string | null): Promise<void> {
  await tx.query('select app.notify_company($1, $2, $3, $4)', [companyId, type, JSON.stringify(params), link]);
}
export async function notifyCustomer(tx: Tx, customerId: string, type: string, params: Params, link: string | null): Promise<void> {
  await tx.query('select app.notify_customer($1, $2, $3, $4)', [customerId, type, JSON.stringify(params), link]);
}

/**
 * Sandbox messaging adapter. No WhatsApp / SMS provider is connected, so the message is only
 * logged with status SANDBOX_NOT_SENT. It is never reported to users as delivered.
 */
export async function queueOutboundMessage(tx: Tx, channel: 'SMS' | 'WHATSAPP', toPhone: string, template: string, params: Params): Promise<void> {
  await tx.exec(
    'insert into outbound_messages (channel, to_phone, template, params) values ($1, $2, $3, $4)',
    [channel, toPhone, template, JSON.stringify(params)],
  );
}

export const SETTING_DEFAULTS = {
  pilot_max_active_projects: '5',
  sla_lead_response_hours: '4',
  sla_partner_response_days: '1',
  sla_survey_schedule_days: '2',
  sla_quotation_days: '3',
  sla_complaint_ack_days: '1',
  commission_invoice_gst_percent: '18',
  commission_invoice_due_days: '15',
  expiry_alert_days: '30',
  holidays: '',
  monthly_fixed_cost: '60000',
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(tx: Tx, key: SettingKey): Promise<string> {
  const row = await tx.maybeOne<{ value: string }>('select value from system_settings where key = $1', [key]);
  return row?.value ?? SETTING_DEFAULTS[key];
}
export async function getHolidays(tx: Tx): Promise<string[]> {
  return (await getSetting(tx, 'holidays')).split(',').map((s) => s.trim()).filter(Boolean);
}
