# Business blueprint

Source: sections 1–3 and 14 of the master specification. Figures are the specification's
illustrations, not forecasts. Everything marked *to be confirmed* needs the owner.

## What AIEC is

All India Elevators Company (AIEC) runs a **hybrid managed marketplace**: it connects customers with
verified, licensed elevator companies, suppliers, service providers and finance institutions. It
does not manufacture, install or lend.

**Operating principle:** AIEC controls the platform. The customer chooses the partner. The
appropriately licensed partner performs the contracted technical work. The regulated lender makes
the lending decision. This is an operating principle, not a blanket legal disclaimer; actual
responsibilities depend on law, conduct and contracts.

## Locked decisions

| Decision | Configuration |
| --- | --- |
| Model | Hybrid managed marketplace |
| Order control | AIEC qualifies and recommends; the customer makes the final partner selection |
| Launch area | Pune and PCMC (Wakad, Hinjawadi, Baner, Balewadi, Ravet, Tathawade, Chakan, Talegaon are target areas, activated one by one in `/admin/settings` only after partner capacity is verified) |
| Finance | Referral to a bank or regulated NBFC; AIEC does not lend or approve loans |
| Commission | Milestone-based on verified partner collections; initial illustrative rate 2% of net eligible order value, subject to a signed agreement (stored as versioned commission policy) |
| Execution | An appropriately licensed or authorised partner company; technicians are a sub-role of the partner |
| Pilot capacity | At most five concurrent active projects (setting `pilot_max_active_projects`), plus each partner's own limit |
| First priority | Revenue validation in the first 90 days |
| Expansion | Pune / PCMC, then Maharashtra, then selected states (each state's rules checked first) |

## Who gets what

- **Customers:** verified partners, comparable quotations in one format, documented milestones, project and payment visibility, service records, optional consent-based finance referral.
- **Partners:** qualified leads, a customer channel, quotation and order workflow, project software, transparent collections and commission.
- **Lenders:** consent-based referrals with structured project context.
- **AIEC:** milestone commission now; partner subscriptions, service / AMC fees, permitted referral remuneration and SaaS fees later.

## Revenue

| Phase | Stream |
| --- | --- |
| 1 | Milestone commission on lift orders |
| 2 | Partner subscription, service / AMC marketplace fee, referral remuneration only where a signed lender agreement permits it |
| 3 | Supplier marketplace fees, partner SaaS subscriptions, further marketplace services |

Illustration at ₹6,00,000 average eligible value and 2%: 5 fully collected orders a month give
₹60,000 gross commission, 10 give ₹1,20,000, 20 give ₹2,40,000. **Break-even collected orders =
monthly fixed operating cost ÷ average commission per fully collected order** (₹60,000 ÷ ₹12,000 = 5
orders). This excludes tax, variable cost, refunds, delayed collections and development cost.
The Reports screen shows the break-even from the configured monthly fixed cost.

AIEC must not book a partner's full sale value as its own revenue unless it is the principal seller
under the actual transaction (accounting advice *to be confirmed*). All fees are disclosed and
follow the signed agreement.

## Boundaries

AIEC does: lead qualification, survey coordination, partner verification and matching support,
quotation standardisation, order and project coordination, collection reconciliation, commission,
compliance tracking, finance referral with consent, service records.

AIEC does not: lend or approve loans, act as the statutory inspector, give the statutory permission,
or perform the technical installation. Order confirmation in the application is a commercial step
only.

Not in the first release: see `docs/audit.md` ("Not built").

## Risks tracked (specification section 16)

Regulatory change, partner non-compliance or lapse, safety incident, payment leakage outside the
platform, customer data misuse, lender regulation, over-commitment beyond five projects, weak
partner capacity in a zone. The matching gates, capacity gate, reconciliation, reminders, incident
escalation and the risk dashboard on `/admin` are the controls for these.

## Open commercial items for the owner

1. Signed partner agreement and customer terms (commission rate, collection and refund rules, dispute handling).
2. Lender agreement(s) and the legal classification of the referral role.
3. GST and revenue-recognition treatment.
4. Zone activation order and partner onboarding targets for the first 90 days.
