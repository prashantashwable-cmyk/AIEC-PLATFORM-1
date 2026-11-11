-- AIEC National Elevator Marketplace - core schema.
-- Conventions: UUID keys, explicit states (CHECK), numeric money in INR, UTC timestamptz.

create schema if not exists app;

create or replace function app.next_no(prefix text, seq regclass) returns text language sql as $$
  select prefix || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval(seq)::text, 5, '0')
$$;

create or replace function app.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'APPEND_ONLY: % on % is not allowed', tg_op, tg_table_name using errcode = 'P0001';
end $$;

-- ───────────────────────── Identity and tenancy ─────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  full_name text not null check (length(full_name) between 1 and 120),
  email text,
  preferred_locale text not null default 'en' check (preferred_locale in ('en','hi','mr')),
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  active_portal text,
  active_company_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_phone_idx on otp_challenges(phone, created_at desc);

create table roles (
  code text primary key,
  scope text not null check (scope in ('INTERNAL','COMPANY','CUSTOMER'))
);
create table permissions (code text primary key);
create table role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  city text not null,
  state text not null default 'Maharashtra',
  is_active boolean not null default false,
  activated_at timestamptz,
  activated_by uuid references users(id)
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(legal_name) between 2 and 200),
  trade_name text,
  category text not null check (category in ('ELEVATOR_COMPANY','MANUFACTURER','SUPPLIER','INSTALLATION_SUBCONTRACTOR','SERVICE_PROVIDER','QC_PROVIDER')),
  entity_type text not null default 'OTHER' check (entity_type in ('PROPRIETORSHIP','PARTNERSHIP','LLP','PRIVATE_LIMITED','PUBLIC_LIMITED','OTHER')),
  pan text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  address text,
  city text,
  signatory_name text,
  contact_phone text,
  contact_email text,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','VERIFIED','ACTIVE','REJECTED','SUSPENDED','EXPIRED','UNDER_RENEWAL','TERMINATED')),
  grade text not null default 'UNGRADED' check (grade in ('UNGRADED','SILVER','GOLD','PLATINUM')),
  max_concurrent_projects int not null default 1 check (max_concurrent_projects between 0 and 50),
  safety_block boolean not null default false,
  safety_block_reason text,
  agreement_signed_on date,
  agreement_reference text,
  warranty_policy text,
  safety_procedures text,
  references_note text,
  status_reason text,
  is_demo boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_status_idx on companies(status);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role_code text not null references roles(code),
  company_id uuid references companies(id) on delete cascade,
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id)
);
create unique index user_roles_active_uq on user_roles(user_id, role_code, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;
create index user_roles_company_idx on user_roles(company_id) where revoked_at is null;

create table user_zones (
  user_id uuid not null references users(id) on delete cascade,
  zone_id uuid not null references zones(id) on delete cascade,
  primary key (user_id, zone_id)
);

-- ───────────────────────── Private file storage ─────────────────────────
-- Pilot storage adapter: documents live in the database, are never public and are
-- only served through an authorised, access-logged route.
create table file_objects (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('LICENCE','INSURANCE','SURVEY','QUOTATION','CONTRACT','WORK_EVIDENCE','COLLECTION','COMPLIANCE','INCIDENT','PRODUCT','OTHER')),
  filename text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 8388608),
  sha256 text not null,
  data bytea not null,
  company_id uuid references companies(id),
  customer_id uuid,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index file_company_idx on file_objects(company_id);
create index file_customer_idx on file_objects(customer_id);

create table file_access_logs (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references file_objects(id) on delete cascade,
  user_id uuid references users(id),
  accessed_at timestamptz not null default now(),
  ip text
);

-- ───────────────────────── Partner compliance ─────────────────────────
create table company_licenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  license_type text not null check (license_type in ('LIFT_CONTRACTOR','ELECTRICAL_CONTRACTOR','OTHER')),
  license_number text not null,
  authority text not null,
  state text not null default 'Maharashtra',
  scope text,
  issue_date date not null,
  expiry_date date not null check (expiry_date > issue_date),
  file_id uuid references file_objects(id),
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','REJECTED')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index licenses_company_idx on company_licenses(company_id, expiry_date);

create table company_insurance_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  policy_type text not null check (policy_type in ('PUBLIC_LIABILITY','WORKMEN_COMPENSATION','CONTRACTOR_ALL_RISK','OTHER')),
  insurer text not null,
  policy_number text not null,
  cover_amount numeric(14,2) check (cover_amount is null or cover_amount >= 0),
  issue_date date not null,
  expiry_date date not null check (expiry_date > issue_date),
  file_id uuid references file_objects(id),
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','REJECTED')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index insurance_company_idx on company_insurance_policies(company_id, expiry_date);

create table company_verification_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  reviewer_id uuid references users(id),
  note text,
  created_at timestamptz not null default now()
);

create table partner_capabilities (
  company_id uuid not null references companies(id) on delete cascade,
  lift_category text not null check (lift_category in ('PASSENGER_RESIDENTIAL','PASSENGER_COMMERCIAL','HOME_LIFT','GOODS','HOSPITAL_BED','FIRE_SERVICE','CUSTOM')),
  max_floors int not null default 10 check (max_floors between 1 and 100),
  verified boolean not null default false,
  primary key (company_id, lift_category)
);

create table partner_service_areas (
  company_id uuid not null references companies(id) on delete cascade,
  zone_id uuid not null references zones(id) on delete cascade,
  primary key (company_id, zone_id)
);

create table partner_performance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  event_type text not null check (event_type in ('PROJECT_ON_TIME','PROJECT_DELAYED','QC_PASS','QC_FAIL','COMPLAINT','CUSTOMER_RATING','SAFETY_INCIDENT','INVITE_RESPONDED','INVITE_EXPIRED')),
  score int not null check (score between 0 and 100),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index perf_company_idx on partner_performance_events(company_id);

-- ───────────────────────── Customers and leads ─────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id),
  name text not null check (length(name) between 1 and 120),
  phone text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  email text,
  customer_type text not null check (customer_type in ('INDIVIDUAL_OWNER','BUILDER','HOUSING_SOCIETY','ARCHITECT','COMMERCIAL_OWNER')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
alter table file_objects add constraint file_customer_fk foreign key (customer_id) references customers(id);

create sequence lead_no_seq;
create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_number text not null unique default app.next_no('LD', 'lead_no_seq'),
  customer_id uuid not null references customers(id),
  project_name text not null,
  address text not null,
  zone_id uuid not null references zones(id),
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  building_type text not null check (building_type in ('RESIDENTIAL_BUNGALOW','RESIDENTIAL_APARTMENT','COMMERCIAL','HOSPITAL','INDUSTRIAL','MIXED_USE','OTHER')),
  floors int check (floors is null or floors between 1 and 100),
  lift_category text not null check (lift_category in ('PASSENGER_RESIDENTIAL','PASSENGER_COMMERCIAL','HOME_LIFT','GOODS','HOSPITAL_BED','FIRE_SERVICE','CUSTOM')),
  lift_count int not null default 1 check (lift_count between 1 and 20),
  budget_approx numeric(14,2) check (budget_approx is null or budget_approx >= 0),
  timeline text not null default 'UNDECIDED' check (timeline in ('IMMEDIATE','ONE_TO_THREE_MONTHS','THREE_TO_SIX_MONTHS','SIX_PLUS_MONTHS','UNDECIDED')),
  site_readiness text not null default 'UNKNOWN' check (site_readiness in ('NOT_STARTED','UNDER_CONSTRUCTION','SHAFT_READY','EXISTING_BUILDING','UNKNOWN')),
  finance_interest boolean not null default false,
  source text not null check (source in ('WEBSITE','CUSTOMER_APP','WHATSAPP','PHONE','BUILDER_REFERRAL','ARCHITECT_REFERRAL','SURVEYOR','DIGITAL_ADS','CUSTOMER_REFERRAL')),
  referral_note text,
  status text not null default 'NEW' check (status in ('NEW','CONTACTED','QUALIFIED','SURVEY_PENDING','SURVEY_COMPLETED','PARTNER_MATCHING','QUOTATION_PENDING','QUOTATION_RECEIVED','CUSTOMER_REVIEW','NEGOTIATION','SELECTED','ORDER_PENDING','CONFIRMED','LOST','ON_HOLD','DUPLICATE','DISQUALIFIED','CANCELLED')),
  status_before_hold text,
  needs_technical_review boolean not null default false,
  assigned_to uuid references users(id),
  response_due_at timestamptz,
  first_contacted_at timestamptz,
  q_genuine boolean not null default false,
  q_decision_maker boolean not null default false,
  q_in_service_area boolean not null default false,
  q_scope_clear boolean not null default false,
  q_survey_feasible boolean not null default false,
  q_contact_consent boolean not null default false,
  qualification_note text,
  qualified_at timestamptz,
  qualified_by uuid references users(id),
  is_demo boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_idx on leads(status);
create index leads_customer_idx on leads(customer_id);
create index leads_zone_idx on leads(zone_id);
create index leads_assigned_idx on leads(assigned_to);
create index leads_created_idx on leads(created_at desc);

create table lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references users(id),
  reason text,
  note text,
  source text not null default 'APP',
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events(lead_id, created_at);
create trigger lead_events_append_only before update or delete on lead_events for each row execute function app.forbid_change();

create table lead_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  duplicate_of_lead_id uuid not null references leads(id) on delete cascade,
  reasons text[] not null,
  score int not null,
  status text not null default 'OPEN' check (status in ('OPEN','CONFIRMED_DUPLICATE','NOT_DUPLICATE')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, duplicate_of_lead_id)
);

create table customer_consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  purpose text not null check (purpose in ('PRIVACY_NOTICE','CONTACT','FINANCE_REFERRAL')),
  notice_version text not null,
  lead_id uuid references leads(id),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text not null default 'APP'
);
create index consents_customer_idx on customer_consents(customer_id, purpose);

-- ───────────────────────── Survey and matching ─────────────────────────
create table site_surveys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  surveyor_id uuid not null references users(id),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','IN_PROGRESS','SUBMITTED','REVIEWED','REWORK_REQUIRED','CANCELLED')),
  scheduled_at timestamptz not null,
  visited_at timestamptz,
  latitude numeric(9,6), longitude numeric(9,6), accuracy_m numeric(8,1),
  floors int check (floors is null or floors between 1 and 100),
  stops int check (stops is null or stops between 2 and 100),
  shaft_width_mm int check (shaft_width_mm is null or shaft_width_mm between 300 and 10000),
  shaft_depth_mm int check (shaft_depth_mm is null or shaft_depth_mm between 300 and 10000),
  pit_depth_mm int check (pit_depth_mm is null or pit_depth_mm between 0 and 10000),
  overhead_mm int check (overhead_mm is null or overhead_mm between 0 and 20000),
  landing_details text,
  machine_room boolean,
  machine_room_notes text,
  power_supply text,
  civil_readiness text,
  access_notes text,
  drawings_ref text,
  customer_ack_name text,
  customer_ack_at timestamptz,
  notes text,
  submitted_at timestamptz,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  scheduled_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index surveys_lead_idx on site_surveys(lead_id);
create index surveys_surveyor_idx on site_surveys(surveyor_id, status);

create table survey_evidence (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references site_surveys(id) on delete cascade,
  file_id uuid not null references file_objects(id),
  caption text,
  captured_at_device timestamptz,
  received_at timestamptz not null default now()
);

create table matching_rule_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  w_compliance int not null, w_capability int not null, w_capacity int not null,
  w_performance int not null, w_price int not null, w_response int not null,
  is_active boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (w_compliance + w_capability + w_capacity + w_performance + w_price + w_response = 100)
);
create unique index matching_rule_active_uq on matching_rule_versions(is_active) where is_active;

create table partner_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  company_id uuid not null references companies(id),
  rule_version_id uuid not null references matching_rule_versions(id),
  eligible boolean not null,
  ineligibility_reasons text[] not null default '{}',
  score numeric(5,2),
  s_compliance numeric(5,2), s_capability numeric(5,2), s_capacity numeric(5,2),
  s_performance numeric(5,2), s_price numeric(5,2), s_response numeric(5,2),
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED','INVITED','ACCEPTED','DECLINED','EXPIRED')),
  invited_at timestamptz,
  invited_by uuid references users(id),
  respond_due_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  unique (lead_id, company_id),
  check (eligible or status = 'SUGGESTED')
);
create index matches_company_idx on partner_matches(company_id, status);

-- ───────────────────────── Quotations ─────────────────────────
create sequence quotation_no_seq;
create table quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique default app.next_no('QT', 'quotation_no_seq'),
  lead_id uuid not null references leads(id) on delete cascade,
  company_id uuid not null references companies(id),
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','REVISION_REQUESTED','CLARIFICATION_REQUESTED','SELECTED','NOT_SELECTED','WITHDRAWN','EXPIRED')),
  current_version_id uuid,
  released_to_customer_at timestamptz,
  customer_request_note text,
  partner_response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, company_id)
);
create index quotations_company_idx on quotations(company_id, status);

create table quotation_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  version_no int not null,
  manufacturer text, model text,
  capacity_kg int check (capacity_kg is null or capacity_kg between 50 and 20000),
  persons int check (persons is null or persons between 1 and 200),
  speed_mps numeric(4,2) check (speed_mps is null or speed_mps between 0.1 and 20),
  floors int check (floors is null or floors between 1 and 100),
  stops int check (stops is null or stops between 2 and 100),
  door_type text, controller text, drive text, safety_features text,
  supply_scope text, installation_scope text, civil_electrical_inclusions text, exclusions text,
  base_amount numeric(14,2) check (base_amount is null or base_amount >= 0),
  freight_amount numeric(14,2) not null default 0 check (freight_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) generated always as (coalesce(base_amount, 0) + freight_amount + tax_amount) stored,
  warranty_months int check (warranty_months is null or warranty_months between 0 and 240),
  amc_terms text,
  delivery_weeks int check (delivery_weeks is null or delivery_weeks between 0 and 200),
  installation_weeks int check (installation_weeks is null or installation_weeks between 0 and 200),
  validity_date date,
  assumptions text,
  approvals_dependencies text,
  original_file_id uuid references file_objects(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (quotation_id, version_no)
);
alter table quotations add constraint quotations_current_version_fk foreign key (current_version_id) references quotation_versions(id);

-- Submitted quotation versions are immutable (spec 5.7).
create or replace function app.quotation_version_guard() returns trigger language plpgsql as $$
begin
  if old.submitted_at is not null then
    raise exception 'QUOTATION_LOCKED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger quotation_versions_immutable before update or delete on quotation_versions for each row execute function app.quotation_version_guard();

create table quotation_milestones (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references quotation_versions(id) on delete cascade,
  seq int not null,
  name text not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  unique (version_id, seq)
);

create table customer_partner_selections (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  customer_id uuid not null references customers(id),
  action text not null check (action in ('SELECT','NEGOTIATE','CLARIFY','REQUEST_ANOTHER','REJECT_ALL','HOLD')),
  quotation_id uuid references quotations(id),
  quotation_version_id uuid references quotation_versions(id),
  note text,
  actor_id uuid references users(id),
  created_at timestamptz not null default now(),
  check (action not in ('SELECT','NEGOTIATE','CLARIFY') or (quotation_id is not null and quotation_version_id is not null))
);
create trigger selections_append_only before update or delete on customer_partner_selections for each row execute function app.forbid_change();

-- ───────────────────────── Orders ─────────────────────────
create table commission_policies (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  rate_percent numeric(7,4) not null check (rate_percent >= 0 and rate_percent <= 100),
  description text not null,
  effective_from date not null,
  is_active boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index commission_policy_active_uq on commission_policies(is_active) where is_active;

create sequence order_no_seq;
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default app.next_no('OR', 'order_no_seq'),
  lead_id uuid not null references leads(id),
  quotation_id uuid not null references quotations(id),
  quotation_version_id uuid not null references quotation_versions(id),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  status text not null default 'PENDING_PARTNER_ACCEPTANCE' check (status in ('PENDING_PARTNER_ACCEPTANCE','PARTNER_ACCEPTED','PARTNER_DECLINED','CONFIRMED','ON_HOLD','COMPLETED','CANCELLED')),
  currency text not null default 'INR' check (currency = 'INR'),
  gross_order_value numeric(14,2) not null check (gross_order_value >= 0),
  eligible_value numeric(14,2) check (eligible_value is null or (eligible_value >= 0 and eligible_value <= gross_order_value)),
  exclusions_note text,
  commission_policy_id uuid references commission_policies(id),
  commission_rate_percent numeric(7,4),
  contract_reference text,
  contract_accepted_on date,
  contract_file_id uuid references file_objects(id),
  approval_path_note text,
  supervisor_user_id uuid references users(id),
  partner_responded_at timestamptz,
  partner_responded_by uuid references users(id),
  partner_decline_reason text,
  confirmed_at timestamptz,
  confirmed_by uuid references users(id),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index orders_live_lead_uq on orders(lead_id) where status not in ('PARTNER_DECLINED','CANCELLED');
create index orders_company_idx on orders(company_id, status);
create index orders_customer_idx on orders(customer_id);

create table order_state_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);
create trigger order_events_append_only before update or delete on order_state_events for each row execute function app.forbid_change();

-- ───────────────────────── Execution ─────────────────────────
create sequence project_no_seq;
create table projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique default app.next_no('PR', 'project_no_seq'),
  order_id uuid not null unique references orders(id),
  lead_id uuid not null references leads(id),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  status text not null default 'PLANNING' check (status in ('PLANNING','IN_PROGRESS','ON_HOLD','STOP_WORK','QC','HANDOVER_PENDING','HANDED_OVER','CLOSED','CANCELLED')),
  status_before_hold text,
  supervisor_user_id uuid references users(id),
  site_ready boolean not null default false,
  permissions_confirmed boolean not null default false,
  planned_start date,
  planned_end date,
  started_at timestamptz,
  handed_over_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_company_idx on projects(company_id, status);
create index projects_customer_idx on projects(customer_id);
create index projects_status_idx on projects(status);

create table project_state_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references users(id),
  reason text,
  created_at timestamptz not null default now()
);
create trigger project_events_append_only before update or delete on project_state_events for each row execute function app.forbid_change();

create table project_team_assignments (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id),
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  seq int not null,
  name text not null,
  percent numeric(5,2) not null,
  amount_due numeric(14,2) not null check (amount_due >= 0),
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED')),
  due_date date,
  completed_at timestamptz,
  note text,
  unique (project_id, seq)
);

create table project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  title text not null check (length(title) between 1 and 200),
  description text,
  assigned_to uuid references users(id),
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE_PENDING_REVIEW','APPROVED','REWORK')),
  safety_critical boolean not null default false,
  due_date date,
  progress_note text,
  completed_at_device timestamptz,
  completed_received_at timestamptz,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index tasks_project_idx on project_tasks(project_id);
create index tasks_assignee_idx on project_tasks(assigned_to, status);

-- Offline sync idempotency: one row per client-generated event id.
create table client_events (
  client_event_id uuid primary key,
  user_id uuid not null references users(id),
  event_type text not null,
  captured_at_device timestamptz not null,
  received_at timestamptz not null default now()
);

create table technician_attendance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  user_id uuid not null references users(id),
  kind text not null default 'CHECK_IN' check (kind in ('CHECK_IN','CHECK_OUT')),
  latitude numeric(9,6), longitude numeric(9,6), accuracy_m numeric(8,1),
  captured_at_device timestamptz not null,
  received_at timestamptz not null default now(),
  client_event_id uuid unique
);
create index attendance_project_idx on technician_attendance(project_id, captured_at_device desc);

create table safety_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  user_id uuid not null references users(id),
  ppe_ok boolean not null, barricade_ok boolean not null, power_isolated_ok boolean not null,
  tools_ok boolean not null, pit_shaft_safe_ok boolean not null,
  all_ok boolean generated always as (ppe_ok and barricade_ok and power_isolated_ok and tools_ok and pit_shaft_safe_ok) stored,
  notes text,
  captured_at_device timestamptz not null,
  received_at timestamptz not null default now(),
  client_event_id uuid unique
);

create table work_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  task_id uuid references project_tasks(id) on delete set null,
  milestone_id uuid references project_milestones(id) on delete set null,
  file_id uuid not null references file_objects(id),
  caption text,
  uploaded_by uuid references users(id),
  captured_at_device timestamptz,
  received_at timestamptz not null default now(),
  client_event_id uuid unique
);
create index work_evidence_project_idx on work_evidence(project_id);

create table material_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  supplier_company_id uuid references companies(id),
  description text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null default 'nos',
  status text not null default 'PLANNED' check (status in ('PLANNED','ORDERED','DISPATCHED','DELIVERED')),
  expected_date date,
  delivered_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index material_project_idx on material_orders(project_id);
create index material_supplier_idx on material_orders(supplier_company_id);

create table material_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  task_id uuid references project_tasks(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null default 'nos',
  user_id uuid not null references users(id),
  captured_at_device timestamptz not null,
  received_at timestamptz not null default now(),
  client_event_id uuid unique
);

create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  model text,
  category text not null,
  specification text,
  document_file_id uuid references file_objects(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Collections and commission ─────────────────────────
create table partner_collections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  project_id uuid not null references projects(id),
  milestone_id uuid references project_milestones(id),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  currency text not null default 'INR' check (currency = 'INR'),
  amount_received numeric(14,2) not null check (amount_received > 0),
  excluded_amount numeric(14,2) not null default 0 check (excluded_amount >= 0),
  eligible_amount numeric(14,2) generated always as (amount_received - excluded_amount) stored,
  exclusion_note text,
  refunded_amount numeric(14,2) not null default 0 check (refunded_amount >= 0),
  collection_date date not null,
  payment_mode text not null check (payment_mode in ('BANK_TRANSFER','UPI','CHEQUE','DEMAND_DRAFT','CASH','LOAN_DISBURSEMENT','OTHER')),
  bank_reference text,
  partner_receipt_no text,
  customer_confirmed_at timestamptz,
  status text not null default 'PENDING_EVIDENCE' check (status in ('PENDING_EVIDENCE','SUBMITTED','UNDER_REVIEW','VERIFIED','REJECTED','DISPUTED','REFUNDED')),
  submitted_by uuid references users(id),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  verification_basis text check (verification_basis is null or verification_basis in ('BANK_REFERENCE','RECEIPT_AND_CUSTOMER_CONFIRMATION','BANK_WEBHOOK')),
  created_at timestamptz not null default now(),
  check (excluded_amount <= amount_received),
  check (refunded_amount <= amount_received)
);
create unique index collections_bank_ref_uq on partner_collections(company_id, bank_reference) where bank_reference is not null and status <> 'REJECTED';
create index collections_order_idx on partner_collections(order_id);
create index collections_status_idx on partner_collections(status);

create table collection_evidence (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references partner_collections(id) on delete cascade,
  file_id uuid not null references file_objects(id),
  kind text not null check (kind in ('BANK_PROOF','PARTNER_RECEIPT','SCREENSHOT','OTHER')),
  created_at timestamptz not null default now()
);

create sequence invoice_no_seq;
create table commission_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default app.next_no('INV', 'invoice_no_seq'),
  company_id uuid not null references companies(id),
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal numeric(14,2) not null,
  gst_rate_percent numeric(5,2) not null,
  gst_amount numeric(14,2) not null,
  total numeric(14,2) not null,
  status text not null default 'ISSUED' check (status in ('ISSUED','PAID','CANCELLED')),
  issued_at timestamptz not null default now(),
  due_date date not null,
  paid_at timestamptz,
  issued_by uuid references users(id)
);
create index invoices_company_idx on commission_invoices(company_id, status);

create sequence ledger_no_seq;
create table commission_ledger (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null unique default app.next_no('CL', 'ledger_no_seq'),
  entry_type text not null check (entry_type in ('COMMISSION','ADJUSTMENT','REFUND_REVERSAL')),
  order_id uuid not null references orders(id),
  company_id uuid not null references companies(id),
  collection_id uuid references partner_collections(id),
  related_entry_id uuid references commission_ledger(id),
  currency text not null default 'INR' check (currency = 'INR'),
  eligible_amount numeric(14,2) not null,
  rate_percent numeric(7,4) not null,
  policy_id uuid references commission_policies(id),
  amount numeric(14,2) not null,
  status text not null default 'VERIFIED' check (status in ('VERIFIED','INVOICED','PAID','DISPUTED')),
  invoice_id uuid references commission_invoices(id),
  reason text,
  idempotency_key text unique,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (entry_type = 'COMMISSION' or reason is not null)
);
-- A verified collection can generate commission exactly once.
create unique index ledger_collection_commission_uq on commission_ledger(collection_id) where entry_type = 'COMMISSION';
create index ledger_company_idx on commission_ledger(company_id, status);

-- Ledger rows are append-only: only status / invoice linkage may move forward, never amounts.
create or replace function app.ledger_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'LEDGER_LOCKED' using errcode = 'P0001'; end if;
  if old.status = 'PAID' then raise exception 'LEDGER_LOCKED' using errcode = 'P0001'; end if;
  if (new.amount, new.rate_percent, new.eligible_amount, new.order_id, new.company_id, new.entry_type, new.created_at)
     is distinct from (old.amount, old.rate_percent, old.eligible_amount, old.order_id, old.company_id, old.entry_type, old.created_at)
     or new.collection_id is distinct from old.collection_id then
    raise exception 'LEDGER_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ledger_guard before update or delete on commission_ledger for each row execute function app.ledger_guard();

create table commission_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references commission_invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  reference text not null unique,
  recorded_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Finance referral (kept separate from marketplace data) ─────────────────────────
create table lender_partners (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  lender_type text not null check (lender_type in ('BANK','NBFC','HFC','OTHER')),
  regulatory_reference text,
  contact_name text, contact_phone text, contact_email text,
  product_category text,
  agreement_status text not null default 'NONE' check (agreement_status in ('NONE','IN_NEGOTIATION','SIGNED','EXPIRED')),
  agreement_start date, agreement_end date,
  approved_fields text[] not null default '{}',
  referral_channel text,
  fee_model text,
  grievance_route text,
  integration_status text not null default 'SANDBOX' check (integration_status in ('SANDBOX','MANUAL','LIVE')),
  compliance_review_date date,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create sequence referral_no_seq;
create table finance_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_number text not null unique default app.next_no('FR', 'referral_no_seq'),
  customer_id uuid not null references customers(id),
  lead_id uuid not null references leads(id),
  lender_id uuid references lender_partners(id),
  consent_id uuid references customer_consents(id),
  approx_amount numeric(14,2) check (approx_amount is null or approx_amount > 0),
  contact_preference text not null default 'PHONE' check (contact_preference in ('PHONE','WHATSAPP','EMAIL')),
  status text not null default 'CONSENT_PENDING' check (status in ('CONSENT_PENDING','CONSENTED','READY_TO_REFER','REFERRED','LENDER_CONTACTED','APPLICATION_IN_PROGRESS','APPROVED','REJECTED','WITHDRAWN','EXPIRED')),
  referred_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('CONSENT_PENDING','WITHDRAWN','EXPIRED') or consent_id is not null)
);
create index referrals_customer_idx on finance_referrals(customer_id);

create table finance_referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references finance_referrals(id) on delete cascade,
  from_status text,
  to_status text not null,
  status_source text check (status_source is null or status_source in ('LENDER','CUSTOMER')),
  actor_id uuid references users(id),
  note text,
  created_at timestamptz not null default now()
);
create trigger referral_events_append_only before update or delete on finance_referral_events for each row execute function app.forbid_change();

create table finance_handoffs (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references finance_referrals(id) on delete cascade,
  lender_id uuid not null references lender_partners(id),
  mode text not null check (mode in ('SANDBOX','MANUAL','LIVE')),
  channel text,
  fields_sent text[] not null,
  payload jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Compliance ─────────────────────────
create table regulatory_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authority text,
  section_rule text,
  publication_date date,
  effective_date date,
  geography text,
  applicability text,
  legal_reviewer text,
  last_verified_on date,
  next_review_on date,
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED','VERIFIED')),
  created_at timestamptz not null default now(),
  check (verification_status = 'UNVERIFIED' or (legal_reviewer is not null and last_verified_on is not null))
);

create table compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  gate text not null check (gate in ('PROJECT_START','HANDOVER')),
  doc_type text not null,
  state text not null default 'Maharashtra',
  is_active boolean not null default true,
  source_id uuid references regulatory_sources(id),
  note text,
  unique (gate, doc_type, state)
);

create table compliance_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('ERECTION_PERMISSION','APPROVED_DRAWINGS','INSPECTION_REPORT','WORKING_LICENCE','MAINTENANCE_RECORD','SAFETY_AUDIT','INCIDENT_REPORT','PRODUCT_CERTIFICATE','WARRANTY_RECORD','STATE_SPECIFIC')),
  authority text,
  reference_number text,
  issue_date date,
  expiry_date date,
  state text not null default 'Maharashtra',
  company_id uuid not null references companies(id),
  project_id uuid references projects(id) on delete cascade,
  customer_id uuid references customers(id),
  file_id uuid references file_objects(id),
  verification_status text not null default 'PENDING' check (verification_status in ('PENDING','VERIFIED','REJECTED')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index compliance_project_idx on compliance_documents(project_id);

-- ───────────────────────── Quality, incidents, service ─────────────────────────
create table qc_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  inspector_id uuid not null references users(id),
  inspected_on date not null,
  result text not null check (result in ('PASS','FAIL','CONDITIONAL')),
  notes text,
  -- Internal AIEC QC is never a statutory inspection (spec 9.3).
  is_statutory boolean not null default false check (is_statutory = false),
  created_at timestamptz not null default now()
);

create table qc_defects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  inspection_id uuid references qc_inspections(id) on delete set null,
  description text not null,
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','CORRECTIVE_ACTION','RESOLVED','CLOSED')),
  reported_by uuid references users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index defects_project_idx on qc_defects(project_id, status);

create sequence incident_no_seq;
create table safety_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number text not null unique default app.next_no('INC', 'incident_no_seq'),
  project_id uuid references projects(id),
  company_id uuid references companies(id),
  customer_id uuid references customers(id),
  reported_by uuid references users(id),
  occurred_at timestamptz not null,
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  description text not null,
  immediate_action text,
  affected_person_note text,
  authority_notified boolean not null default false,
  insurer_notified boolean not null default false,
  status text not null default 'REPORTED' check (status in ('REPORTED','TRIAGED','EMERGENCY_ESCALATION','INVESTIGATION','CORRECTIVE_ACTION','REVIEWED','CLOSED')),
  findings text,
  closed_by uuid references users(id),
  closed_at timestamptz,
  client_event_id uuid unique,
  created_at timestamptz not null default now()
);
create trigger incidents_no_delete before delete on safety_incidents for each row execute function app.forbid_change();
-- The original report is immutable; corrections are appended as incident_events.
create or replace function app.incident_guard() returns trigger language plpgsql as $$
begin
  if (new.description, new.occurred_at, new.reported_by, new.incident_number, new.created_at)
     is distinct from (old.description, old.occurred_at, old.reported_by, old.incident_number, old.created_at) then
    raise exception 'INCIDENT_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger incidents_guard before update on safety_incidents for each row execute function app.incident_guard();

create table incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references safety_incidents(id),
  kind text not null check (kind in ('STATUS','CORRECTION','NOTE')),
  from_status text,
  to_status text,
  note text,
  actor_id uuid references users(id),
  created_at timestamptz not null default now()
);
create trigger incident_events_append_only before update or delete on incident_events for each row execute function app.forbid_change();

create table corrective_actions (
  id uuid primary key default gen_random_uuid(),
  defect_id uuid references qc_defects(id) on delete cascade,
  incident_id uuid references safety_incidents(id),
  company_id uuid references companies(id),
  description text not null,
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','VERIFIED')),
  completed_at timestamptz,
  verified_by uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (defect_id is not null or incident_id is not null)
);

create table warranties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  starts_on date not null,
  ends_on date not null,
  terms text,
  created_at timestamptz not null default now()
);

create table amc_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  visits_per_year int not null default 4 check (visits_per_year between 1 and 52),
  terms text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','EXPIRED','CANCELLED')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create sequence ticket_no_seq;
create table service_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default app.next_no('ST', 'ticket_no_seq'),
  customer_id uuid not null references customers(id),
  project_id uuid references projects(id),
  company_id uuid references companies(id),
  kind text not null check (kind in ('BREAKDOWN','MAINTENANCE','WARRANTY_CLAIM','COMPLAINT')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL','EMERGENCY')),
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED')),
  ack_due_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_customer_idx on service_tickets(customer_id);
create index tickets_company_idx on service_tickets(company_id, status);

create table maintenance_visits (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references service_tickets(id) on delete cascade,
  amc_id uuid references amc_contracts(id) on delete cascade,
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  visited_on date not null,
  notes text not null,
  recorded_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (ticket_id is not null or amc_id is not null)
);

create sequence dispute_no_seq;
create table disputes (
  id uuid primary key default gen_random_uuid(),
  dispute_number text not null unique default app.next_no('DS', 'dispute_no_seq'),
  kind text not null check (kind in ('PAYMENT','COMMISSION','QUALITY','SERVICE','OTHER')),
  order_id uuid references orders(id),
  collection_id uuid references partner_collections(id),
  company_id uuid references companies(id),
  customer_id uuid references customers(id),
  raised_by uuid references users(id),
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Governance ─────────────────────────
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  params jsonb not null default '{}',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);

-- Sandbox log of WhatsApp / SMS messages that WOULD be sent once a provider is connected.
create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('SMS','WHATSAPP')),
  to_phone text not null,
  template text not null,
  params jsonb not null default '{}',
  status text not null default 'SANDBOX_NOT_SENT' check (status in ('SANDBOX_NOT_SENT','SENT','FAILED')),
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  actor_roles text[] not null default '{}',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  company_id uuid,
  details jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);
create index audit_created_idx on audit_logs(created_at desc);
create index audit_entity_idx on audit_logs(entity_type, entity_id);
create trigger audit_append_only before update or delete on audit_logs for each row execute function app.forbid_change();

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  result text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table system_settings (
  key text primary key,
  value text not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
