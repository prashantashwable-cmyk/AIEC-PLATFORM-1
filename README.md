# AIEC National Elevator Marketplace

A managed marketplace for elevator projects in the Pune / PCMC pilot area. AIEC takes a customer's
enquiry, surveys the site, matches verified licensed elevator partners, collects comparable
quotations, lets the customer choose, and then tracks the order, the project, the partner's
collections and AIEC's commission.

The whole application is available in **English, Hindi and Marathi**.

> **Status: pilot build with sandbox adapters.** No SMS, WhatsApp, payment, bank, lender, e-sign or
> maps provider is connected. Every such place is labelled as a sandbox on screen and in the data.
> Nothing in the demo data is a real company, licence, customer, payment or lender.

## What AIEC is and is not

AIEC is the marketplace operator. It is **not** a lender, a statutory lift inspector or the
installation contractor. The customer pays the partner directly; AIEC records the partner's
collections, verifies them and charges the partner a commission (2% of verified eligible
collections by default). Order confirmation in the app never means a statutory permission exists.

## What is built

| Area | Built |
| --- | --- |
| Public site | Landing page, enquiry form, privacy notice, OTP sign-in, ten selectable themes |
| Partner self-service | Dashboard, capacity calendar (own limit, pilot limit, project dates), performance record, lead inbox, quotation builder, orders, projects, team, collections, commission, catalogue |
| Lead CRM | Enquiry capture with consent, duplicate candidates for review, qualification, SLA due times, assignment by zone |
| Survey | Scheduling, surveyor form with photos and coordinates, review |
| Matching | Hard eligibility gates with reasons, weighted advisory score, versioned rules, invitations with response deadlines |
| Quotations | Standard format, immutable submitted versions, revisions, release to the customer, side-by-side comparison |
| Orders | Customer selection, partner acceptance, confirmation checklist, five-project pilot capacity, per-partner capacity |
| Projects | Frozen payment milestones, start and handover gates, tasks, team, materials, compliance documents, stop-work |
| Money | Collection evidence, reconciliation, append-only commission ledger, refunds, adjustments, invoices with GST, payments |
| Finance referral | Explicit consent, lender register, approved-fields-only handoff, attributed status changes, withdrawal |
| Quality and safety | Compliance register, QC inspections, defects, corrective actions, incidents with automatic escalation |
| Service | Tickets, warranty, AMC contracts, visits, disputes |
| Technician app | Mobile web app that works offline: attendance, safety checklist, task progress, photos, material use, hazard reports |
| Governance | Roles and permissions, tenant isolation in the database, audit log, notifications, settings, reports |
| API | REST routes from the specification, bank-reconciliation webhook, housekeeping job |

## What is sandbox only

- **Sign-in:** the one-time code is shown on screen instead of being sent by SMS. Demo sign-in buttons exist only when `AUTH_SANDBOX=true`.
- **WhatsApp / SMS:** messages are written to `outbound_messages` with status `SANDBOX_NOT_SENT`. Nothing is sent.
- **Lender handoff:** the approved fields are written to `finance_handoffs` with mode `SANDBOX`. No data leaves AIEC.
- **Bank reconciliation webhook:** the signed contract is implemented and tested, but no bank is connected.
- **Demo data:** every seeded record is flagged `is_demo` and uses obviously fictional names and `+91 90000 000xx` numbers.

## What is not built

- Real SMS, WhatsApp, payment-gateway, bank, lender and e-signature integrations.
- Maps and PostGIS. Zones are a fixed list; coordinates are stored as plain numbers and distance uses the haversine formula.
- Native Android / iOS apps. The customer, partner and technician apps are responsive web apps (the technician app is installable and works offline). This is a deviation from the specification's preferred React Native stack, chosen so that one codebase could be verified end to end.
- Object storage. Documents are stored privately in PostgreSQL (8 MB limit per file). Move to S3-compatible storage before volume grows.
- A scheduler. `/api/jobs/housekeeping` (licence expiry and all reminders) must be called by an external cron. Reminders appear in the in-app notification lists; nothing is sent by SMS or WhatsApp.
- Error monitoring and rate limiting beyond the OTP attempt limits.

## Run it locally

Requirements: Node.js 20.9 or newer and PostgreSQL 14 or newer.

```bash
npm install
cp .env.example .env.local        # set APP_SECRET and RECONCILIATION_WEBHOOK_SECRET to random 32+ character strings
createdb aiec && createdb aiec_test   # owned by the user in DATABASE_URL
npm run db:reset                  # applies migrations and loads the demo data
npm run dev                       # http://localhost:3000
```

Open `/login` and use a demo sign-in button, or enter a demo phone number and the code shown on screen.

| Demo role | Phone | Workspace |
| --- | --- | --- |
| Owner (super admin) | +91 90000 00001 | `/admin` |
| Operations manager | +91 90000 00002 | `/admin` |
| City manager, sales, surveyor, finance coordinator, QC | +91 90000 00003 – 07 | `/admin` |
| Partner admin (two partners) | +91 90000 00011, 00012 | `/partner` |
| Partner supervisor | +91 90000 00021 | `/partner` |
| Technician | +91 90000 00022 | `/tech` |
| Customer | +91 90000 00031, 00032 | `/customer` |

## Checks

```bash
npm run typecheck                 # TypeScript
npm run lint                      # ESLint
npx tsx scripts/i18n-scan.ts      # every translation key used in the source exists in en, hi and mr
npm test                          # unit + integration tests (wipes and uses TEST_DATABASE_URL)
npm run build && npm start        # production build
node scripts/smoke.mjs SUPER_ADMIN mr -   # visits every navigation link as a demo role in a language
npm run e2e                       # technician offline flow in a real browser (needs freshly seeded data)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, the translation scan, the tests against a
PostgreSQL service and the production build.

## Languages

Dictionaries live in `src/i18n/messages/{en,hi,mr}/`. English is the type source, so the compiler
rejects a Hindi or Marathi dictionary with a missing key. Amounts always use Indian digit grouping
and Latin digits (₹6,00,000) in every language. Free text typed by users (project names, notes) is
shown as typed and is not translated.

## Look and feel

All colours, radii and fonts are tokens. Ten themes are defined in `src/lib/themes.ts`; change
`DEFAULT_THEME` to switch. Previews are in `docs/design-options/` and, in sandbox mode, at `/design`.

## Deployment

Any Node.js host with a PostgreSQL database works (the connection string may be a Supabase Postgres
URL). Set the variables from `.env.example`, run `npm run db:migrate`, then `npm run build` and
`npm start`. Do **not** run the seed script in production.

### Before going live

1. Set `AUTH_SANDBOX=false` and connect an SMS provider for one-time codes. Until then nobody can sign in outside the sandbox.
2. Use strong random values for `APP_SECRET` and `RECONCILIATION_WEBHOOK_SECRET`.
3. Have a lawyer review the privacy notice, consent wording, partner agreement and customer terms. The texts in the app are drafts.
4. Have a chartered accountant confirm the GST rate and invoice format for commission invoices (18% is a configurable default, not advice).
5. Confirm the compliance register (`/admin/compliance`) against the current Maharashtra lift rules and department circulars. The seeded sources are a reading list, not a legal opinion.
6. Sign a written agreement with any lender before adding it; decide with counsel whether AIEC's referral role makes it a lending service provider.
7. Verify real partner licences and insurance with the issuing authority before activating a partner.
8. Schedule `POST /api/jobs/housekeeping` (at least daily, with `Authorization: Bearer <APP_SECRET>`). It expires lapsed licences and raises the overdue and expiring-soon reminders. Also schedule database backups.
9. Move document storage to object storage and add virus scanning for uploads.
10. Run a security review and a load test.

## Documentation

- `docs/business-blueprint.md` – locked business decisions, revenue model and boundaries
- `docs/product-requirements.md` – specification requirements mapped to screens and services
- `docs/operations-sops.md` – draft operating procedures for the pilot
- `docs/architecture.md` – how the code is organised and why
- `docs/data-model.md` – tables, relationship diagram, states and database guards
- `docs/api.md` – REST routes, webhook, offline sync
- `docs/security.md` – authentication, permissions, tenant isolation, privacy
- `docs/compliance-register.md` – regulatory sources and how gates are enforced
- `docs/test-plan.md` – what is tested and how
- `docs/audit.md` – specification coverage, deviations and known gaps
- `AIEC_National_Elevator_Marketplace_Claude_Code_Master_Specification_EN.md` – the product specification
