# Security model

## Sign-in and sessions

- Sign-in is by mobile number and a six-digit one-time code. Codes are stored only as a keyed hash,
  expire after a few minutes, allow five attempts, and at most five codes can be requested per
  number in fifteen minutes.
- In sandbox mode (`AUTH_SANDBOX=true`) the code is shown on screen and demo sign-in buttons are
  available. With `AUTH_SANDBOX=false` neither exists; an SMS provider must be connected first.
- A session is a random token in the `aiec_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure`
  on HTTPS, 14 days). Only its hash is stored. Signing out deletes the session row.
- Deactivating a user or revoking a role takes effect on the next request.

## Authorisation: two independent layers

1. **Service layer.** Every service function starts with `requirePerm(ctx, '<permission>')` or an
   ownership check. Permissions are codes such as `lead.view.all`, `payment.reconcile`,
   `commission.adjust` (`src/lib/permissions.ts`). The role-to-permission map lives in the database
   and can be changed by the owner; the audit log records every change.
2. **Database layer.** Tenant requests run as the PostgreSQL role `aiec_app` with row-level
   security. Policies are written per table in `db/migrations/0002_rls.sql`:
   - AIEC staff see operational data; city managers and sales staff are additionally limited to
     their zones or their own leads in the lead queries.
   - A partner company sees only its own company records, the leads it was invited to, and its own
     quotations, orders, projects, collections and ledger.
   - A technician sees only projects they are assigned to.
   - A customer sees only their own enquiries, released quotations, orders, projects and consents.
   - Finance referrals, handoffs and lender records are visible only to staff with a finance
     permission and to the customer concerned. Partners never see them.

   A hand-written query that forgets a filter still returns nothing from another tenant. The
   integration tests check this directly.

## Separation of duties

- A partner cannot verify its own collection, licence or insurance.
- A safety-critical task cannot be approved by the person it was assigned to (`SELF_REVIEW`); surveys, partner documents and compliance documents are reviewed by AIEC staff, not by the party that submitted them.
- Only AIEC staff with incident or project authority can lift a stop-work order.
- Commission adjustments need a dedicated permission and a written reason.

## Records that cannot be rewritten

Audit log, state-change events, consents, file access log, submitted quotation versions, commission
ledger amounts and original incident reports are protected by database triggers. Corrections are
new rows.

## Files

Uploads are limited to PDF, JPEG, PNG and WebP, 8 MB, and are checked against the file's leading
bytes as well as its declared type. Files are stored privately and served only through
`/api/files/:id`, which re-checks access through row-level security and logs every read. There are
no public file URLs. Virus scanning is not implemented.

## Web protections

- All input is validated with zod on the server; SQL uses bound parameters only.
- Server actions are protected by the framework's origin check; API routes reject cross-origin
  state-changing requests; cookies are `SameSite=Lax`.
- The reconciliation webhook requires an HMAC-SHA256 signature compared in constant time, and the
  housekeeping endpoint requires the application secret.
- Every page response carries a `Content-Security-Policy` with a fresh nonce per request (`src/proxy.ts`): scripts only from this origin or with the nonce (`strict-dynamic`), no inline event handlers, no framing, no plugins, forms and fetches to this origin only. `style=""` attributes are allowed because the interface uses a few. All pages are rendered per request, which nonces require; do not add statically generated pages without revisiting this.
- Responses carry `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, a permissions policy, `Cross-Origin-Opener-Policy: same-origin` and `Strict-Transport-Security` (effective once served over https). `scripts/probe.mjs` checks these and the anonymous-access rules against any URL.
- Secrets are read from environment variables. `.env.local` is ignored by git; `.env.example`
  contains names only.

## Personal data (DPDP Act, 2023)

- Contact and privacy consent are mandatory on the enquiry form and are stored with the notice
  version, time and source. Finance-referral consent is separate, purpose-specific and can be
  withdrawn at any time.
- A partner is shown the customer's phone number only after it has accepted AIEC's invitation to quote for that enquiry; partners that were not invited cannot read the customer record at all.
- Customers can request access, correction, deletion or withdrawal of contact consent from their
  profile; the request is recorded for staff to action.
- Only the fields a lender's agreement lists are included in a handoff.

## Known gaps

- No rate limiting apart from one-time codes; put the app behind a gateway or WAF.
- No multi-factor sign-in for staff.
- No automatic data-retention or deletion job; deletion requests are handled manually.
- No virus scanning; files live in the database.
- No external error monitoring.
- The privacy notice and consent texts are drafts that need legal review.
