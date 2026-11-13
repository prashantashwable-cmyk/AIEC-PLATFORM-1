# API

All routes are under `/api` and use the signed-in session cookie. State-changing calls must come
from the same origin. Every route calls the same service as the corresponding screen, so
permissions, tenant isolation and audit behave identically.

## Envelope

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "FORBIDDEN", "params": { }, "fields": { "phone": "INVALID_PHONE" } } }
```

HTTP status: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `DUPLICATE` /
`INVALID_TRANSITION`, 422 `VALIDATION`, 400 for other business errors, 500 `UNKNOWN`.
Error codes map to translated messages under `err.<code>`.

## Routes (specification 11.5)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/leads` | Create a lead |
| GET | `/api/leads` | List leads visible to the caller (`status`, `q`, `page`) |
| GET | `/api/leads/:id` | Lead detail |
| PATCH | `/api/leads/:id` | Assign, mark contacted, add a note |
| POST | `/api/leads/:id/qualify` | Qualification checklist |
| POST | `/api/surveys` | Schedule a survey |
| POST | `/api/surveys/:id/evidence` | Add a survey photo (base64) |
| POST | `/api/surveys/:id/submit` | Save or submit survey data |
| GET | `/api/partners/match?leadId=` | Run matching and return eligible and ineligible partners with reasons |
| POST | `/api/partners` | Register a partner company |
| POST | `/api/partners/:id/verification` | Change partner verification status |
| POST | `/api/quotations` | Save a quotation draft |
| POST | `/api/quotations/:id/submit` | Submit a quotation version |
| POST | `/api/quotations/:id/negotiate` | Customer request: revision, clarification, another quotation |
| POST | `/api/orders` | Customer selects a quotation (creates the order) |
| POST | `/api/orders/:id/accept` | Partner accepts and names a supervisor |
| POST | `/api/orders/:id/confirm` | AIEC confirms after the checklist passes; opens the project |
| POST | `/api/projects/:id/tasks` | Create a task |
| POST | `/api/projects/:id/milestones` | Update a milestone |
| POST | `/api/projects/:id/evidence` | Add work evidence (base64) |
| POST | `/api/collections/evidence` | Submit a collection with evidence |
| POST | `/api/collections/:id/reconcile` | Review, verify, reject or dispute a collection |
| GET | `/api/commissions` | Commission ledger visible to the caller |
| POST | `/api/commissions/:id/invoice` | Invoice a partner's verified entries (`:id` is the company id) |
| POST | `/api/commissions/:id/adjust` | Append an adjustment to a ledger entry |
| POST | `/api/finance/referrals` | Customer gives finance-referral consent |
| POST | `/api/finance/referrals/:id/withdraw-consent` | Customer withdraws consent |
| POST | `/api/qc/inspections` | Record a QC inspection |
| POST | `/api/incidents` | Report an incident or hazard |
| POST | `/api/service/tickets` | Raise a service ticket |

Request bodies are the zod schemas exported next to each service function in
`src/server/services/`.

## Other endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/files/:id` | Streams a private document if the caller may see it; every access is logged |
| POST | `/api/tech/sync` | `{ "events": [...] }`, at most 50 per call. Returns one acknowledgement per event: `SYNCED`, `DUPLICATE` or `FAILED` with an error code. Event types: `ATTENDANCE`, `TASK_STATUS`, `CHECKLIST`, `MATERIAL_USAGE`, `EVIDENCE`, `HAZARD`. Each carries `clientEventId` (UUID) and `capturedAt` (device time). |
| POST | `/api/webhooks/reconciliation` | **Sandbox contract.** Body `{ eventId, companyId, bankReference, amount }`; header `x-aiec-signature` = hex HMAC-SHA256 of the raw body with `RECONCILIATION_WEBHOOK_SECRET`. Verifies the matching submitted collection once; a replayed `eventId` returns `duplicate` and changes nothing. |
| POST | `/api/jobs/housekeeping` | `Authorization: Bearer <APP_SECRET>`. Expires partners whose mandatory licence has lapsed and invitations past their deadline, then raises the scheduled reminders (below). Returns `{ partnersExpired, invitationsExpired, reminders: { <TYPE>: count } }`. Safe to run as often as wanted; run it at least daily. |

### Scheduled reminders

Each alert is raised once per record (and once per threshold for expiries), tracked in `reminder_log`.

| Alert | Raised when | Sent to |
| --- | --- | --- |
| `LEAD_RESPONSE_OVERDUE` | New lead not answered by its response target | Staff who see all leads |
| `QUOTATION_OVERDUE` | Quotation still a draft after the due time set at acceptance (`sla_quotation_days`) | The partner and staff who invite partners |
| `MILESTONE_OVERDUE` | Payment milestone past its due date and not completed | The partner and project managers |
| `LICENCE_EXPIRING`, `INSURANCE_EXPIRING` | Verified document of an active partner is within the alert window (`expiry_alert_days`): once at the window, 7 days and 1 day | The partner and staff who activate partners |
| `WARRANTY_EXPIRING` | Warranty ends within 30 days | The customer and the partner |
| `AMC_VISIT_DUE` | Fewer maintenance visits recorded than the contract schedule calls for (one alert per missed visit) | The partner and service staff |
| `INVOICE_OVERDUE` | Commission invoice issued and past its due date | The partner and staff who invoice |
| `TICKET_ACK_OVERDUE` | Complaint still `OPEN` after its acknowledgement target | Service staff |
| `CORRECTIVE_ACTION_OVERDUE` | Open corrective action past its due date | The company and QC staff |
