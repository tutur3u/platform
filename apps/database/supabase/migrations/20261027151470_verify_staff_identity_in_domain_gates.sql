-- SR-336: a Tuturuuu-domain email is not proof of staff identity. The Azure
-- sign-in provider is multi-tenant, so a foreign directory can assert any
-- address. Staff checks now require a confirmed auth email and, when Azure
-- identities exist, that every one belongs to the pinned Tuturuuu tenant.
-- Mirrors isVerifiedTuturuuuStaffSession in packages/utils/src/email/staff-session.ts.
-- Rollback: apps/database/rollbacks/20261027151470_verify_staff_identity_in_domain_gates.rollback.sql

create table private.security_config (
  key text primary key,
  value text
);
alter table private.security_config enable row level security;
revoke all on table private.security_config from public, anon, authenticated, service_role;

-- Public directory identifier, not a secret. Empty or missing fails closed.
insert into private.security_config (key, value)
values ('azure_staff_tenant_id', '23d22ab9-8c8e-4562-a232-a401e15d3880');

-- Confirmed auth email, at least one provider identity, and no foreign Azure
-- directory. No domain check: callers that admit Tuturuuu subdomain mailboxes
-- pair it with their own domain rule.
create function private.staff_identity_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with tenant as (
    select nullif(pg_catalog.btrim(c.value), '') as id
    from private.security_config c
    where c.key = 'azure_staff_tenant_id'
  )
  select coalesce((
    select u.email_confirmed_at is not null
      and exists (select 1 from auth.identities any_identity where any_identity.user_id = u.id)
      and not exists (
        select 1
        from auth.identities i
        cross join lateral (
          select case when pg_catalog.jsonb_typeof(i.identity_data -> 'iss') = 'string'
            then pg_catalog.regexp_match(i.identity_data ->> 'iss',
              '^https://(?:login\.microsoftonline\.com/([^/]+)/v2\.0|sts\.windows\.net/([^/]+)/)$')
          end as m
        ) issuer
        where i.user_id = u.id
          and i.provider = 'azure'
          and not coalesce(
            (select t.id from tenant t) is not null
            and (case
              when coalesce(pg_catalog.jsonb_typeof(i.identity_data -> 'tid'), 'null') = 'null'
                then coalesce(issuer.m[1], issuer.m[2])
              when pg_catalog.jsonb_typeof(i.identity_data -> 'tid') = 'string'
                then i.identity_data ->> 'tid'
            end) = (select t.id from tenant t)
            and (not (i.identity_data ? 'iss')
              or coalesce(issuer.m[1], issuer.m[2]) = (select t.id from tenant t)),
            false
          )
      )
    from auth.users u
    where u.id = p_user_id
  ), false)
$$;

-- Exact @tuturuuu.com unless the caller's original rule also admitted
-- xwf.tuturuuu.com (public.is_tuturuuu_email); never widen a gate's domains.
create function private.is_verified_tuturuuu_staff(
  p_user_id uuid default auth.uid(),
  p_allow_xwf boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select case when p_allow_xwf
        then u.email ~ '^[^\s@]+@(tuturuuu\.com|xwf\.tuturuuu\.com)$'
        else pg_catalog.lower(u.email) ~ '^[^\s@]+@tuturuuu\.com$'
      end
      and private.staff_identity_verified(u.id)
    from auth.users u
    where u.id = p_user_id
  ), false)
$$;

-- Policy entry point. A non-service caller may only ask about itself.
create function public.is_verified_tuturuuu_staff(
  p_user_id uuid default auth.uid(),
  p_allow_xwf boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_user_id is null then false
    when p_user_id is distinct from auth.uid()
      and auth.role() is distinct from 'service_role' then false
    else private.is_verified_tuturuuu_staff(p_user_id, coalesce(p_allow_xwf, false))
  end
$$;

revoke all on function private.staff_identity_verified(uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_verified_tuturuuu_staff(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.is_verified_tuturuuu_staff(uuid, boolean) from public, anon;
grant execute on function public.is_verified_tuturuuu_staff(uuid, boolean) to authenticated, service_role;

alter policy "Allow team members to insert" on public.shortened_links
  with check ((select public.is_verified_tuturuuu_staff((select auth.uid()))));

alter policy "Allow team members to select" on public.shortened_links
  using ((select public.is_verified_tuturuuu_staff((select auth.uid()))));

alter policy "Enable insert for authenticated users only" on public.workspaces
  with check (
    (creator_id = (select auth.uid()))
    and (
      (select public.is_verified_tuturuuu_staff((select auth.uid()), true))
      or (public.count_user_workspaces((select auth.uid())) < 10)
    )
  );

alter policy "Only Tuturuuu accounts can create online meetings" on public.workspace_meetings
  with check (
    creator_id = (select auth.uid())
    and (select public.is_verified_tuturuuu_staff((select auth.uid())))
  );

create or replace function private.mail_push_recipient_allowed(p_user_id uuid, p_mailbox_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
 select exists (
  select 1 from auth.users u
  join private.mail_mailbox_members mm on mm.user_id=u.id and mm.mailbox_id=p_mailbox_id
  join private.mail_mailboxes b on b.id=mm.mailbox_id and b.status='active'
  join private.mail_domains bd on bd.id=b.domain_id and bd.status='active' and bd.verified_at is not null
  join private.mail_domains ud on ud.domain=split_part(lower(u.email),'@',2)
    and ud.status='active' and ud.verified_at is not null
  where u.id=p_user_id and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until < now())
   and lower(u.email) ~ '^[^@[:space:]]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*tuturuuu\.com$'
   and private.staff_identity_verified(u.id)
 );
$$;

create or replace function private.meeting_programming_elevated(p_meeting_id uuid, p_owner_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
 select exists(select 1 from public.workspace_meetings m
   where m.id=p_meeting_id and m.creator_id=p_owner_id
     and private.is_verified_tuturuuu_staff(m.creator_id))
$$;

create or replace function private.create_ai_memory_backfill_run(p_actor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not private.is_verified_tuturuuu_staff(p_actor_user_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into private.ai_memory_backfill_runs (actor_user_id)
  values (p_actor_user_id)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.assert_employee_administrator(p_actor_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform 1 from auth.users where id=p_actor_id and email ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'
    and email_confirmed_at is not null and (banned_until is null or banned_until <= now()) for update;
  if not found or not private.is_verified_tuturuuu_staff(p_actor_id)
    or not exists(select 1 from public.workspace_members where ws_id='00000000-0000-0000-0000-000000000000' and user_id=p_actor_id and type='MEMBER')
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

CREATE OR REPLACE FUNCTION private.assert_product_feedback_staff(p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET statement_timeout = '3s' SET lock_timeout = '500ms'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Service role required';
  END IF;
  IF pg_catalog.to_regclass('private.infrastructure_employees') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Feedback unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u JOIN private.infrastructure_employees e ON e.user_id=u.id
    WHERE u.id=p_actor AND e.staff_email=pg_catalog.lower(u.email)
      AND e.lifecycle_state='active'
      AND u.email ~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'
      AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
      AND u.raw_app_meta_data->'employee_onboarding'='true'::jsonb
      AND private.is_verified_tuturuuu_staff(u.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='Feedback forbidden';
  END IF;
END;
$$;

-- CREATE OR REPLACE keeps each ACL; restate the closed surface for reviewers.
revoke all on function private.mail_push_recipient_allowed(uuid, uuid),
  private.meeting_programming_elevated(uuid, uuid),
  private.create_ai_memory_backfill_run(uuid),
  private.assert_employee_administrator(uuid),
  private.assert_product_feedback_staff(uuid)
  from public, anon, authenticated;
