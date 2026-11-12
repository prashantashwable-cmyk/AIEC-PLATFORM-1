# Compliance register

**This is a working register, not legal advice.** The sources below are the reading list the
application is designed around. The exact rules, forms and fees must be confirmed against the
current official text and with a qualified adviser before go-live. Nothing in the application
states that a permission has been granted unless a document for it has been uploaded and verified
by AIEC staff.

## Regulatory sources tracked (`regulatory_sources`)

| Source | Authority | Relevance |
| --- | --- | --- |
| Maharashtra Lifts, Escalators and Moving Walks Act, 2017 and amendments | Government of Maharashtra | Lift contractor licensing, erection permission, inspection, working licence |
| Maharashtra Lifts, Escalators and Moving Walks Rules (Gazette notification) | Government of Maharashtra | Procedure, forms, maintenance, insurance, incident reporting |
| Lift department circulars, forms and licensing requirements | Chief Electrical Inspector / lift department | Operational forms |
| RBI Digital Lending Directions and updates | Reserve Bank of India | Whether a referral role is a lending service provider |
| RBI requirements for regulated entities and their service providers | Reserve Bank of India | Outsourcing obligations of the lender |
| Digital Personal Data Protection Act, 2023 and rules | Government of India | Consent, notice, retention, data-principal rights |
| Consumer Protection Act, 2019 and E-Commerce Rules | Government of India | Marketplace disclosures, grievance handling |
| GST, TDS and invoicing requirements | CBIC / Income Tax Department | Commission invoicing |
| Applicable BIS and technical standards | Bureau of Indian Standards | Technical and safety standards for the lift type |
| State lift laws outside Maharashtra | Respective state governments | Gate before expanding to another state |

Each source has a review date and notes in `/admin/compliance`. Staff can add sources and link a
requirement to the source it comes from.

## How the application enforces compliance

| Control | Where it is enforced |
| --- | --- |
| Only a verified, unexpired lift-contractor licence makes a partner eligible | Matching (`LICENCE_INVALID`), invitation, order confirmation |
| Valid verified insurance | Matching (`INSURANCE_INVALID`), order confirmation |
| Partner must be `ACTIVE` with no safety block | Matching, order confirmation |
| Verified capability for the lift category and number of floors | Matching (`NO_CAPABILITY`) |
| Service area and free capacity | Matching (`OUT_OF_AREA`, `NO_CAPACITY`), order confirmation |
| Suppliers and service partners are never offered regulated installation work | Matching (`NOT_LIFT_CONTRACTOR`) |
| Licence expiry | Daily housekeeping moves the partner to `EXPIRED` and alerts staff; expiring documents appear on the dashboard 30 days ahead (configurable) |
| Documents required before work starts (default: erection permission, approved drawings) | Project cannot move to `IN_PROGRESS` until each is uploaded and verified, the site is confirmed ready and AIEC has confirmed permissions |
| Documents required before handover (default: inspection report, working licence) | Project cannot move to `HANDED_OVER` until verified and QC has passed |
| Safety incident of high or critical severity | Escalates at once, stops work on the project, notifies staff; only AIEC can lift the stop |
| Finance referral | Needs explicit consent, a lender with a signed, current agreement, and sends only approved fields; lender statuses must name their source |

The list of required documents per gate is data (`compliance_requirements`), not code, so it can be
corrected when the rules are confirmed.

## Open items for the owner

1. Confirm the exact statutory documents and their names for erection, inspection and working licence under the current rules.
2. Confirm whether the pilot referral model needs an agreement classifying AIEC as a lending service provider.
3. Confirm GST treatment and invoice format for commission.
4. Approve the privacy notice, consent wording, partner agreement and customer terms.
5. Decide data-retention periods.
