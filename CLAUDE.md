# AIEC National Elevator Marketplace — working notes for Claude Code

Read `AGENTS.md` too (Next.js 16 has breaking changes; check `node_modules/next/dist/docs/` before using a framework API).
The product specification is `AIEC_National_Elevator_Marketplace_Claude_Code_Master_Specification_EN.md`.

## Standing instructions from the owner
1. Make no mistakes; verify every build.
2. Do not ask questions; take the best decision and state it.
3. Take screenshots and test each build (`scripts/shot.mjs`, `scripts/smoke.mjs`) and look at the images.
4. Everything user-facing must exist in English, Hindi and Marathi.
5. Frontend first, then the rest.
6. Never fabricate licences, approvals, payments, lender status, testimonials or customer logos. Sandbox adapters must stay labelled.

## Stack and layout
- Next.js 16 (App Router) + React 19 + Tailwind 4, TypeScript 5.9, PostgreSQL via `pg`, zod 4, vitest.
- `src/app/` pages: public (`/`, `/enquiry`, `/login`, `/privacy`, `/design`), workspaces `/admin`, `/partner`, `/customer`, `/tech`, `/onboarding/partner`, chooser `/app`.
- `src/app/actions/app.ts` — all server actions (thin: zod schema → service). `src/server/action.ts` runs them.
- `src/server/services/*.ts` — ALL business rules, permission checks, audit and notifications. Pages and API routes never contain rules.
- `src/server/db.ts` — `withCtx(ctx, fn)` runs as DB role `aiec_app` with tenant claims (RLS applies); `withSystem(fn)` is the trusted path. One connection runs statements serially.
- `src/server/ctx.ts` — session context, `can()`, `requirePerm()`. `src/lib/permissions.ts` — permission codes and default role map (DB is the runtime source).
- `src/lib/` pure logic: `state.ts` (state machines), `commission.ts` (integer paise), `matching.ts`, `duplicates.ts`, `sla.ts`, `validation.ts`, `themes.ts`.
- `db/migrations/*.sql` — schema, RLS, functions. `scripts/migrate.ts` applies them and syncs reference data. `scripts/seed.ts` builds demo data through the real services.
- `src/components/ui` (primitives + `form.tsx` ActionForm), `src/components/views` (shared screens), `src/components/shell`, `src/components/tech` (offline queue UI).
- API: `src/app/api/[...path]/route.ts` (spec 11.5 routes), `/api/files/[id]`, `/api/tech/sync`, `/api/webhooks/reconciliation`, `/api/jobs/housekeeping`.

## i18n rules
- Dictionaries: `src/i18n/messages/{en,hi,mr}/{core,enums,app}.ts`. English is the type source; the compiler rejects a missing key in Hindi/Marathi.
- Use `t('ns.key')`; enum labels are `e.<group>.<VALUE>`; errors are `err.<CODE>` (every `AppError` code needs one); notifications are `n.<TYPE>`.
- `npx tsx scripts/i18n-scan.ts` must report `0 missing`. Amounts always use `formatINR` (Indian grouping, Latin digits).

## Design / themes
- All colours, radii and fonts are tokens. Themes live in `src/lib/themes.ts`; `DEFAULT_THEME = 'enterprise'` (Aerchain-style). Change that one constant to switch.
- Use token classes (`bg-surface`, `text-on-brand`, `bg-sidebar`, `bg-ink`, `brand-*`, `accent-*`, `slate-*`), never raw `bg-white` or hex colours.
- Ten options are captured in `docs/design-options/`; gallery at `/design` (sandbox only).

## Commands
```
service postgresql start                      # local Postgres (db aiec / aiec_test, user aiec:aiec)
npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts
npx tsc --noEmit && npx tsx scripts/i18n-scan.ts
npx next build && PORT=3000 npx next start
node scripts/smoke.mjs <ROLE> <en|hi|mr> <outDir|-> [paths...]   # ROLE = demo role, e.g. SUPER_ADMIN, PARTNER_ADMIN, CUSTOMER, TECHNICIAN; no paths = every nav link
LOCALES=en,hi,mr node scripts/shot.mjs <outDir> name=/path [name=/path@mobile]
```
Demo sign-in buttons on `/login` exist only when `AUTH_SANDBOX=true`.

## Status (update this section as work proceeds)
Done: schema + RLS, all services, demo seed (full lifecycle verified), public site, theme system and 10 design options,
all admin / partner / customer screens, technician offline app, REST API, full en/hi/mr dictionaries.

Remaining, in order:
1. Browser-verify every screen for every demo role in en/hi/mr (desktop + mobile) with `scripts/smoke.mjs`; fix whatever it reports. Test the technician offline flow (queue while offline, sync once, no duplicates).
2. Automated tests in `tests/` (vitest): unit tests for `src/lib`, integration tests against `TEST_DATABASE_URL` covering spec section 18 (lifecycle, role boundaries, cross-tenant, duplicates, eligibility gates, quotation versioning, selection, state machines, commission, duplicate webhook, refund, finance consent, licence expiry, incident escalation, offline sync, five-project capacity), plus i18n parity.
3. `npm run lint` clean, production build clean.
4. README, `docs/` (audit, architecture, data model, API, security, compliance register, test plan), CI workflow (`.github/workflows/ci.yml`) with a Postgres service.
5. Update PR #1 description: complete / sandbox-only / not built (real SMS, WhatsApp, lender, payment, e-sign, maps, PostGIS, native mobile apps).

## Git
Branch `ccr-0e00fcb6-z6bogs`, draft PR #1. Commit and push after each verified stage. Do not put model names in commits or PR text.
