# Architecture

One Next.js 16 application (App Router, React 19, Tailwind 4, TypeScript) backed by PostgreSQL.

```
Browser ── pages (src/app) ── server actions (src/app/actions) ─┐
Browser ── REST API (src/app/api) ─────────────────────────────┼─▶ services (src/server/services) ─▶ PostgreSQL
Technician device ── offline queue ── /api/tech/sync ───────────┘        │  permission check, rules,          row-level security,
                                                                         │  audit, notifications              append-only guards
                                                                         └─ pure logic (src/lib)
```

## Layers

| Layer | Location | Rule |
| --- | --- | --- |
| Pages | `src/app/**/page.tsx` | Read through a service and render. No business rules. |
| Server actions | `src/app/actions/app.ts`, `public.ts` | Parse the form with a zod schema and call one service. |
| REST routes | `src/app/api/[...path]/route.ts` | Same services, JSON envelope. |
| Services | `src/server/services/*.ts` | All rules: permission check, state checks, writes, audit entry, notifications. |
| Pure logic | `src/lib/*.ts` | State machines, commission arithmetic, matching, duplicate scoring, SLA clock, validation. No I/O. |
| Database | `db/migrations/*.sql` | Schema, CHECK constraints for every state, row-level security, immutability triggers. |

Because pages, actions and API routes all go through the same services, a rule cannot be bypassed
by using a different entry point.

## Workspaces

| Path | Users |
| --- | --- |
| `/` `/enquiry` `/privacy` `/login` | Public |
| `/admin` | AIEC staff (owner, operations, city manager, sales, surveyor, finance coordinator, QC) |
| `/partner` | Partner admin and supervisor, supplier, service partner |
| `/customer` | Customers |
| `/tech` | Technicians (mobile first, offline capable) |
| `/app` | Chooser for people with more than one workspace |

## Database access

`src/server/db.ts` offers two ways to run a transaction:

- `withCtx(ctx, fn)` switches to the database role `aiec_app` and sets the caller's identity
  (`app.user_id`, `app.company_id`, `app.customer_id`, `app.is_internal`, …) for the transaction.
  Row-level security policies then decide which rows are visible and writable. Almost everything
  uses this path.
- `withSystem(fn)` runs as the owning role without tenant claims. It is used only where there is no
  signed-in user (public enquiry, sign-in, webhook, housekeeping) or where a service must write a
  record the caller may not read (for example notifying staff).

## Money

Amounts are `numeric(14,2)` in the database and decimal strings in code. All arithmetic uses
integer paise (`src/lib/commission.ts`), never floating point.

## Translations

`src/i18n` holds typed dictionaries for English, Hindi and Marathi. The language is kept in the
`aiec_locale` cookie. Services throw `AppError(code)`; the UI shows `err.<code>` in the user's
language. Notifications store a type and parameters, so each reader sees them in their own language.

## Offline technician app

Actions on `/tech` are written to IndexedDB first (`src/lib/offline-queue.ts`) with a
client-generated UUID and the device time. The queue is sent to `/api/tech/sync` when the device is
online. The server records each UUID in `client_events` and applies an event only the first time it
sees it, so a retry after a lost connection cannot create a duplicate. A service worker
(`public/sw.js`) keeps the app shell available without a connection.

## Sandbox adapters

| Concern | Sandbox behaviour | To go live |
| --- | --- | --- |
| One-time code | Shown on screen when `AUTH_SANDBOX=true` | Send through an SMS provider in `src/server/authcore.ts` |
| WhatsApp / SMS | Logged in `outbound_messages` as `SANDBOX_NOT_SENT` | Deliver from `queueOutboundMessage` in `src/server/audit.ts` |
| Lender | Handoff logged in `finance_handoffs` | Add a delivery channel per lender agreement |
| Bank | Signed webhook contract only | Connect the bank or payment aggregator to `/api/webhooks/reconciliation` |
| Files | Stored in `file_objects` | Replace `saveFile` / `readFile` in `src/server/services/files.ts` |
