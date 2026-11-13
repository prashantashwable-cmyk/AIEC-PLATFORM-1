-- Scheduled reminders (spec 13).
-- reminder_log makes every alert fire exactly once per (kind, record, bucket), however often the
-- housekeeping job runs. It is written only by the trusted system path; tenant roles cannot read it.
create table reminder_log (
  kind text not null,
  entity_id uuid not null,
  bucket text not null default '',
  created_at timestamptz not null default now(),
  primary key (kind, entity_id, bucket)
);
alter table reminder_log enable row level security;

-- When a partner accepts an invitation the quotation gets a due time (setting sla_quotation_days).
alter table quotations add column due_at timestamptz;
create index quotations_due_idx on quotations(due_at) where status = 'DRAFT';
