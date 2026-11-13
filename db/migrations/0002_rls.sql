-- Row-level security: database-enforced tenant isolation (defence in depth).
-- The application runs every user request inside a transaction that does
--   SET LOCAL ROLE aiec_app  +  set_config('app.*', ..., true)
-- with values derived from the server-side session, never from client input.
-- Trusted server jobs (login, public enquiry intake, webhooks) run as the owner role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'aiec_app') then
    create role aiec_app nologin;
  end if;
  execute format('grant aiec_app to %I', current_user);
end $$;

create or replace function app.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create or replace function app.company_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.company_id', true), '')::uuid $$;
create or replace function app.customer_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.customer_id', true), '')::uuid $$;
create or replace function app.is_internal() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.is_internal', true), '') = 'true' $$;
create or replace function app.is_technician() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.is_technician', true), '') = 'true' $$;
create or replace function app.can_finance() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.can_finance', true), '') = 'true' $$;

grant usage on schema public, app to aiec_app;
grant select, insert, update, delete on all tables in schema public to aiec_app;
grant usage, select on all sequences in schema public to aiec_app;
grant execute on all functions in schema app to aiec_app;

-- app.protect(table, write_expr, read_expr): rows are writable when write_expr holds and
-- readable when write_expr OR read_expr holds. NULL write_expr = no access for app users.
create or replace function app.protect(tbl text, write_expr text, read_expr text default null) returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format('drop policy if exists p_write on %I', tbl);
  execute format('drop policy if exists p_read on %I', tbl);
  if write_expr is not null then
    execute format('create policy p_write on %I for all to aiec_app using (%s) with check (%s)', tbl, write_expr, write_expr);
  end if;
  if read_expr is not null then
    execute format('create policy p_read on %I for select to aiec_app using (%s)', tbl, read_expr);
  end if;
end $$;

-- app.insert_only(table, read_expr): anyone may append, only read_expr may read.
create or replace function app.insert_only(tbl text, read_expr text) returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format('drop policy if exists p_insert on %I', tbl);
  execute format('drop policy if exists p_read on %I', tbl);
  execute format('create policy p_insert on %I for insert to aiec_app with check (true)', tbl);
  execute format('create policy p_read on %I for select to aiec_app using (%s)', tbl, read_expr);
end $$;

do $$
declare
  i text := 'app.is_internal()';
  c text := 'company_id = app.company_id()';
  cnt text := '(company_id = app.company_id() and not app.is_technician())';
  u text := 'customer_id = app.customer_id()';
begin
  -- system-only tables
  perform app.protect('sessions', null);
  perform app.protect('otp_challenges', null);
  perform app.protect('webhook_events', null);

  -- reference / configuration: readable by all signed-in users, writable by AIEC staff
  perform app.protect('zones', i, 'true');
  perform app.protect('roles', i, 'true');
  perform app.protect('permissions', i, 'true');
  perform app.protect('role_permissions', i, 'true');
  perform app.protect('user_zones', i, 'user_id = app.uid()');
  perform app.protect('matching_rule_versions', i, 'true');
  perform app.protect('commission_policies', i, 'true');
  perform app.protect('regulatory_sources', i, 'true');
  perform app.protect('compliance_requirements', i, 'true');
  perform app.protect('system_settings', i, 'true');

  perform app.protect('user_roles',
    i || ' or (' || cnt || ' and role_code in (''PARTNER_SUPERVISOR'',''TECHNICIAN''))',
    'user_id = app.uid() or ' || cnt);

  perform app.protect('companies', i || ' or (id = app.company_id() and not app.is_technician())',
    'id = app.company_id() or (category in (''MANUFACTURER'',''SUPPLIER'') and status = ''ACTIVE'')'
    || ' or exists (select 1 from quotations q where q.company_id = companies.id)'
    || ' or exists (select 1 from service_tickets s where s.company_id = companies.id)');
  perform app.protect('company_licenses', i || ' or ' || cnt,
    'app.customer_id() is not null and exists (select 1 from quotations q where q.company_id = company_licenses.company_id)');
  perform app.protect('company_insurance_policies', i || ' or ' || cnt,
    'app.customer_id() is not null and exists (select 1 from quotations q where q.company_id = company_insurance_policies.company_id)');
  perform app.protect('company_verification_reviews', i || ' or (' || cnt || ' and to_status = ''SUBMITTED'')', cnt);
  perform app.protect('partner_capabilities', i || ' or ' || cnt, 'true');
  perform app.protect('partner_service_areas', i || ' or ' || cnt, 'true');
  perform app.protect('partner_performance_events', i, cnt);
  perform app.protect('products', i || ' or ' || cnt, 'is_active');

  perform app.protect('customers', i || ' or id = app.customer_id()',
    'exists (select 1 from leads l where l.customer_id = customers.id)'
    || ' or exists (select 1 from projects p where p.customer_id = customers.id)');
  perform app.protect('customer_consents', i || ' or ' || u);
  perform app.protect('leads',
    i || ' or ' || u
    || ' or (app.company_id() is not null and not app.is_technician() and exists (select 1 from partner_matches m'
    || '      where m.lead_id = leads.id and m.company_id = app.company_id() and m.status in (''INVITED'',''ACCEPTED'')))',
    'exists (select 1 from projects p where p.lead_id = leads.id)');
  perform app.protect('lead_events', 'exists (select 1 from leads l where l.id = lead_events.lead_id)');
  perform app.protect('lead_duplicate_candidates', i);
  perform app.protect('site_surveys', 'exists (select 1 from leads l where l.id = site_surveys.lead_id)');
  perform app.protect('survey_evidence', 'exists (select 1 from site_surveys s where s.id = survey_evidence.survey_id)');
  perform app.protect('partner_matches', i || ' or ' || cnt);

  perform app.protect('quotations',
    i || ' or ' || cnt
    || ' or (released_to_customer_at is not null and exists (select 1 from leads l where l.id = quotations.lead_id and l.customer_id = app.customer_id()))');
  perform app.protect('quotation_versions',
    'exists (select 1 from quotations q where q.id = quotation_versions.quotation_id)'
    || ' and (submitted_at is not null or app.is_internal() or app.company_id() is not null)');
  perform app.protect('quotation_milestones', 'exists (select 1 from quotation_versions v where v.id = quotation_milestones.version_id)');
  perform app.protect('customer_partner_selections', i || ' or ' || u,
    'exists (select 1 from quotations q where q.id = customer_partner_selections.quotation_id)');

  perform app.protect('orders', i || ' or ' || u || ' or ' || cnt);
  perform app.protect('order_state_events', 'exists (select 1 from orders o where o.id = order_state_events.order_id)');
  perform app.protect('projects',
    i || ' or ' || u || ' or (' || c || ' and (not app.is_technician() or exists (select 1 from project_team_assignments a'
    || ' where a.project_id = projects.id and a.user_id = app.uid())))');
  perform app.protect('project_state_events', 'exists (select 1 from projects p where p.id = project_state_events.project_id)');
  perform app.protect('project_team_assignments', i || ' or ' || cnt, 'user_id = app.uid()');
  perform app.protect('project_milestones', i || ' or ' || cnt,
    'exists (select 1 from projects p where p.id = project_milestones.project_id and p.customer_id = app.customer_id())');
  perform app.protect('project_tasks', i || ' or (' || c || ' and (not app.is_technician() or assigned_to = app.uid()))');
  perform app.protect('client_events', 'user_id = app.uid()', i);
  perform app.protect('technician_attendance', i || ' or (' || c || ' and (not app.is_technician() or user_id = app.uid()))');
  perform app.protect('safety_checklists', i || ' or (' || c || ' and (not app.is_technician() or user_id = app.uid()))');
  perform app.protect('material_usage', i || ' or (' || c || ' and (not app.is_technician() or user_id = app.uid()))');
  perform app.protect('work_evidence', i || ' or (' || c || ' and (not app.is_technician() or uploaded_by = app.uid()))',
    'exists (select 1 from projects p where p.id = work_evidence.project_id and p.customer_id = app.customer_id())');
  perform app.protect('material_orders', i || ' or ' || cnt || ' or supplier_company_id = app.company_id()');

  -- money: partners can submit collection evidence; only AIEC staff can write the ledger
  perform app.protect('partner_collections', i || ' or ' || u || ' or ' || cnt);
  perform app.protect('collection_evidence', 'exists (select 1 from partner_collections pc where pc.id = collection_evidence.collection_id)');
  perform app.protect('commission_ledger', i, cnt);
  perform app.protect('commission_invoices', i, cnt);
  perform app.protect('commission_payments', i, 'exists (select 1 from commission_invoices ci where ci.id = commission_payments.invoice_id)');

  -- finance referral data: only authorised finance roles and the customer concerned
  perform app.protect('finance_referrals', 'app.can_finance() or ' || u);
  perform app.protect('finance_referral_events', 'exists (select 1 from finance_referrals r where r.id = finance_referral_events.referral_id)');
  perform app.protect('finance_handoffs', 'app.can_finance()');
  perform app.protect('lender_partners', 'app.can_finance()',
    'exists (select 1 from finance_referrals r where r.lender_id = lender_partners.id)');

  perform app.protect('compliance_documents', i || ' or ' || cnt, u);
  perform app.protect('qc_inspections', i, u || ' or ' || cnt);
  perform app.protect('qc_defects', i || ' or ' || cnt, u);
  perform app.protect('safety_incidents', i || ' or ' || c || ' or ' || u || ' or reported_by = app.uid()');
  perform app.protect('incident_events', 'exists (select 1 from safety_incidents s where s.id = incident_events.incident_id)');
  perform app.protect('corrective_actions', i || ' or ' || cnt);
  perform app.protect('warranties', i || ' or ' || cnt, u);
  perform app.protect('amc_contracts', i || ' or ' || cnt, u);
  perform app.protect('service_tickets', i || ' or ' || u || ' or ' || cnt);
  perform app.protect('maintenance_visits', i || ' or ' || cnt, u);
  perform app.protect('disputes', i || ' or ' || u || ' or ' || cnt || ' or raised_by = app.uid()');

  perform app.protect('file_objects',
    i || ' or ' || u || ' or uploaded_by = app.uid() or (' || c || ' and (not app.is_technician() or kind = ''WORK_EVIDENCE''))',
    'kind = ''PRODUCT'' or (kind = ''SURVEY'' and exists (select 1 from survey_evidence se where se.file_id = file_objects.id))');

  perform app.protect('notifications', 'user_id = app.uid()');
  execute 'drop policy if exists p_insert on notifications';
  execute 'create policy p_insert on notifications for insert to aiec_app with check (true)';
  perform app.insert_only('audit_logs', i);
  perform app.insert_only('outbound_messages', i);
  perform app.insert_only('file_access_logs', i);
end $$;
