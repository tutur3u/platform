-- GoTrue adminUserCreate INSERTs before applying app_metadata/confirm/ban.
-- A service-only intent binds that first INSERT to a fresh authorized UUID.
create table private.employee_creation_intents (
  user_id uuid primary key,
  staff_email text not null unique,
  managed_name text not null check (managed_name=btrim(managed_name) and length(managed_name) between 1 and 100),
  actor_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  check (staff_email=lower(staff_email) and staff_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$')
);
alter table private.employee_creation_intents enable row level security;
revoke all on private.employee_creation_intents from public,anon,authenticated,service_role;

create function private.bind_employee_creation_intent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare intent private.employee_creation_intents%rowtype;
begin
  -- Either indexed identity overlap belongs to employee creation. Reject a
  -- partial tuple before ordinary profile/grant triggers can consume it.
  -- Lock visible intents in UUID order through the provider transaction.
  for intent in select * from private.employee_creation_intents
    where user_id=new.id or staff_email=new.email order by user_id for update loop
    if intent.user_id is distinct from new.id or intent.staff_email is distinct from new.email then
      raise exception using errcode='23514',message='Employee creation intent does not match identity';
    end if;
    new.raw_app_meta_data=coalesce(new.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('employee_onboarding',true);
  end loop;
  return new;
end;
$$;
create trigger bind_employee_creation_intent before insert on auth.users for each row execute function private.bind_employee_creation_intent();

-- Initial employee creation only. Recovery and rename workflows are dependent layers.
create table private.infrastructure_employees (
  user_id uuid primary key references public.users(id) on delete cascade,
  staff_email text not null unique check (staff_email = lower(staff_email) and staff_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'),
  managed_name text not null check (managed_name = btrim(managed_name) and length(managed_name) between 1 and 100),
  management_role_label text,
  recovery_email text,
  recovery_verified_at timestamptz,
  lifecycle_state text not null default 'pending' check (lifecycle_state in ('pending','provisioned','active')),
  mailbox_id uuid unique references private.mail_mailboxes(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recovery_verified_at is null or recovery_email is not null)
);
alter table private.infrastructure_employees enable row level security;
revoke all on private.infrastructure_employees from public, anon, authenticated;
grant select, insert, update on private.infrastructure_employees to service_role;

create or replace function public.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare email_role public.platform_email_roles%rowtype;
begin
  insert into public.users(id) values(new.id);
  -- app_metadata is service-owned. user_metadata never selects this branch.
  if new.raw_app_meta_data->'employee_onboarding' = 'true'::jsonb then
    if not exists(select 1 from private.employee_creation_intents where user_id=new.id and staff_email=new.email) then
      raise exception using errcode='23514',message='Employee creation intent is missing';
    end if;
    insert into private.infrastructure_employees(user_id,staff_email,managed_name,created_by,updated_by)
      select new.id,new.email,managed_name,actor_id,actor_id from private.employee_creation_intents where user_id=new.id;
    insert into public.platform_user_roles(user_id,enabled) values(new.id,false);
    return new;
  end if;
  select * into email_role from public.platform_email_roles where email=new.email;
  if found then
    insert into public.platform_user_roles(user_id,enabled,allow_challenge_management,allow_manage_all_challenges,allow_role_management)
    values(new.id,email_role.enabled,email_role.allow_challenge_management,email_role.allow_manage_all_challenges,email_role.allow_role_management);
    delete from public.platform_email_roles where email=new.email;
  else
    insert into public.platform_user_roles(user_id,enabled) values(new.id,false);
  end if;
  return new;
end;
$$;

create or replace function public.cleanup_platform_email_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from auth.users where id=new.user_id and raw_app_meta_data->'employee_onboarding'='true'::jsonb) then return new; end if;
  delete from public.platform_email_roles per where per.email=(select email from public.user_private_details where user_id=new.user_id);
  return new;
end;
$$;

create or replace function public.redirect_platform_email_roles_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare user_id_var uuid;
begin
  -- Covers reservations inserted after signup, before private-details sync.
  if exists(select 1 from auth.users where email=new.email and raw_app_meta_data->'employee_onboarding'='true'::jsonb) then
    raise exception using errcode='23505',message='Employee email cannot inherit reserved grants';
  end if;
  select user_id into user_id_var from public.user_private_details where email=new.email;
  if user_id_var is not null then
    insert into public.platform_user_roles(user_id,enabled,allow_challenge_management,allow_manage_all_challenges,allow_role_management)
    values(user_id_var,new.enabled,new.allow_challenge_management,new.allow_manage_all_challenges,new.allow_role_management)
    on conflict(user_id) do update set enabled=new.enabled,allow_challenge_management=new.allow_challenge_management,
      allow_manage_all_challenges=new.allow_manage_all_challenges,allow_role_management=new.allow_role_management;
    return null;
  end if;
  return new;
end;
$$;

create function private.enforce_employee_public_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected text;
begin
  if new.display_name is not distinct from old.display_name then return new; end if;
  select managed_name into expected from private.infrastructure_employees where user_id=old.id;
  if found and new.display_name is distinct from expected then
    raise exception using errcode='42501',message='Employee name is administrator managed';
  end if;
  return new;
end;
$$;
create trigger enforce_employee_public_name before update of display_name on public.users
for each row execute function private.enforce_employee_public_name();

create function private.enforce_employee_full_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare employee private.infrastructure_employees%rowtype;
begin
  if tg_op='UPDATE' and new.full_name is not distinct from old.full_name then return new; end if;
  select * into employee from private.infrastructure_employees where user_id=new.user_id;
  if found and new.full_name is distinct from employee.managed_name then
    -- Auth INSERT sync creates private-details after the pending registry.
    if tg_op='INSERT' and employee.lifecycle_state='pending' and new.full_name is null then return new; end if;
    raise exception using errcode='42501',message='Employee name is administrator managed';
  end if;
  return new;
end;
$$;
create trigger enforce_employee_full_name before insert or update of full_name on public.user_private_details
for each row execute function private.enforce_employee_full_name();

-- Pair-locking employee RPCs acquire both existing Auth rows in global UUID order
-- before the fresh actor assertion. This helper grants no permission and does not
-- lock absent rows, registry/intent or mailbox rows, or modify provider-owned data.
create function private.lock_employee_auth_pair(p_actor_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id in (p_actor_id,p_user_id) order by id for update;
end;
$$;
revoke all on function private.lock_employee_auth_pair(uuid,uuid) from public,anon,authenticated,service_role;

create function private.assert_employee_administrator(p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id=p_actor_id and email ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'
    and email_confirmed_at is not null and (banned_until is null or banned_until <= now()) for update;
  if not found or not exists(select 1 from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id=p_actor_id and type='MEMBER')
    -- Employee operations require BOTH role and permission to belong to root.
    -- Keep the global legacy evaluator unchanged.
    or not (
      exists(select 1 from public.workspaces where id='00000000-0000-0000-0000-000000000000' and creator_id=p_actor_id)
      or exists(select 1 from public.workspace_default_permissions
        where ws_id='00000000-0000-0000-0000-000000000000' and member_type='MEMBER'
          and permission in ('admin','manage_internal_accounts') and enabled)
      or exists(select 1 from public.workspace_role_members wrm
        join public.workspace_roles wr on wr.id=wrm.role_id and wr.ws_id='00000000-0000-0000-0000-000000000000'
        join public.workspace_role_permissions wrp on wrp.role_id=wr.id and wrp.ws_id=wr.ws_id
        where wrm.user_id=p_actor_id and wrp.permission in ('admin','manage_internal_accounts') and wrp.enabled)
    ) then
    raise exception using errcode='42501',message='Employee administrator access denied';
  end if;
end;
$$;

create function private.employee_creation_preflight(p_actor_id uuid,p_user_id uuid,p_email text,p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_employee_administrator(p_actor_id);
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$' then
    raise exception using errcode='23514',message='Invalid employee email';
  end if;
  if exists(select 1 from auth.users where lower(email)=p_email)
    or exists(select 1 from public.platform_email_roles where lower(email)=p_email)
    or exists(select 1 from private.mail_mailboxes where address=p_email)
    or exists(select 1 from private.employee_creation_intents where staff_email=p_email or user_id=p_user_id) then
    raise exception using errcode='23505',message='Employee account or reservation already exists';
  end if;
  insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values(p_user_id,p_email,p_name,p_actor_id);
  return true;
end;
$$;

revoke all on function private.assert_employee_administrator(uuid), private.employee_creation_preflight(uuid,uuid,text,text),
  private.enforce_employee_public_name(), private.enforce_employee_full_name() from public,anon,authenticated;
grant execute on function private.employee_creation_preflight(uuid,uuid,text,text) to service_role;

-- The provider applies confirmation/ban after INSERT in the same transaction.
-- Check its FINAL row, never set provider-owned password/ban/confirm fields here.
create function private.check_employee_creation_commit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target auth.users%rowtype; employee private.infrastructure_employees%rowtype;
begin
  select * into target from auth.users where id=new.id;
  if not found then return null; end if;
  select * into employee from private.infrastructure_employees where user_id=new.id;
  if not found then
    if target.raw_app_meta_data->'employee_onboarding' = 'true'::jsonb then
      raise exception using errcode='23514',message='Employee onboarding registry is missing';
    end if;
  else
    if target.raw_app_meta_data->'employee_onboarding' is distinct from 'true'::jsonb
      or target.email is distinct from employee.staff_email or target.email_confirmed_at is null
      or (employee.lifecycle_state='pending' and (target.banned_until is null or target.banned_until<=now())) then
      raise exception using errcode='23514',message='Employee creation must remain confirmed and pending';
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger check_employee_creation_commit after insert or update on auth.users
  deferrable initially deferred for each row execute function private.check_employee_creation_commit();
revoke all on function private.bind_employee_creation_intent(),private.check_employee_creation_commit() from public,anon,authenticated;
