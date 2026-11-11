# AIEC NATIONAL ELEVATOR MARKETPLACE

## Full English Product, Business, Technical and Implementation Specification for Claude Code

**Version:** 1.0\
**Date:** 11 November 2026\
**Launch geography:** Pune and Pimpri-Chinchwad (PCMC), Maharashtra,
India\
**Business model:** Hybrid managed marketplace\
**Order control:** AIEC-assisted matching; customer makes final partner
selection\
**Finance model:** Consent-based bank / RBI-regulated NBFC referral\
**Commission:** Milestone-based on verified partner collections\
**Initial capacity:** Maximum five concurrent active projects

------------------------------------------------------------------------

# 0. Instructions to Claude Code

Act as the senior product engineer and software architect implementing
AIEC National Elevator Marketplace.

## 0.1 Repository audit before coding

Before changing files:

1.  Inspect the entire repository structure.
2.  Identify framework, package manager, runtime, database,
    authentication, routing, UI system, test framework and deployment
    setup.
3.  Read README files, project instructions, environment examples,
    migrations, schema, tests and deployment configuration.
4.  Inventory existing working features and preserve them unless they
    conflict with this specification.
5.  Produce an audit covering architecture, implemented modules, missing
    modules, security gaps, database gaps, broken tests and deployment
    risks.
6.  Prepare a phased implementation plan with acceptance criteria.
7.  Do not replace a working stack merely because this document lists a
    preferred stack.
8.  Never expose secrets, credentials, production environment variables
    or private customer data.

## 0.2 Engineering principles

-   Build a working production-oriented application, not a static
    mockup.
-   Every visible button, form, filter, navigation item and status
    change must work.
-   Database is the source of truth.
-   Enforce authorization on the server and in database policies.
-   Enforce company-level multi-tenancy.
-   Use transactions for financial ledger and order-state changes.
-   Use idempotency for payment reconciliation, commission generation
    and webhooks.
-   Audit every material state transition.
-   Never fabricate licence, inspection, statutory approval, bank
    approval, payment or loan-disbursement status.
-   Do not represent AIEC as a bank, lender, statutory inspector,
    regulator, lift manufacturer or licensed lift contractor unless the
    actual legal status and authorisations support it.
-   If external credentials or agreements are unavailable, build a
    clearly labelled sandbox adapter. Never present sandbox data as a
    real integration.

## 0.3 Definition of done

A feature is complete only when UI, backend validation, authorization,
database constraints, loading/empty/error states, audit events,
automated tests and documentation are present.

------------------------------------------------------------------------

# 1. Executive Summary and Locked Decisions

AIEC (All India Elevators Company) is a technology-enabled elevator
industry marketplace connecting customers with verified licensed
elevator companies, manufacturers, suppliers, service providers and
finance institutions.

AIEC initially operates as a hybrid managed marketplace and coordination
platform rather than a capital-intensive manufacturer or installation
contractor.

## 1.1 Locked strategic decisions

  -----------------------------------------------------------------------
  Decision                            Final configuration
  ----------------------------------- -----------------------------------
  Brand                               ALL INDIA ELEVATORS COMPANY (AIEC)

  Product                             AIEC National Elevator Marketplace

  Business model                      Hybrid managed marketplace

  Order control                       AIEC qualifies and recommends;
                                      customer makes final partner
                                      selection

  Launch geography                    Pune and PCMC

  Finance model                       Bank / regulated NBFC referral
                                      partnership

  Lending                             AIEC does not lend or approve loans

  Commission                          Milestone-based on verified partner
                                      collections

  Initial illustrative commission     2% of net eligible order value,
                                      subject to signed agreement

  Execution                           Appropriately licensed/authorised
                                      partner company

  Technician                          Sub-role under partner company

  Initial project capacity            Maximum five concurrent active
                                      projects

  First priority                      Revenue validation in first 90 days

  Expansion                           Pune/PCMC → Maharashtra → selected
                                      Indian states
  -----------------------------------------------------------------------

**Core operating principle:** AIEC controls the platform. The customer
chooses the partner. The appropriately licensed partner performs the
contracted technical work. The regulated lender makes the lending
decision.

This is an operating principle, not a blanket legal disclaimer. Actual
responsibilities depend on applicable law, conduct and contracts.

## 1.2 Value proposition

**Customers** - Access to verified partner companies. - Comparable
quotations in a standard format. - Documented project milestones. -
Project visibility and service records. - Optional consent-based finance
referral.

**Partner companies** - Qualified leads. - Customer acquisition
channel. - Quotation and order workflow. - Project coordination
software. - Collection and commission transparency.

**Finance institutions** - Consent-based customer referrals. -
Structured project context. - Approved referral workflow.

**AIEC** - Milestone commission. - Later partner subscriptions, service
marketplace fees and SaaS revenue. - A scalable network without owning
all inventory or installation capacity.

------------------------------------------------------------------------

# 2. Scope and Business Boundaries

## 2.1 AIEC platform responsibilities

-   Customer acquisition and lead capture.
-   Lead qualification.
-   Site survey coordination.
-   Partner verification and capability registry.
-   Partner matching and recommendation.
-   Standardised quotations and comparison.
-   Customer selection workflow.
-   Order and contract record management.
-   Project milestone tracking.
-   Payment evidence and reconciliation.
-   Commission calculation and invoicing workflow.
-   Finance referral handoff.
-   Quality evidence and issue tracking.
-   Warranty, AMC and service request tracking.
-   Customer support and dispute coordination.
-   Analytics and audit trails.

## 2.2 Partner company responsibilities

As allocated by the customer contract and applicable law:

-   Technical design and specifications.
-   Product selection and supply.
-   Required licences and authorisations.
-   Statutory applications and approvals.
-   Installation and commissioning.
-   Qualified workforce and supervision.
-   Safety practices.
-   Testing and documentation.
-   Warranty and maintenance obligations.
-   Insurance required by law or contract.

AIEC must not misrepresent partner technical work as its own.

## 2.3 Lender responsibilities

A bank or RBI-regulated NBFC independently controls: - Product
eligibility. - KYC. - Credit assessment. - Approval or rejection. - Loan
agreement. - Disbursement. - Repayment and collections. -
Lending-product grievance handling.

AIEC initially performs consent-based referral and handoff, subject to
lender agreement and regulatory classification.

## 2.4 Initial release exclusions

Do not implement as live production capabilities without separate
approval: - AIEC-funded loans or credit underwriting. - AIEC loan
approval. - AIEC custody of loan repayments. - Unauthorised escrow or
pooled payment accounts. - AIEC-owned elevator inventory or warehouse. -
Pan-India launch. - Automated statutory approval or safety
certification. - Paid placement secretly influencing quality rankings. -
Unverified partners performing regulated lift work.

------------------------------------------------------------------------

# 3. Pilot Geography and Capacity

## 3.1 Target areas

Pune, Pimpri-Chinchwad, Wakad, Hinjawadi, Baner, Balewadi, Ravet,
Tathawade, Chakan and Talegaon.

These are target areas, not proof of existing partner coverage. Activate
each area only after partner capacity, service radius and response
capability are verified.

## 3.2 Initial project scope

Prioritise technically standard and assessable elevator projects,
including suitable residential passenger lift requirements. G+4/G+5 may
be used as an example lead category but is not automatic technical
eligibility.

The qualified technical partner must assess: - Building configuration. -
Floors and stops. - Rated load/capacity and speed. - Shaft
width/depth. - Pit and overhead. - Machine-room requirements. - Power
supply. - Door configuration. - Fire and emergency requirements. -
Accessibility requirements. - Applicable statutory standards and state
rules. - Site readiness and material access.

Complex, high-rise, hospital, fire-service, goods-lift and
custom-engineered projects require additional technical review.

## 3.3 Capacity control

-   Maximum five concurrent active projects during the pilot.
-   Check AIEC capacity before confirming a new project.
-   Check individual partner capacity.
-   Queue qualified leads when capacity is full.
-   Do not accept an order merely because a lead exists.

------------------------------------------------------------------------

# 4. Roles and Permissions

Use granular RBAC and company-level tenancy. Users may hold multiple
roles only when explicitly permitted and audited.

## 4.1 Roles

### Super Admin / Owner

Overall dashboard, partner activation/suspension, commission policy,
commercial exceptions, project/compliance exceptions, financial
summaries, city activation and audit reports.

### AIEC Operations Manager

Leads, survey assignments, quotation coordination, order/project
tracking, SLA escalation and customer support.

### City Manager

Assigned geography, local partners and leads only.

### Sales / Lead Executive

Lead capture, qualification, contact history and follow-up. No technical
or financial settlement approval.

### Surveyor

Assigned surveys, measurements, site evidence and survey submission.
Cannot issue statutory technical approval.

### Customer / Builder / Property Owner

Create enquiries, request surveys, compare eligible quotations, select
partner, view progress, submit permitted evidence, raise complaints and
consent to finance referral.

### Licensed Elevator Partner Company

Company documents, licence, insurance, capability, service geography,
capacity, lead acceptance, quotations, orders, project tasks,
technicians, milestone updates, collection evidence and service
obligations.

### Partner Supervisor

Assigned projects, technician tasks, evidence review and safety
escalation.

### Technician

Assigned company projects/tasks only; attendance, checklists, work
evidence, material usage and hazard reporting. No broad customer
database or partner financial access.

### Manufacturer / Supplier

Product catalogue, product documentation, supply quotation and accepted
material-order status only.

### Finance Referral Coordinator

Minimum necessary referral data, consent and approved lender handoff.
Cannot approve loans or modify credit data.

### QC / Inspection Coordinator

Evidence review, defect and rework records, statutory document tracking.
Internal AIEC QC is not statutory inspection.

### Service Partner

Eligible service requests, maintenance visits, evidence, warranty and
AMC tasks.

## 4.2 Permission examples

-   `lead.create`
-   `lead.view.assigned`
-   `lead.view.city`
-   `partner.verify`
-   `partner.activate`
-   `quotation.submit`
-   `quotation.compare`
-   `order.confirm`
-   `project.assign`
-   `milestone.update`
-   `payment.evidence.submit`
-   `payment.reconcile`
-   `commission.calculate`
-   `commission.adjust`
-   `finance.referral.create`
-   `finance.referral.view`
-   `qc.review`
-   `compliance.document.approve`
-   `audit.view`

Every API/server action must check permission and tenant scope. Never
rely only on hiding UI controls.

------------------------------------------------------------------------

# 5. End-to-End Workflow

## 5.1 Lead lifecycle

`NEW → CONTACTED → QUALIFIED → SURVEY_PENDING → SURVEY_COMPLETED → PARTNER_MATCHING → QUOTATION_PENDING → QUOTATION_RECEIVED → CUSTOMER_REVIEW → NEGOTIATION → SELECTED → ORDER_PENDING → CONFIRMED`

Exception/terminal states: `LOST`, `ON_HOLD`, `DUPLICATE`,
`DISQUALIFIED`, `CANCELLED`.

Every transition records previous/new status, actor, timestamp, reason,
evidence, source and note.

## 5.2 Lead capture

Sources: website, customer app, WhatsApp Business, phone, builder
referral, architect referral, surveyor, digital ads and
existing-customer referral.

Capture: - Customer name and phone. - Customer type. - Project name and
address. - City/zone. - Building type. - Floors/stops if known. - Lift
requirement. - Approximate budget if volunteered. - Required timeline. -
Site readiness. - Finance interest. - Consent and privacy notice
version. - Source and referral attribution.

Do not collect sensitive identity or finance documents at general lead
capture.

## 5.3 Duplicate detection

Use normalised phone, site geolocation, project name, address
similarity, customer identity and time window. Flag potential duplicates
for review. Do not auto-merge solely on phone or coordinates. Preserve
source attribution and audit history.

## 5.4 Qualification

Check genuine requirement, decision-maker status, active service
geography, project type, approximate scope, survey feasibility, expected
timeline and contact consent.

## 5.5 Site survey

Capture: - Coordinates and location accuracy. - Surveyor identity and
visit time. - Floors/stops. - Shaft width/depth. - Pit and overhead. -
Landing details. - Machine-room details, if applicable. - Power
supply. - Civil readiness. - Access/material movement. - Drawings and
document references. - Photo evidence. - Customer/representative
acknowledgement. - Surveyor notes and review status.

Camera capture and offline queue may be required. Do not claim client
metadata alone proves photo authenticity. Survey completion is not
technical approval.

## 5.6 Partner matching

Apply hard eligibility gates first: 1. Valid required
licence/authorisation for the work and location. 2. Verified company
identity. 3. Technical capability. 4. Required insurance. 5. Confirmed
capacity. 6. No suspension or safety block. 7. Service area includes
site.

Only eligible partners receive a match score.

Suggested configurable score:

  Factor                    Weight
  ----------------------- --------
  Compliance/licence           25%
  Technical capability         20%
  Capacity/availability        20%
  Verified performance         15%
  Price competitiveness        10%
  Response reliability         10%
  Total                       100%

Score is advisory, versioned and explainable. It never overrides
eligibility gates or customer choice. Paid placement must not secretly
influence quality ranking.

## 5.7 Quotation workflow

Invite two or three eligible partners where available. Never fabricate a
third quote.

Standard quotation fields: - Partner identity and verification status. -
Manufacturer/OEM and model. - Capacity, speed, floors/stops. - Door,
controller, drive and safety details. - Supply and installation scope. -
Civil/electrical inclusions and exclusions. - Freight, taxes and
total. - Warranty and AMC. - Delivery/installation schedule. - Payment
milestones. - Validity. - Technical assumptions. - Required approvals
and dependencies.

Retain original partner quotation and immutable versions.

## 5.8 Customer selection

Actions: - Select partner. - Request negotiation. - Request
clarification. - Request another eligible quote. - Reject all. - Put on
hold.

Record exact quotation version and customer selection. AIEC recommends;
customer chooses.

## 5.9 Order confirmation

Required: - Customer selection. - Partner acceptance. - Frozen scope and
quotation version. - Executed/accepted customer-partner contract. -
Agreed payment schedule. - Applicable technical/statutory approval
path. - Rechecked licence and insurance. - Confirmed capacity. -
Assigned project supervisor.

Order confirmation does not mean statutory permission has been obtained.

------------------------------------------------------------------------

# 6. Partner Network

## 6.1 Partner categories

-   Licensed elevator companies.
-   Manufacturers/OEMs.
-   Component suppliers.
-   Installation subcontractors under an appropriately authorised
    arrangement.
-   Service/AMC providers.
-   Independent QC providers where appropriate.

## 6.2 Onboarding documents

As applicable: - Legal name and entity type. - PAN and GSTIN. -
Registered/operating address. - Authorised signatory. - Bank proof. -
Applicable state lift contractor licence. - Electrical contractor
licence where required. - Licence scope, number, issue and expiry. -
Insurance certificates. - Technical staff and qualifications. - Service
geography. - Lift categories and capabilities. - Project capacity. -
Past project references. - Warranty/service policy. - Safety
procedures. - Customer references. - Signed Partner Network Agreement.

Activation requires authorised review.

## 6.3 Partner states

`DRAFT → SUBMITTED → UNDER_REVIEW → VERIFIED → ACTIVE`

Exceptions: `REJECTED`, `SUSPENDED`, `EXPIRED`, `UNDER_RENEWAL`,
`TERMINATED`.

Expired mandatory licence blocks new regulated work until renewed and
verified.

## 6.4 Partner grades

Silver, Gold and Platinum may be used as evidence-based performance
categories. Subscription payment must not automatically confer a quality
grade.

## 6.5 Partner dashboard

Company profile, documents, expiry alerts, leads, accept/reject, site
visits, quotation builder, order inbox, project tasks, technicians,
material tracking, evidence, collection evidence, commission ledger,
invoices, complaints, warranty, AMC and performance.

------------------------------------------------------------------------

# 7. Milestone Commission Engine

## 7.1 Commercial policy

Initial proposed pilot rate: **2% of net eligible order value**, subject
to signed Partner Agreement.

Commission becomes eligible proportionately as customer payments are
actually received by the partner and verified. Do not calculate
commission on unpaid contract value.

The agreement must define eligible value and exclusions such as GST,
statutory charges, approved reimbursements and agreed pass-through
items.

## 7.2 Example

Assume net eligible order value ₹6,00,000 and commission 2%. Potential
total commission is ₹12,000.

  Milestone                   Partner collection   AIEC commission
  ------------------------- -------------------- -----------------
  Advance 10%                            ₹60,000            ₹1,200
  Drawings/production 30%              ₹1,80,000            ₹3,600
  Material delivery 30%                ₹1,80,000            ₹3,600
  Installation/QC 25%                  ₹1,50,000            ₹3,000
  Handover 5%                            ₹30,000              ₹600
  Total                                ₹6,00,000           ₹12,000

Illustrative only. Actual milestones must reflect scope, contract and
risk.

## 7.3 Formula

`commission_amount = verified_eligible_collection × applicable_commission_rate`

Store order, partner, customer payment reference, collection date,
amount, eligible/excluded amount, commission rate/version, calculated
amount, evidence, verification, invoice, due date, payment and
adjustment references.

## 7.4 Reconciliation states

`PENDING_EVIDENCE → SUBMITTED → UNDER_REVIEW → VERIFIED → INVOICED → DUE → PAID`

Exceptions: `REJECTED`, `DISPUTED`, `ADJUSTED`, `REFUNDED`.

Use bank reference, partner receipt and customer confirmation as
appropriate. A screenshot alone should not be treated as definitive
where bank reconciliation is available.

## 7.5 Financial controls

-   Customer pays contracted partner directly in initial model.
-   AIEC invoices its agreed commission.
-   AIEC does not hold full elevator purchase amount.
-   No escrow/pooling without appropriate authorisation.
-   Policy changes are versioned and prospective unless signed
    otherwise.
-   Refunds/cancellations create documented adjustments.
-   Ledger changes require actor, reason and audit event.
-   CA reviews GST/TDS/accounting treatment.

------------------------------------------------------------------------

# 8. Finance Referral Module

## 8.1 Initial boundary

Build consent-based referral and lender handoff only.

AIEC does not lend, underwrite, approve, set lender rates, guarantee
eligibility, collect loan repayments or hold loan disbursement funds.

The regulatory classification depends on actual activity. Calling it
"referral" does not automatically exclude LSP or other obligations.

## 8.2 Customer journey

1.  Customer selects finance interest.
2.  App explains referral and data sharing.
3.  Customer sees privacy notice and purpose.
4.  Customer gives explicit consent.
5.  AIEC captures minimum referral data.
6.  Referral is sent through lender-approved channel.
7.  Customer completes KYC/application with lender.
8.  Lender independently assesses.
9.  AIEC records only permitted referral status.
10. Lender handles sanction, disbursement, repayment and servicing.

## 8.3 Minimal data

Name, contact, customer type, project/order reference, approximate
finance requirement, contact preference, consent timestamp/version,
lender and referral status.

Avoid storing Aadhaar, PAN copies, bank statements, salary slips or
credit reports in the MVP unless a lawful need, lender arrangement,
security architecture and retention policy are approved.

## 8.4 Lender registry

Legal entity, regulatory status, contact, product category, agreement
status/dates, approved data fields, referral channel, fee model,
grievance route, integration status and compliance review date.

## 8.5 Referral states

`CONSENT_PENDING → CONSENTED → READY_TO_REFER → REFERRED → LENDER_CONTACTED → APPLICATION_IN_PROGRESS → APPROVED / REJECTED / WITHDRAWN / EXPIRED`

Use only statuses legitimately supplied by lender or confirmed by
customer. Never infer approval/disbursement.

## 8.6 Regulatory gate

Before production: - Written lender agreement. - Lender legal/compliance
classification of AIEC's role. - Determine whether AIEC is an LSP or
other regulated outsourcing/referral arrangement. - Confirm permitted
remuneration and payer. - Confirm consent, data sharing, grievance and
audit requirements. - Confirm lender-approved application channels. -
Review RBI Digital Lending Directions, 2025 and subsequent updates. - Do
not launch multi-lender offer comparison until applicable requirements
are implemented.

------------------------------------------------------------------------

# 9. Legal, Safety and Compliance

This is an engineering control specification, not legal advice. Obtain
current advice from Maharashtra lift-law counsel and verify original
Gazette notifications.

## 9.1 Maharashtra baseline

Review the Maharashtra Lifts, Escalators and Moving Walks Act, 2017,
applicable amendments and 2026 Rules as the current Maharashtra
framework. Do not rely only on the old 1939 framework.

Verify from official Gazette: - Effective dates and amendments. -
Contractor licensing. - Erection permission. - Inspection and working
licence. - Maintenance requirements. - Insurance. - Incident
reporting. - Transitional requirements. - CCTV/ARD/OLPD requirements
where applicable. - Logbook and audit requirements.

Do not hard-code a news report as law. Maintain a configurable
compliance register with source, section/rule, effective date,
applicability, reviewer and review date.

## 9.2 Compliance registry

Document types: - Contractor licence. - Electrical contractor licence
where applicable. - Insurance. - Erection permission. - Approved
drawings. - Inspection reports. - Working licence. - Maintenance
records. - Safety audit records. - Incident reports. - Product
certificates. - Warranty records. - State-specific documents.

Each record stores type, authority, reference number, issue/expiry,
state, related company/project/lift, file, verification status,
reviewer, date and rejection reason.

## 9.3 Safety gates

-   No regulated work allocation to unqualified/unlicensed party.
-   No project start before required permissions and site conditions are
    confirmed.
-   Unsafe work must stop regardless of commercial deadline.
-   Incident triggers immediate escalation.
-   Internal AIEC QC is not statutory inspection.
-   Handover checks applicable working licence and required documents.
-   Maintenance/audit schedules are configurable to current law and
    contract.

## 9.4 Incident workflow

`REPORTED → TRIAGED → EMERGENCY_ESCALATION → INVESTIGATION → CORRECTIVE_ACTION → REVIEWED → CLOSED`

Record date/time, lift/project, reporter, minimum necessary
affected-person data, description, immediate action, authority/insurer
notifications where required, evidence, responsible partner, findings,
corrective actions and closure approval.

Incident records cannot be deleted by normal users. Corrections are
appended and audited.

## 9.5 Insurance

Track legally and contractually required insurance. Obtain broker/legal
advice on AIEC coverage, potentially professional indemnity/errors and
omissions, cyber and general liability. Insurance does not remove all
liability.

## 9.6 Data protection

Design for applicable Indian data protection law and rules: - Clear
privacy notice. - Purpose-specific consent. - Consent withdrawal. - Data
minimisation. - Retention schedule. - Applicable access/correction
workflows. - Secure deletion/anonymisation. - Processor/vendor
agreements. - Breach response. - Access logging and export controls.

------------------------------------------------------------------------

# 10. Applications and Screen Inventory

## 10.1 Customer app

Welcome/login, registration, dashboard, new lift requirement, project
details, survey request/status, partner options/profile, quotation
comparison/details, negotiation, partner selection, contract/order
summary, project timeline, milestones, finance consent/status,
documents, warranty, AMC/service, complaints, notifications,
profile/privacy/consent.

## 10.2 Partner app

Login, onboarding, company profile, licence/insurance, verification,
capability/service area, capacity calendar, lead inbox/details,
accept/reject, site scheduler, quotation builder/history, order
inbox/details, project dashboard/tasks, team/technicians, materials,
evidence, payment evidence, commission ledger, invoices, complaints,
warranty/AMC and performance.

## 10.3 Technician app

Login, assigned work, project details, daily tasks, attendance/site
check-in, safety checklist, camera evidence, material usage, work
progress, defect/hazard report, offline queue, sync status, supervisor
review and notifications.

Technician access is limited to assigned company/project data.

## 10.4 AIEC admin web

Executive dashboard, lead CRM, customer directory, surveys, partner
registry/verification/capacity, matching, quotation marketplace, order
control, project control, milestone reconciliation, commission, finance
referrals, compliance, QC/defects, incidents, service/AMC, disputes,
notifications, user/permissions, reports, audit logs and system
settings.

Every screen must have functional controls, validation, pagination,
loading/empty/error states and responsive layouts.

------------------------------------------------------------------------

# 11. Technical Architecture

## 11.1 Preferred stack

Use existing stack where viable.

  Layer            Preferred
  ---------------- -------------------------------------------------
  Admin web        Next.js + React
  UI               Tailwind CSS
  Mobile           React Native + Expo
  Backend          Supabase and/or Node.js service
  Database         PostgreSQL
  Geospatial       PostGIS
  Authentication   Supabase Auth / phone OTP
  Authorization    RLS + server checks
  Storage          Private object storage
  Client state     Zustand where appropriate
  Offline          Local database + sync queue
  Maps             Google Maps or Mapbox
  Notifications    Expo Push / FCM
  Messaging        WhatsApp Business API through approved provider
  Jobs             Queue/worker only when needed
  Monitoring       Structured logs and error monitoring

Do not introduce Kubernetes, Redis or extra services until scale
justifies them.

## 11.2 Architecture

``` text
Customer Web / Customer App
Partner App
Technician App
AIEC Admin Web
        |
Authentication + API
        |
Business Services
CRM / Leads / Survey / Partner Registry / Matching
Quotations / Orders / Projects / Milestones / Commission
Finance Referral / Compliance / QC / Incidents / Service
        |
PostgreSQL + PostGIS / Private File Storage / Audit Events
        |
WhatsApp / SMS / Maps / E-sign / AIEC Fee Payments / Lender Handoff
```

## 11.3 Database principles

-   UUID primary keys.
-   Foreign keys and unique constraints.
-   Tenant-aware relationships.
-   Explicit states.
-   Numeric/decimal for money, never floating point.
-   Currency field, initially INR.
-   UTC timestamps, display Asia/Kolkata.
-   Immutable quotation and commission versions.
-   Correct soft-delete/retention policy.
-   Index tenant, status, dates, foreign keys and geospatial fields.
-   Migrations in source control.
-   Avoid JSON blobs for core relational business data.

## 11.4 Suggested entities

**Identity/tenancy:** `users`, `user_profiles`, `roles`, `permissions`,
`user_roles`, `companies`, `company_users`, `company_locations`.

**Partner compliance:** `company_licenses`,
`company_insurance_policies`, `company_verification_reviews`,
`partner_capabilities`, `partner_service_areas`,
`partner_capacity_records`, `partner_performance_events`.

**Customer/lead:** `customers`, `customer_projects`, `leads`,
`lead_sources`, `lead_events`, `lead_assignments`,
`lead_duplicate_candidates`, `customer_consents`.

**Survey/matching:** `site_surveys`, `survey_measurements`,
`survey_evidence`, `partner_matches`, `matching_rule_versions`.

**Quotation/order:** `quotations`, `quotation_versions`,
`quotation_items`, `quotation_documents`, `customer_partner_selections`,
`orders`, `order_contracts`, `order_state_events`.

**Execution:** `projects`, `project_tasks`, `project_milestones`,
`project_team_assignments`, `technicians`, `technician_attendance`,
`work_evidence`, `material_orders`, `material_deliveries`.

**Finance:** `lender_partners`, `finance_referrals`,
`finance_referral_events`, `finance_consent_records`. Avoid unnecessary
credit documents in referral MVP.

**Payments/commission:** `partner_collections`, `collection_evidence`,
`collection_reconciliations`, `commission_policies`,
`commission_ledger`, `commission_invoices`, `commission_payments`,
`commission_adjustments`.

**Quality/service:** `qc_inspections`, `qc_defects`,
`corrective_actions`, `safety_incidents`, `warranties`, `amc_contracts`,
`service_tickets`, `maintenance_visits`, `inspection_records`.

**Governance:** `approvals`, `disputes`, `notifications`, `audit_logs`,
`webhook_events`, `system_settings`.

Add `company_id` only where ownership model requires it. Customer-owned
and platform-owned records need correct tenancy design.

## 11.5 API examples

``` http
POST   /api/leads
GET    /api/leads
GET    /api/leads/:id
PATCH  /api/leads/:id
POST   /api/leads/:id/qualify

POST   /api/surveys
POST   /api/surveys/:id/evidence
POST   /api/surveys/:id/submit

GET    /api/partners/match?leadId=
POST   /api/partners
POST   /api/partners/:id/verification

POST   /api/quotations
POST   /api/quotations/:id/submit
POST   /api/quotations/:id/negotiate

POST   /api/orders
POST   /api/orders/:id/accept
POST   /api/orders/:id/confirm

POST   /api/projects/:id/tasks
POST   /api/projects/:id/milestones
POST   /api/projects/:id/evidence

POST   /api/collections/evidence
POST   /api/collections/:id/reconcile
GET    /api/commissions
POST   /api/commissions/:id/invoice
POST   /api/commissions/:id/adjust

POST   /api/finance/referrals
POST   /api/finance/referrals/:id/withdraw-consent

POST   /api/qc/inspections
POST   /api/incidents
POST   /api/service/tickets
```

Use consistent response envelopes, validation, pagination, error codes,
server-side authorization and idempotency.

------------------------------------------------------------------------

# 12. Security, Privacy and Offline Work

## 12.1 Tenant isolation

-   Partner A cannot read Partner B records/files.
-   Customer sees only own projects and permitted quotations.
-   Technician sees assigned tasks only.
-   Finance data restricted to authorised roles.
-   Admin access logged.
-   Private documents never stored in public buckets.

## 12.2 Supabase RLS

If Supabase is used: - Enable RLS on sensitive tables. - Policies must
check authenticated user, company membership and granular permission. -
Never trust client-supplied `company_id`. - Service-role keys remain
server-side. - Test cross-tenant access explicitly.

## 12.3 File security

Private buckets, short-lived signed URLs, file type/size validation,
malware scanning where feasible, access logs, document versioning and no
public URLs for private documents.

## 12.4 Audit logs

Audit login/security events, partner verification, licence changes, lead
assignment, customer selection, quotation versions, order confirmation,
contracts, payment evidence, commission adjustments, finance
consent/referral, QC/safety incidents, permission changes and
exports/deletions.

Audit records are append-only for application users.

## 12.5 Offline technician workflow

-   Local task cache.
-   Local evidence queue.
-   Unique client event IDs.
-   Retry with backoff.
-   Upload progress.
-   Conflict handling.
-   Server acknowledgement.
-   Sync failure recovery.
-   Pending/synced/failed states.

Record server receipt time and device capture time separately. Offline
task completion must not imply safety-critical approval.

------------------------------------------------------------------------

# 13. Notifications and SLA

Events: new lead, response due, survey scheduled/submitted, partner
invitation, quotation due/received, customer selection, order
acceptance, contract pending, payment evidence, commission due,
milestone overdue, licence/insurance expiry, QC defect, incident,
warranty expiry, maintenance due and complaint update.

Proposed operational targets (not statutory limits):

  Activity                           Target
  ---------------------------------- ----------------------
  New lead response                  4 working hours
  Partner accept/reject              1 working day
  Survey scheduling                  2 working days
  Quotation submission               3 working days
  Normal complaint acknowledgement   1 working day
  Emergency safety report            Immediate escalation

Support business calendars, holidays and escalation rules.

------------------------------------------------------------------------

# 14. Revenue and Financial Model

## 14.1 Revenue streams

**Phase 1:** milestone lift order commission.

**Phase 2:** partner subscription, service/AMC marketplace fee and
permitted finance referral remuneration under signed lender agreement.

**Phase 3:** supplier marketplace fees, partner SaaS subscriptions and
additional marketplace services.

Disclose all fees and follow the applicable agreement.

## 14.2 Illustrative commission scenarios

Assume average eligible order value ₹6,00,000 and 2% commission:

    Fully collected orders/month   Gross commission
  ------------------------------ ------------------
                               5            ₹60,000
                              10          ₹1,20,000
                              20          ₹2,40,000
                              30          ₹3,60,000
                              50          ₹6,00,000

Illustrative only, not a forecast or guaranteed income. Actual
collections depend on milestones and partner reconciliation.

## 14.3 Break-even

`Break-even collected orders = Monthly fixed operating cost / Average commission per fully collected order`

Example: ₹60,000 monthly fixed cost / ₹12,000 average commission = 5
fully collected orders. Excludes tax, variable costs, refunds, delayed
collections and development costs.

Track gross order value, eligible value, partner collections, commission
earned/invoiced/collected/overdue, refunds, referral income recognised,
operating expenses, contribution margin and cash runway.

Do not recognise partner's full sale value as AIEC revenue unless AIEC
is the principal seller under the actual transaction.

------------------------------------------------------------------------

# 15. Owner Command Centre

## Business dashboard

New/qualified leads, surveys, active partners, quotations, won/lost
orders, gross order value, commission earned/collected, conversion and
response time.

## Project control dashboard

Active projects, five-project capacity, milestones, site/material
readiness, partner capacity, delays, QC failures, handover and warranty.

## Risk dashboard

Expired licences, expiring insurance, missing statutory documents,
payment disputes, overdue commission, incidents, defects, complaints,
suspended partners and security alerts.

Use clear status labels and drill-downs. Serious exceptions must not be
hidden in charts.

------------------------------------------------------------------------

# 16. Risk Register

  Risk                   Control
  ---------------------- ------------------------------------
  Fake partner           KYC/licence verification
  Expired licence        Automatic block
  Poor installation      Qualified partner, evidence, QC
  Partner delay          SLA and capacity control
  Customer non-payment   Milestone contract
  Commission leakage     Reconciliation and attribution
  Customer bypass        Reasonable lead-attribution clause
  Incorrect quote        Standard scope and versioning
  Unsafe work            Stop-work escalation
  Fake payment proof     Bank/receipt reconciliation
  Finance mis-selling    Lender-controlled disclosure
  Data leak              RLS, encryption and audit
  Dispute                Evidence-based workflow
  Partner insolvency     Due diligence and contingency
  Service failure        Warranty/AMC tracking

------------------------------------------------------------------------

# 17. 90-Day Implementation Roadmap

## Phase 0 -- Repository audit

Inspect repository, map screens/routes, review database/auth, identify
reusable components, create architecture gap report, prioritised
backlog, risk register and migration plan.

## Phase 1 -- Commercial/compliance foundation

Define legal entity and accounting with CA; draft partner/customer
agreements; define commission schedule; validate Maharashtra lift
compliance; identify lender prospects; verify initial partner prospects.

## Phase 2 -- Revenue MVP

Build in order: 1. Authentication and permissions. 2. Company/partner
registry. 3. Customer and lead CRM. 4. Lead qualification. 5. Site
survey. 6. Partner verification. 7. Matching. 8. Quotations. 9. Customer
comparison and selection. 10. Orders. 11. Projects and milestones. 12.
Payment evidence and reconciliation. 13. Commission ledger. 14. Admin
dashboard. 15. Audit logs.

Release 1 must support a real lead through partner selection, confirmed
order, verified collection and commission ledger.

## Phase 3 -- Pilot operations

Activate five to ten verified partners, acquire Pune/PCMC leads, conduct
surveys, obtain quotations, confirm suitable orders, reconcile partner
collections, invoice commission and keep active projects at or below
five.

## Phase 4 -- Finance and service

Sign lender agreement, confirm regulatory role, implement
consent/referral handoff, warranty and AMC.

## Phase 5 -- Controlled expansion

Expand Maharashtra only after Pune unit economics are validated.
Configure state-specific compliance before other-state launch.

## 17.1 Proposed 90-day targets

  KPI                                                   Target
  ----------------------------------- ------------------------
  Partners screened                                         10
  Verified active partners                               5--10
  Customer leads                                            50
  Qualified leads                                           30
  Site surveys                                              15
  Valid quotations                                      10--20
  Confirmed orders                                        5--8
  Maximum active projects                                    5
  Finance institutions approached                            3
  Written finance partnership           1, subject to approval
  Active project compliance records                       100%

Targets are management assumptions, not guaranteed outcomes.

------------------------------------------------------------------------

# 18. Testing and Acceptance Criteria

## Authentication/roles

-   Unauthenticated users cannot access protected routes.
-   Partner A cannot read Partner B data.
-   Technician cannot access partner financial records.
-   Customer cannot access another customer's project.
-   Admin actions audited.
-   Permission revocation effective.

## Lead workflow

Create, detect duplicate, assign, qualify, schedule survey, submit
survey, match eligible partners and reject ineligible partners with
reason.

## Quotations

Partner submits; validation catches missing fields; versions preserved;
customer sees permitted offers; selection records exact version; partner
acceptance required before confirmation.

## Commission

Unpaid contract value generates no commission; verified collection
generates correct amount; duplicate webhook cannot double count; refund
adjusts; partner cannot modify rate; paid entries cannot be silently
edited.

## Finance

No referral without consent; withdrawal recorded; only approved fields
sent; no inferred approval; no unauthorised document access.

## Compliance/safety

Expired licence blocks allocation; missing approval creates hold;
incident cannot be deleted; QC failure creates corrective action;
internal QC does not create statutory approval; handover checks required
documents.

## Offline

Task cached; evidence queued; retries safe; duplicate sync prevented;
server/device time separated; failures visible.

## Minimum automated tests

Full lifecycle, role boundaries, cross-tenant attempts, duplicate leads,
eligibility gates, quotation versioning, customer selection, state
machine, commission, duplicate reconciliation, refund, finance consent,
licence expiry, incident escalation, offline sync and five-project
capacity.

Run lint, typecheck, unit, integration, production build and deployment
smoke tests.

------------------------------------------------------------------------

# 19. Suggested Repository Structure

Adapt to the current repository; do not force a rewrite.

``` text
aiec-marketplace/
  apps/
    admin-web/
    customer-app/
    partner-app/
    technician-app/
  packages/
    ui/
    types/
    validation/
    business-rules/
    api-client/
    config/
  supabase/
    migrations/
    functions/
    seed/
    tests/
  services/
    notifications/
    reconciliation/
    matching/
  docs/
    BUSINESS_BLUEPRINT.md
    PRODUCT_REQUIREMENTS.md
    TECHNICAL_ARCHITECTURE.md
    DATA_MODEL.md
    API_CONTRACTS.md
    SECURITY_MODEL.md
    COMPLIANCE_REGISTER.md
    OPERATIONS_SOPS.md
    TEST_PLAN.md
  scripts/
  README.md
```

A monorepo is optional. Follow an existing stable architecture.

------------------------------------------------------------------------

# 20. Required Claude Code Deliverables

**A. Audit:** repository map, stack report, feature inventory, gap
analysis, security assessment and implementation plan.

**B. Product foundation:** role/permission model, state machines,
navigation, design system and validation schemas.

**C. Database:** ERD, migrations, RLS, local seed data and database
tests.

**D. Revenue MVP:** CRM, partner onboarding, survey, matching,
quotations, customer selection, orders, milestones and commission.

**E. Finance/compliance:** referral consent, lender registry, referral
tracking, compliance registry and incident management.

**F. Operations:** project tracking, technician app, offline queue, QC,
warranty and AMC.

**G. QA:** automated/security test results, typecheck/build, deployment
instructions, known limitations and go-live checklist.

------------------------------------------------------------------------

# 21. Claude Code Execution Protocol

1.  Audit first; do not modify before understanding the repository.
2.  Report existing vs missing functionality.
3.  Plan small milestones and acceptance criteria.
4.  Preserve working components and data.
5.  Implement authentication, tenancy, permissions and schema first.
6.  Implement one vertical workflow: lead → survey → matching →
    quotation → selection → order.
7.  Implement money carefully: evidence → reconciliation → commission →
    invoice.
8.  Implement finance referral separately from marketplace customer
    data.
9.  Implement compliance and safety gates.
10. Test every milestone.
11. Update README, environment examples, migrations and operating
    instructions.
12. Report completed, partial, blocked and unimplemented work honestly.

Do not claim completion if only a mockup or partial workflow exists.

------------------------------------------------------------------------

# 22. Environment Configuration

Create `.env.example` with names only, no real secrets. Include only
variables required by the selected implementation.

``` env
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
MAPS_API_KEY=
WHATSAPP_PROVIDER=
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
SMS_PROVIDER=
SMS_API_KEY=
PAYMENT_PROVIDER=
PAYMENT_PUBLIC_KEY=
PAYMENT_SECRET_KEY=
PUSH_NOTIFICATION_KEY=
FILE_STORAGE_BUCKET=
SENTRY_DSN=
```

Server secrets must remain server-side. Use separate development,
staging and production credentials.

------------------------------------------------------------------------

# 23. Go-Live Checklist

## Business

-   [ ] Legal entity and tax treatment reviewed.
-   [ ] Partner agreement approved.
-   [ ] Customer terms approved.
-   [ ] Commission schedule signed.
-   [ ] Dispute/refund policy approved.
-   [ ] Insurance requirements reviewed.

## Partners

-   [ ] Minimum five partners verified.
-   [ ] Applicable licences reviewed.
-   [ ] Insurance checked.
-   [ ] Technical capability recorded.
-   [ ] Capacity confirmed.
-   [ ] Training completed.

## Finance

-   [ ] Lender role classification confirmed.
-   [ ] Written agreement completed.
-   [ ] Consent flow reviewed.
-   [ ] Data fields approved.
-   [ ] Grievance process documented.

## Technology

-   [ ] Production authentication.
-   [ ] RLS and tenant isolation tested.
-   [ ] Backup/restore tested.
-   [ ] Audit logs active.
-   [ ] Reconciliation idempotent.
-   [ ] Security review completed.
-   [ ] Production build passes.
-   [ ] Monitoring active.

## Safety/compliance

-   [ ] Current Maharashtra Act/Rules checked against original Gazette.
-   [ ] State compliance register configured.
-   [ ] Licence expiry controls active.
-   [ ] Project approval gates active.
-   [ ] Incident escalation tested.
-   [ ] QC/handover separation implemented.
-   [ ] Maintenance/audit reminders configured.

## Operations

-   [ ] Five-project capacity enforced.
-   [ ] Customer support active.
-   [ ] Partner escalation contacts verified.
-   [ ] Pilot projects selected.
-   [ ] Weekly review scheduled.

------------------------------------------------------------------------

# 24. Final Product Acceptance Rule

The first release succeeds when a real customer can:

1.  Submit a genuine elevator requirement.
2.  Complete a documented site survey.
3.  Receive comparable quotations from eligible licensed partners.
4.  Select a partner.
5.  Confirm a documented order.
6.  Track project milestones.
7.  View project and payment evidence.
8.  Have partner collections reconciled.
9.  Have AIEC commission calculated and invoiced.
10. Access warranty, service and complaint records.

The finance feature succeeds when the customer voluntarily consents to a
referral and securely continues with a legitimate lender, while AIEC
does not claim to provide or approve the loan.

**Final principle: AIEC controls the platform. The customer chooses the
partner. The appropriately licensed partner performs the contracted
technical work. The regulated lender makes the lending decision. Every
important action is documented, permission-controlled and auditable.**

------------------------------------------------------------------------

# 25. Regulatory Source Register -- Mandatory Verification

This is a starting register, not legal advice. Verify current official
documents and obtain professional advice before go-live.

1.  Maharashtra Lifts, Escalators and Moving Walks Act, 2017 and
    applicable amendments.
2.  Maharashtra Lifts, Escalators and Moving Walks Rules, 2026 and
    original Gazette notification.
3.  Maharashtra lift department circulars, forms and licensing
    requirements.
4.  RBI Digital Lending Directions, 2025 and subsequent updates.
5.  RBI requirements for regulated entities and their lending service
    providers.
6.  Digital Personal Data Protection Act, 2023 and applicable
    rules/commencement notifications.
7.  Consumer Protection Act, 2019 and applicable E-Commerce Rules.
8.  GST, TDS and invoicing requirements as advised by AIEC's CA.
9.  Applicable BIS standards and technical standards for the specific
    lift type.
10. State-specific lift laws before expansion beyond Maharashtra.

For each implemented regulatory rule, record official source, authority,
section/rule, publication/effective date, geography, applicability,
legal reviewer, last verification date and next review date.

Never hard-code an unverified legal interpretation as a permanent
product rule.
