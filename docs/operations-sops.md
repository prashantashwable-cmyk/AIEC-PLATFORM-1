# Operating procedures (draft)

Working procedures for running the pilot with this application. They are drafts for the owner to
approve; targets are operational, not statutory limits. Screen names refer to the admin web.

## Daily (operations manager)

1. **Run housekeeping** if the scheduler is not connected: `POST /api/jobs/housekeeping` with the application secret. Review `/admin/notifications` for new alerts.
2. **Dashboard** (`/admin`): clear the red items first — emergency incidents, expired licences, overdue commission, overdue complaints.
3. **New leads** (`/admin/leads`): respond within 4 working hours. Mark contacted, qualify, schedule the survey. Review duplicate candidates; decide each as duplicate or not.
4. **Surveys**: review submitted surveys (approve or return for rework) within the working day.
5. **Quotations**: for each lead with accepted invitations, check that quotations arrive within 3 working days; chase partners flagged overdue.

## Lead to order

1. Qualify only when the requirement is genuine, the decision maker is known, the scope is clear, a survey is feasible and contact consent is recorded.
2. After an approved survey run matching. Invite two or three eligible partners; never invite a partner the gates reject. Explain the ranking to the customer as advisory.
3. Release quotations to the customer only when at least one is complete. The customer chooses; staff never select for them.
4. After selection, make sure the partner accepts and names a supervisor, the contract reference and date are recorded, the eligible value and approval path note are filled, and the checklist is fully green. Confirm only then; confirmation fails by design if the pilot is full (the order stays queued).

## Project control

1. Before start: required documents uploaded and approved by QC, site ready, permissions confirmed by AIEC. Confirmation of an order is not a statutory permission.
2. Review overdue milestones and delayed projects weekly with each partner supervisor.
3. A stop-work order can be lifted only by AIEC staff after the corrective action is verified.
4. Before handover: QC passed, handover documents verified. The warranty record is created automatically at handover from the warranty period in the selected quotation.

## Collections and commission (finance coordinator)

1. Each partner collection needs evidence (bank proof, receipt or screenshot) and a bank reference.
2. Reconcile against the bank statement. Verify, reject (with reason) or dispute. Verify only what you can match.
3. Verified collections create commission automatically at the policy rate on the eligible part. Never edit the ledger; use an adjustment with a written reason (super admin).
4. Issue invoices per partner after each reconciliation batch. Chase invoices flagged overdue. Record payments with the bank reference.
5. Refunds: record the refund on the collection; the reversal entry is created in proportion.

## Finance referral

1. Offer only to customers who asked. Consent must be explicit and recorded; never pre-ticked.
2. Move a referral to ready only when consent is on record and not withdrawn.
3. Hand off only to a lender with a signed, current agreement; only the approved fields are sent. The sandbox lender sends nothing.
4. Record lender statuses only when the lender or the customer reports them, naming the source. Never mark approval on your own judgement.
5. If the customer withdraws, stop immediately; the withdrawal is recorded.

## Partner onboarding and monitoring

1. Check every licence and insurance policy with the issuing authority before approving it in `/admin/partners`. Approving is a verification statement.
2. Verify each capability (lift type, maximum floors) from evidence, not from the partner's claim.
3. Activate a partner only after the signed agreement date is recorded.
4. Act on licence and insurance expiry alerts: ask for renewal; an expired mandatory licence blocks new regulated work automatically.
5. Use the safety block for any partner under safety review.

## Incidents and complaints

1. Any person can report an incident; high and critical reports escalate at once and stop work. Call the partner supervisor immediately; the system alert is not a substitute.
2. Record cause, corrective actions and verification in `/admin/incidents`. Statutory reporting duties are handled outside the application and recorded as notes.
3. Complaints: acknowledge within 1 working day; assign; resolve; record visits.

## Weekly and monthly

- Weekly: capacity review (five-project limit and each partner's), delayed projects, defects, unanswered invitations.
- Monthly: reports (conversion, response time, collections, commission earned / invoiced / collected, break-even), review of regulatory sources in `/admin/compliance`, user and permission review in `/admin/users`, audit log sample check, database backup restore test.

## Data requests

When a customer asks for access, correction, deletion or withdrawal of contact consent, the request appears in notifications. Act within the period set by the privacy policy (*to be confirmed with counsel*) and note the outcome.

## Before go-live

Use the checklist in the README ("Before going live") and specification section 23.
