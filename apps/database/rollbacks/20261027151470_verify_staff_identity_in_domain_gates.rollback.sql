-- SR-336 rollback: restore the prior domain-only staff policies and functions.
-- CREATE OR REPLACE keeps each function's existing ACL; nothing is granted.
begin;
alter policy "Allow team members to insert" on public.shortened_links
  with check ((exists (select 1 from auth.users where ((users.id = (select auth.uid())) and (users.email ~~ '%@tuturuuu.com'::text)))));
alter policy "Allow team members to select" on public.shortened_links
  using ((exists (select 1 from auth.users where ((users.id = (select auth.uid())) and (users.email ~~ '%@tuturuuu.com'::text)))));
alter policy "Enable insert for authenticated users only" on public.workspaces
  with check (
    (creator_id = (select auth.uid()))
    and (
      is_tuturuuu_email((select user_private_details.email from user_private_details where (user_private_details.user_id = (select auth.uid()))))
      or (count_user_workspaces((select auth.uid())) < 10)
    )
  );
alter policy "Only Tuturuuu accounts can create online meetings" on public.workspace_meetings
  with check (
    creator_id = (select auth.uid())
    and coalesce((select auth.jwt()) ->> 'email', '') ~* '^[^[:space:]@]+@tuturuuu\.com$'
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
 );
$$;

create or replace function private.meeting_programming_elevated(p_meeting_id uuid, p_owner_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
 select exists(select 1 from public.workspace_meetings m join auth.users identity on identity.id=m.creator_id
   where m.id=p_meeting_id and m.creator_id=p_owner_id and identity.email_confirmed_at is not null
     and lower(btrim(identity.email)) ~ '^[^@[:space:]]+@tuturuuu\.com$')
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
  if not exists (
    select 1
    from public.users u
    where u.id = p_actor_user_id
      and u.email ilike '%@tuturuuu.com'
  ) then
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
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='Feedback forbidden';
  END IF;
END;
$$;

drop function public.is_verified_tuturuuu_staff(uuid, boolean);
drop function private.is_verified_tuturuuu_staff(uuid, boolean);
drop function private.staff_identity_verified(uuid);
drop table private.security_config;
commit;
