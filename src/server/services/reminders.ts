import { amcVisitsExpected, expiryBucket } from '@/lib/reminders';
import { isoDateIST } from '@/lib/format';
import { notifyCompany, notifyCustomer, notifyPermission, getSetting } from '../audit';
import { withSystem, type Rec, type Tx } from '../db';

const TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

/** Records that an alert was raised. Returns false when the same alert was already raised before. */
async function claim(tx: Tx, kind: string, entityId: string, bucket = ''): Promise<boolean> {
  return (await tx.exec('insert into reminder_log (kind, entity_id, bucket) values ($1, $2, $3) on conflict do nothing', [kind, entityId, bucket])) > 0;
}

/**
 * Raises the time-based alerts listed in specification section 13 that no user action triggers:
 * overdue leads, quotations, milestones, invoices, complaints and corrective actions, and upcoming
 * licence, insurance, warranty and maintenance dates. Safe to run as often as wanted: each alert
 * fires once per record (and once per threshold for expiries).
 */
export async function runReminderSweep(): Promise<Record<string, number>> {
  return withSystem(async (tx) => {
    const counts: Record<string, number> = {};
    const bump = (kind: string) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    const alertDays = Number(await getSetting(tx, 'expiry_alert_days'));
    const thresholds = [...new Set([alertDays, 7, 1])].filter((t) => t <= alertDays).sort((a, b) => b - a);

    // New leads nobody has answered within the response target.
    for (const l of await tx.query<Rec>(`select l.id, l.lead_number, c.name from leads l join customers c on c.id = l.customer_id where l.status = 'NEW' and l.response_due_at < now()`)) {
      if (!(await claim(tx, 'LEAD_RESPONSE_OVERDUE', l.id))) continue;
      await notifyPermission(tx, 'lead.view.all', 'LEAD_RESPONSE_OVERDUE', { number: l.lead_number, name: l.name }, `/admin/leads/${l.id}`);
      bump('LEAD_RESPONSE_OVERDUE');
    }

    // Quotations still in draft after the due time that was set when the partner accepted.
    for (const q of await tx.query<Rec>(`select id, quotation_number, company_id, lead_id from quotations where status = 'DRAFT' and due_at < now()`)) {
      if (!(await claim(tx, 'QUOTATION_OVERDUE', q.id))) continue;
      await notifyCompany(tx, q.company_id, 'QUOTATION_OVERDUE', { number: q.quotation_number }, `/partner/quotations/${q.id}`);
      await notifyPermission(tx, 'quotation.invite', 'QUOTATION_OVERDUE', { number: q.quotation_number }, `/admin/leads/${q.lead_id}`);
      bump('QUOTATION_OVERDUE');
    }

    // Payment milestones past their due date.
    for (const m of await tx.query<Rec>(
      `select m.id, m.name, m.company_id, p.id as project_id, p.project_number from project_milestones m join projects p on p.id = m.project_id
        where m.status <> 'COMPLETED' and m.due_date < ${TODAY} and p.status not in ('HANDED_OVER','CLOSED','CANCELLED')`)) {
      if (!(await claim(tx, 'MILESTONE_OVERDUE', m.id))) continue;
      await notifyCompany(tx, m.company_id, 'MILESTONE_OVERDUE', { number: m.project_number, name: m.name }, `/partner/projects/${m.project_id}`);
      await notifyPermission(tx, 'project.manage', 'MILESTONE_OVERDUE', { number: m.project_number, name: m.name }, `/admin/projects/${m.project_id}`);
      bump('MILESTONE_OVERDUE');
    }

    // Licences and insurance policies that are about to expire (only verified documents of active partners).
    const expiring = [
      { kind: 'LICENCE_EXPIRING', table: 'company_licenses' },
      { kind: 'INSURANCE_EXPIRING', table: 'company_insurance_policies' },
    ] as const;
    for (const { kind, table } of expiring) {
      const rows = await tx.query<Rec>(
        `select d.id, d.company_id, c.legal_name, (d.expiry_date - ${TODAY}) as days_left from ${table} d join companies c on c.id = d.company_id
          where c.status = 'ACTIVE' and d.verification_status = 'VERIFIED' and d.expiry_date between ${TODAY} and ${TODAY} + $1::int`, [alertDays]);
      for (const d of rows) {
        const bucket = expiryBucket(Number(d.days_left), thresholds);
        if (bucket === null || !(await claim(tx, kind, d.id, String(bucket)))) continue;
        const params = { name: d.legal_name, days: Number(d.days_left) };
        await notifyCompany(tx, d.company_id, kind, params, '/partner/company');
        await notifyPermission(tx, 'partner.activate', kind, params, `/admin/partners/${d.company_id}`);
        bump(kind);
      }
    }

    // Warranties ending within 30 days.
    for (const w of await tx.query<Rec>(
      `select w.id, w.company_id, w.customer_id, w.ends_on, p.id as project_id, p.project_number, p.lead_id from warranties w join projects p on p.id = w.project_id
        where w.ends_on between ${TODAY} and ${TODAY} + 30`)) {
      if (!(await claim(tx, 'WARRANTY_EXPIRING', w.id))) continue;
      const params = { number: w.project_number, date: w.ends_on };
      await notifyCustomer(tx, w.customer_id, 'WARRANTY_EXPIRING', params, `/customer/projects/${w.lead_id}`);
      await notifyCompany(tx, w.company_id, 'WARRANTY_EXPIRING', params, `/partner/projects/${w.project_id}`);
      bump('WARRANTY_EXPIRING');
    }

    // AMC contracts that have fewer recorded visits than their schedule calls for. One alert per missed slot.
    const today = isoDateIST();
    for (const a of await tx.query<Rec>(
      `select a.id, a.company_id, a.starts_on, a.ends_on, a.visits_per_year, c.name as customer_name,
              (select count(*) from maintenance_visits v where v.amc_id = a.id) as done
         from amc_contracts a join customers c on c.id = a.customer_id where a.status = 'ACTIVE' and a.starts_on <= ${TODAY}`)) {
      const expected = amcVisitsExpected(a.visits_per_year, a.starts_on, a.ends_on, today);
      if (expected <= Number(a.done) || !(await claim(tx, 'AMC_VISIT_DUE', a.id, String(expected)))) continue;
      await notifyCompany(tx, a.company_id, 'AMC_VISIT_DUE', { name: a.customer_name }, '/partner/service');
      await notifyPermission(tx, 'service.manage', 'AMC_VISIT_DUE', { name: a.customer_name }, '/admin/service');
      bump('AMC_VISIT_DUE');
    }

    // Commission invoices past their due date.
    for (const i of await tx.query<Rec>(`select id, invoice_number, company_id from commission_invoices where status = 'ISSUED' and due_date < ${TODAY}`)) {
      if (!(await claim(tx, 'INVOICE_OVERDUE', i.id))) continue;
      await notifyCompany(tx, i.company_id, 'INVOICE_OVERDUE', { number: i.invoice_number }, '/partner/commissions');
      await notifyPermission(tx, 'commission.calculate', 'INVOICE_OVERDUE', { number: i.invoice_number }, '/admin/commissions?tab=invoices');
      bump('INVOICE_OVERDUE');
    }

    // Complaints not acknowledged within the target.
    for (const t of await tx.query<Rec>(`select id, ticket_number from service_tickets where status = 'OPEN' and ack_due_at < now()`)) {
      if (!(await claim(tx, 'TICKET_ACK_OVERDUE', t.id))) continue;
      await notifyPermission(tx, 'service.manage', 'TICKET_ACK_OVERDUE', { number: t.ticket_number }, '/admin/service');
      bump('TICKET_ACK_OVERDUE');
    }

    // Corrective actions past their due date.
    for (const c of await tx.query<Rec>(`select id, description, company_id from corrective_actions where status = 'OPEN' and due_date < ${TODAY}`)) {
      if (!(await claim(tx, 'CORRECTIVE_ACTION_OVERDUE', c.id))) continue;
      if (c.company_id) await notifyCompany(tx, c.company_id, 'CORRECTIVE_ACTION_OVERDUE', { text: c.description }, '/partner/projects');
      await notifyPermission(tx, 'qc.review', 'CORRECTIVE_ACTION_OVERDUE', { text: c.description }, '/admin/qc');
      bump('CORRECTIVE_ACTION_OVERDUE');
    }
    return counts;
  });
}
