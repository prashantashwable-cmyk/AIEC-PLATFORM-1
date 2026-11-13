# Test plan

## Automated

| Command | What it proves |
| --- | --- |
| `npm run typecheck` | Types, including that Hindi and Marathi dictionaries have every English key |
| `npm run lint` | ESLint (Next.js, React hooks, TypeScript rules) |
| `npx tsx scripts/i18n-scan.ts` | Every translation key, error code and notification type used in the source exists |
| `npm test` | 57 tests: 24 unit, 33 integration |
| `npm run build` | Production build |

### Unit tests (`tests/unit.test.ts`)

Commission arithmetic (the specification's ₹6,00,000 example, rounding, malformed input), state
machines, eligibility gates and scoring, duplicate scoring including Devanagari names, phone
normalisation, the working-hours SLA clock, Indian number formatting in all three languages, the
default role-permission boundaries, themes, and translation parity (same keys, same placeholders,
no empty text, sample keys really translated).

### Integration tests (`tests/integration.test.ts`)

Run against a real PostgreSQL database (`TEST_DATABASE_URL`, wiped at the start) through the same
services and row-level security the application uses.

| Specification item | Test |
| --- | --- |
| Full lifecycle | Enquiry → survey → matching → quotations → selection → order → project with frozen milestones |
| Commission | No entry before verification; exactly 2% once; eligible part only; none for a rejected collection; invoice with GST; ledger cannot be updated or deleted; adjustment is a new entry |
| Refund | Proportional reversal entry; refund cannot exceed the amount received |
| Duplicate webhook | Bad signature rejected; first call processed; replay is `duplicate`; one ledger entry |
| Role boundaries | Sales cannot reconcile; partner cannot verify its own collection or confirm an order; customer and surveyor cannot run matching; operations cannot invoice |
| Cross-tenant | Another partner sees no orders, projects, collections, ledger, licences or customers, even with hand-written SQL; cross-tenant writes are blocked by the database |
| Customer isolation | A customer cannot open or act on another customer's enquiry |
| Finance data | Partners, sales and surveyors cannot read referrals |
| Duplicates | Same phone and similar project name is flagged for review; nothing is merged |
| Consent | Enquiry without privacy consent is rejected |
| State machines | Out-of-order lead steps rejected; repeated step is a no-op; reason required for exceptions |
| Eligibility gates | Unverified partner and out-of-area partner are ineligible with reasons; ineligible partner cannot be invited |
| Quotation versioning | Revision creates version 2; version 1 cannot be changed even by direct SQL; other partners cannot read or write it |
| Selection | Not possible before release; only once; declined order produces no project |
| Order gates | Cannot confirm before partner acceptance or without a contract |
| Project gates | Cannot start without verified documents and readiness; cannot jump to handover |
| Offline sync | Five event types applied once, replay acknowledged as duplicates, device and server times stored separately, events for other projects rejected |
| Incident escalation | High-severity hazard escalates, stops work, notifies QC; partner cannot lift the stop, AIEC can |
| Finance consent | No referral without consent; unsigned lender refused; only approved fields in the handoff; lender statuses need a source; staff cannot withdraw on the customer's behalf; withdrawal recorded |
| Licence expiry | Lapsed licence expires the partner, removes it from matching, alerts staff |
| Scheduled reminders | Quotation due time set on acceptance; each alert raised once for due records and not for records that are not due; second run raises nothing; expiry alerts repeat only at the next threshold; only the owning partner and the right staff are notified; completed work stops alerts; every raised type has en / hi / mr text |
| Partner views | A partner sees only its own load, limit, schedule and performance record; technicians and customers are refused |
| Five-project capacity | Partner limit enforced; sixth project refused and stays queued; two simultaneous confirmations for one free slot — exactly one succeeds |

## Browser checks (need a running server with demo data)

| Command | What it does |
| --- | --- |
| `node scripts/smoke.mjs <ROLE> <en\|hi\|mr> -` | Signs in as a demo role and opens every navigation link; fails on HTTP errors, console errors, not-found screens, horizontal overflow or untranslated keys |
| `node scripts/smoke.mjs <ROLE> <locale> <dir> /path /path@mobile` | Same for specific pages, with screenshots |
| `BASE_URL=<url> npm run probe` | Black-box probe that needs no credentials and writes nothing, so it can run against a deployed URL: security headers, anonymous access to every workspace and API, forged session cookies, cross-origin writes, bad webhook signatures, housekeeping without the secret, and (for non-local URLs) that https, HSTS and sandbox-off hold |
| `npm run e2e` | Technician flow in a mobile-sized browser: go offline, check in and start a task, confirm nothing reached the server, reconnect, confirm each record exists once, replay the queue and confirm nothing is duplicated |
| `LOCALES=en,hi,mr node scripts/shot.mjs <dir> name=/path` | Screenshots of public pages |

Last full run: all navigation pages for owner, partner admin, customer and technician in English,
Hindi and Marathi passed; detail pages passed on desktop and mobile widths.

## Not covered

- Load and concurrency beyond the capacity race test.
- Real devices, real camera capture and poor-network behaviour (tested with browser offline emulation only).
- Screen readers (labels, roles and focus styles are present but not audited with assistive technology).
- External providers, because none is connected.
- Hindi and Marathi wording has not been reviewed by a professional translator.
