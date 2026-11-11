-- Notification fan-out helpers. SECURITY DEFINER so that, for example, a customer action can
-- notify AIEC staff without the customer being able to read the staff directory.
create or replace function app.notify_permission(p_permission text, p_type text, p_params jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, params, link)
  select distinct ur.user_id, p_type, p_params, p_link
  from user_roles ur
  join role_permissions rp on rp.role_code = ur.role_code
  join users u on u.id = ur.user_id and u.is_active
  where ur.revoked_at is null and rp.permission_code = p_permission
$$;

create or replace function app.notify_company(p_company uuid, p_type text, p_params jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, params, link)
  select distinct ur.user_id, p_type, p_params, p_link
  from user_roles ur join users u on u.id = ur.user_id and u.is_active
  where ur.revoked_at is null and ur.company_id = p_company and ur.role_code in ('PARTNER_ADMIN','SUPPLIER','SERVICE_PARTNER')
$$;

create or replace function app.notify_customer(p_customer uuid, p_type text, p_params jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, params, link)
  select c.user_id, p_type, p_params, p_link from customers c where c.id = p_customer and c.user_id is not null
$$;

-- Number of projects currently occupying a pilot capacity slot (visible to every role).
create or replace function app.active_project_count(p_company uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from projects
  where status in ('PLANNING','IN_PROGRESS','ON_HOLD','STOP_WORK','QC','HANDOVER_PENDING')
    and (p_company is null or company_id = p_company)
$$;

grant execute on all functions in schema app to aiec_app;
