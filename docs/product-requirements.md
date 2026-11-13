# Product requirements (as built)

Maps the specification's requirements to where they live in the product. "Built" means working in
the sandbox with automated tests; nothing here is connected to an external provider.

## Roles (spec section 4)

Super admin / owner, operations manager, city manager, sales executive, surveyor, finance referral
coordinator, QC coordinator (AIEC staff); partner admin, partner supervisor, technician, supplier,
service partner (partner side); customer. The default role-to-permission map is
`src/lib/permissions.ts`; the owner changes it at runtime in `/admin/users`. Technicians are bound
to their company and assigned projects.

## Workflow requirements (spec section 5)

| Requirement | Built in |
| --- | --- |
| 5.2 Lead capture with contact and privacy consent, source, zone, SLA clock | `/enquiry`, `/customer/new`, `/admin/leads/new`; `createLead` |
| 5.3 Duplicate detection for review, never auto-merged | `src/lib/duplicates.ts`, `/admin/leads/[id]` |
| 5.4 Qualification checklist | `qualifyLead` |
| 5.5 Site survey with evidence, review | `/admin/surveys`, surveyor form |
| 5.6 Matching: hard gates, explainable advisory score, versioned rule, 2–3 invitations | `src/lib/matching.ts`, `/admin/leads/[id]`, `/partner/leads` |
| 5.7 Standard quotation, immutable versions, revisions, clarification | `/partner/quotations`, `quotation_versions` |
| 5.8 Customer comparison and selection (select, revise, clarify, another, reject, hold) | `/customer/projects/[id]` |
| 5.9 Order confirmation checklist, capacity check, frozen milestones | `/admin/orders/[id]`, `confirmOrder` |

## Partner network (spec section 6)

Categories, onboarding documents (licence, insurance, capability, service area), verification
states with review history, grades, partner dashboard, capacity calendar and performance record
(`/partner/*`, `/admin/partners`).

## Money (spec section 7)

Collection submission with evidence, reconciliation states, commission only on verified eligible
collections, append-only ledger, refunds with proportional reversal, adjustments with reason,
invoices with GST, payments, versioned policy, signed bank webhook contract (`/admin/collections`,
`/admin/commissions`, `/partner/collections`, `/partner/commissions`).

## Finance referral (spec section 8)

Separate from marketplace data. Explicit consent, lender registry with agreement status, approved
fields only, attributed lender statuses, withdrawal at any time (`/customer/finance`,
`/admin/finance`).

## Compliance and safety (spec section 9)

Compliance registry and regulatory source list, required documents per gate, safety gates on project
start and handover, incident workflow with automatic escalation and stop-work, insurance tracking,
data-subject requests (`/admin/compliance`, `/admin/incidents`, `/admin/qc`).

## Applications (spec section 10)

| Spec list | Where |
| --- | --- |
| 10.1 Customer app | `/customer/*` |
| 10.2 Partner app | `/partner/*`, `/onboarding/partner` |
| 10.3 Technician app | `/tech/*` (offline queue, sync status, hazard report) |
| 10.4 AIEC admin web | `/admin/*` |

Every list has filters and pagination; every form validates on the server and shows field errors;
loading, empty and error states are present; layouts are responsive. All user-facing text exists in
English, Hindi and Marathi.

## Notifications and SLA (spec section 13)

In-app notifications for workflow events plus time-based reminders (`docs/api.md`, "Scheduled
reminders"). SLA targets (4 working hours lead response, 1 working day partner response, 2 working
days survey scheduling, 3 working days quotation, 1 working day complaint acknowledgement) are
settings; working days exclude Sundays and the configured holidays. Emergency safety reports
escalate immediately.

## Owner command centre (spec section 15)

`/admin`: business, project-control and risk dashboards with drill-downs; `/admin/reports` for
conversion, collections, commission and break-even.

## Not covered

Real SMS / WhatsApp delivery, payments, lender and e-signature integrations, maps, native apps,
object storage, PDF generation. See `docs/audit.md`.
