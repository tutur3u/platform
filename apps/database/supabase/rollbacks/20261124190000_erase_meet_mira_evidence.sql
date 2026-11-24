-- Rolls back the erase_meet_mira_evidence migration. The deletion
-- functions return to their previous bodies (with the 60-second statement
-- timeout on the workspace ones), and the erase routine, wrappers and receipt
-- table are dropped. The proof anonymization trigger and its function stay with
-- the proof table, so account deletion keeps clearing account ids and linked
-- pseudonyms from proof rows (a migration role cannot drop a trigger on
-- auth.users either). Disable callers of the wrappers first.
-- private.meet_consent_proofs is NOT dropped: it holds the only remaining proof
-- of consent for deleted meetings. Export it, then drop it by hand when that is
-- intended. After this rollback, deleting a meeting or workspace that holds
-- consent evidence is refused again (RESTRICT) until the evidence is erased by hand.
begin;
set local lock_timeout = '5s';

create or replace function public.delete_owned_workspace(
  p_ws_id uuid,
  p_actor_id uuid,
  p_confirmation text
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '60s'
as $$
declare
  workspace public.workspaces%rowtype;
begin
  if p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_actor_id is null then
    return 'forbidden';
  end if;

  -- A rename or ownership transfer must finish before the checks can pass.
  -- The row lock also fences new rows with a workspace foreign key.
  select * into workspace from public.workspaces
  where id = p_ws_id for update;
  if not found then
    return 'not_found';
  end if;
  if workspace.creator_id is distinct from p_actor_id
    or workspace.personal is distinct from false then
    return 'forbidden';
  end if;
  if nullif(btrim(p_confirmation), '') is null
    or btrim(p_confirmation) is distinct from btrim(workspace.name) then
    return 'confirmation_mismatch';
  end if;

  perform 1 from public.workspace_secrets
  where ws_id = p_ws_id and name = 'PREVENT_WORKSPACE_DELETION'
  for update;
  if exists (
    select 1 from public.workspace_secrets
    where ws_id = p_ws_id and name = 'PREVENT_WORKSPACE_DELETION'
      and lower(btrim(value)) = 'true'
  ) then
    return 'forbidden';
  end if;

  -- Lock existing subscriptions so a concurrent status update cannot make
  -- a paid subscription active during deletion.
  perform 1 from public.workspace_subscriptions where ws_id = p_ws_id for update;
  perform 1 from private.workspace_domain_addons where ws_id = p_ws_id for update;
  perform 1
  from private.workspace_subscription_products product
  where product.id in (
    select subscription.product_id
    from public.workspace_subscriptions subscription
    where subscription.ws_id = p_ws_id
  )
  order by product.id
  for share;
  if private.workspace_has_blocking_subscription(p_ws_id) then
    return 'subscription_active';
  end if;

  delete from public.workspaces where id = p_ws_id;
  if not found then
    return 'not_found';
  end if;
  insert into private.workspace_deletion_audit (ws_id, actor_id)
  values (p_ws_id, p_actor_id);
  return 'deleted';
end;
$$;

create or replace function private.delete_workspace_with_attendance_intent(
  p_ws_id uuid,
  p_plan jsonb
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '60s'
as $$
declare
  found_id uuid;
  extra jsonb;
  plan jsonb;
begin
  select workspace.id into found_id
  from public.workspaces workspace
  where workspace.id = p_ws_id
  for update;
  if not found then
    return 'not_deleted';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roomId', session.ws_id::text || ':' || session.meeting_id::text,
    'wsId', session.ws_id::text,
    'meetingId', session.meeting_id::text
  )), '[]'::jsonb)
  into extra
  from (
    select distinct ws_id, meeting_id
    from private.meet_attendance_sessions
    where ws_id = p_ws_id
  ) session;

  plan := private.meet_attendance_confirm_plan(
    p_plan,
    pg_catalog.jsonb_build_object('op', 'workspace', 'wsId', p_ws_id::text),
    extra
  );
  perform private.store_meet_attendance_intent('workspace', p_ws_id::text, plan);

  delete from public.workspaces where id = p_ws_id;
  if not found then
    raise exception 'Meet attendance workspace delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;

create or replace function private.delete_meeting_with_attendance_intent(
  p_ws_id uuid,
  p_meeting_id uuid,
  p_plan jsonb
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  found_id uuid;
  extra jsonb;
  plan jsonb;
begin
  select meeting.id into found_id
  from public.workspace_meetings meeting
  where meeting.id = p_meeting_id
    and meeting.ws_id = p_ws_id
  for update;
  if not found then
    return 'not_deleted';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'roomId', session.ws_id::text || ':' || session.meeting_id::text,
    'wsId', session.ws_id::text,
    'meetingId', session.meeting_id::text
  )), '[]'::jsonb)
  into extra
  from (
    select distinct ws_id, meeting_id
    from private.meet_attendance_sessions
    where meeting_id = p_meeting_id
  ) session;

  plan := private.meet_attendance_confirm_plan(
    p_plan,
    pg_catalog.jsonb_build_object(
      'op', 'meeting',
      'meetingId', p_meeting_id::text
    ),
    extra
  );
  perform private.store_meet_attendance_intent(
    'meeting',
    p_meeting_id::text,
    plan
  );

  delete from public.workspace_meetings
  where id = p_meeting_id
    and ws_id = p_ws_id;
  if not found then
    raise exception 'Meet attendance meeting delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;


drop function if exists private.delete_workspace_erasing_mira(uuid, boolean);
drop function if exists private.delete_meeting_erasing_mira(uuid, uuid);
drop function if exists private.erase_meet_mira_evidence(uuid, uuid, text);
drop table if exists private.meet_mira_evidence_erasures;

notify pgrst, 'reload schema';
commit;
