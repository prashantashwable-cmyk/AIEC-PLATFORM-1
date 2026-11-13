# Build audit

How this build compares with the master specification, stated plainly.

## Delivered as specified

Lead CRM with consent and duplicate review; survey; matching with hard gates and versioned,
explainable scoring; standard quotations with immutable versions; customer comparison and
selection; orders with a confirmation checklist and pilot capacity; projects with milestone,
compliance and safety gates; collection reconciliation; milestone commission ledger at 2% of
verified eligible collections with refunds, adjustments and invoices; consent-based finance
referral; compliance register; QC and incidents; service, warranty, AMC and disputes; roles,
permissions and tenant isolation in the database; audit log; offline technician workflow; REST API;
English, Hindi and Marathi throughout; automated tests for the specification's minimum list.

## Deviations

| Specification | This build | Reason |
| --- | --- | --- |
| React Native apps for customer, partner and technician | Responsive web apps; technician app is an installable offline-capable web app | One codebase that could be fully verified; the REST API and sync protocol are ready for native clients |
| Supabase Auth and Storage | Own OTP sessions and private file table on plain PostgreSQL | Runs on any PostgreSQL, including Supabase Postgres, without provider lock-in; storage is behind two functions for replacement |
| PostGIS service areas | Named zones plus plain coordinates | Enough for the Pune / PCMC pilot |
| WhatsApp, SMS, payment, lender, e-sign, maps integrations | Labelled sandbox adapters or not built | No provider accounts or agreements exist yet |

## Sandbox-only parts

One-time code shown on screen; demo sign-in; outbound message log; lender handoff log; bank
webhook contract; all demo data (`is_demo`).

## Not built

Native mobile apps, real provider integrations, maps, PostGIS, object storage, virus scanning,
a built-in job scheduler, error monitoring, staff multi-factor sign-in, automatic data retention,
PDF generation for quotations and invoices (they are screens and records, not PDF files), bulk
import and export.

## Things the owner must decide or supply

See the go-live list in the README and the open items in `docs/compliance-register.md`. In short:
legal texts, tax treatment, statutory document list, lender agreements, an SMS provider, hosting
and backups.

## Integrity statements

- No licence, approval, payment, lender status, testimonial or customer logo in this repository is real or presented as real.
- Screens that depend on a sandbox adapter say so.
- Order confirmation is described everywhere as a commercial step, not a statutory permission.
- Advisory matching scores are labelled as advisory; hard gates are never overridden by a score.
