-- Keep a minimal proof of consent when a meeting or workspace is deleted.
--
-- Consent evidence blocks a bare delete: private.meet_mira_host_acceptances and
-- private.meet_mira_participant_choices reference workspace_meetings and
-- workspaces with ON DELETE RESTRICT, and private.meet_ai_consents references
-- meet_ai_sessions the same way, which a meeting delete cascades into. That
-- refusal stays, so any delete path that does not erase first fails closed
-- instead of silently destroying evidence. The product's delete flows call
-- private.erase_meet_mira_evidence, which, in the same transaction as the
-- delete, copies each acceptance, choice and per-speaker consent decision into
-- private.meet_consent_proofs, deletes the originals and records a receipt.
--
-- A proof row holds only who consented (an account id, anonymized when the
-- account is deleted, or a guest id), when, the notice version, the consent
-- text hash, the revision and the choice, plus the meeting and workspace ids as
-- plain values. It holds no transcript, audio, name or email. It is kept until
-- purge_after, three years after the erase, by the decision that consent proof
-- is the one exception to the 30-day workspace purge; a purge job is a separate
-- change. The column default is the retention rule and can be changed.
--
-- CREATE OR REPLACE resets a function's own settings, so each replaced
-- workspace deletion function restates search_path and the 60-second
-- statement_timeout set by 20261124101000. Privileges of a replaced function
-- are kept; they are restated below as well.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_consent_proofs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in ('mira_acceptance', 'mira_choice', 'self_v1_decision')
  ),
  -- Plain values, never foreign keys: the rows they name are gone by design.
  meeting_id uuid,
  ws_id uuid,
  -- The account that consented; null once the account is deleted.
  user_id uuid,
  -- The server-issued guest id, or an account's per-meeting pseudonym.
  participant_ref uuid,
  choice text not null,
  -- The acceptance revision; for per-speaker decisions, the decision's
  -- position among that participant's decisions in the session.
  revision integer,
  notice_version text not null check (length(notice_version) between 1 and 80),
  text_hash text check (text_hash is null or text_hash ~ '^[0-9a-f]{64}$'),
  -- What a host acceptance covered (chat, captions, notes).
  capabilities text[],
  room_seq bigint,
  decided_at timestamptz not null,
  erased_at timestamptz not null default now(),
  erase_reason text not null check (
    erase_reason in ('meeting_deleted', 'workspace_deleted')
  ),
  -- Three years after the erase. Change the default to change the rule.
  purge_after timestamptz not null default (now() + interval '3 years'),
  check (
    (kind = 'mira_acceptance' and choice in ('accept', 'end'))
    or (kind = 'mira_choice' and choice in ('on', 'off'))
    or (kind = 'self_v1_decision' and choice in ('allow', 'deny', 'withdraw'))
  )
);
create index meet_consent_proofs_purge on private.meet_consent_proofs(purge_after);
create index meet_consent_proofs_user on private.meet_consent_proofs(user_id)
  where user_id is not null;
create index meet_consent_proofs_meeting on private.meet_consent_proofs(meeting_id);
alter table private.meet_consent_proofs enable row level security;
revoke all on private.meet_consent_proofs
  from public, anon, authenticated, service_role;
-- Rows are written only by the erase routine; the service role can read them.
grant select on private.meet_consent_proofs to service_role;

-- Immutable, except that deleting an account clears the account id together
-- with the pseudonym that could link the row back to it (a guest id is not an
-- account and stays). Every other column must be unchanged. Only the account
-- deletion trigger may do it: it names the deleted account in a
-- transaction-local setting, and that account must be gone. A row without an
-- account id may lose only its pseudonym that way.
-- tuturuuu: no-grant (trigger)
create function private.protect_meet_consent_proof_update()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  erased_account uuid := nullif(
    current_setting('private.meet_consent_erased_account', true), ''
  )::uuid;
begin
  if current_setting('role', true) not in ('anon', 'authenticated')
    and pg_trigger_depth() > 1
    and erased_account is not null
    and not exists (select 1 from auth.users where id = erased_account)
    and new.user_id is null and new.participant_ref is null
    and (old.user_id = erased_account
      or (old.user_id is null and old.participant_ref is not null))
    and (to_jsonb(new) - 'user_id' - 'participant_ref')
      = (to_jsonb(old) - 'user_id' - 'participant_ref') then
    return new;
  end if;
  raise exception 'Mira consent evidence is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.protect_meet_consent_proof_update()
  from public, anon, authenticated, service_role;
create trigger protect_meet_consent_proof
  before update on private.meet_consent_proofs
  for each row execute function private.protect_meet_consent_proof_update();

-- Proof stays until its purge date; only a purge of due rows may remove it.
-- tuturuuu: no-grant (trigger)
create function private.protect_meet_consent_proof_delete()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.purge_after > pg_catalog.now() then
    raise exception 'Consent proof is kept until its purge date'
      using errcode = '55000';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_meet_consent_proof_delete()
  from public, anon, authenticated, service_role;
create trigger protect_meet_consent_proof_delete
  before delete on private.meet_consent_proofs
  for each row execute function private.protect_meet_consent_proof_delete();

-- Account deletion clears the account id, and every pseudonym that links a
-- row back to the account, from proof rows too: the rows naming the account
-- and any row carrying one of its pseudonyms (from its proof, its live Mira
-- choices or its per-speaker decisions). A guest id stays.
create or replace function private.anonymize_meet_mira_evidence()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  refs uuid[];
begin
  select coalesce(array_agg(distinct r.ref), '{}') into refs from (
    select p.participant_ref as ref from private.meet_consent_proofs p
      where p.user_id = old.id and p.participant_ref is not null
    union all
    select c.participant_ref from private.meet_mira_participant_choices c
      where c.user_id = old.id and not c.guest
    union all
    select c.participant_ref from private.meet_ai_consents c
      where c.user_id = old.id
  ) r;
  perform pg_catalog.set_config(
    'private.meet_consent_erased_account', old.id::text, true
  );
  update private.meet_mira_host_acceptances set user_id = null where user_id = old.id;
  update private.meet_mira_participant_choices set user_id = null where user_id = old.id;
  update private.meet_consent_proofs
    set user_id = null, participant_ref = null
    where user_id = old.id
      or (user_id is null and participant_ref = any(refs));
  perform pg_catalog.set_config('private.meet_consent_erased_account', '', true);
  return old;
end;
$$;
revoke all on function private.anonymize_meet_mira_evidence()
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.anonymize_meet_mira_evidence() is a trigger function on auth.users and is restricted to the service role.
grant execute on function private.anonymize_meet_mira_evidence() to service_role;

-- A receipt per erase: the scope, the erased ids and the counts, no person.
create table private.meet_mira_evidence_erasures (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('meeting', 'workspace')),
  -- Identifiers of the deleted scope only; no foreign keys, since the rows
  -- they name are gone by design.
  meeting_id uuid,
  ws_id uuid,
  acceptances integer not null check (acceptances >= 0),
  choices integer not null check (choices >= 0),
  consents integer not null default 0 check (consents >= 0),
  reason text not null check (reason in ('meeting_deleted', 'workspace_deleted')),
  erased_at timestamptz not null default clock_timestamp(),
  check ((scope = 'meeting') = (meeting_id is not null)),
  check ((scope = 'workspace') = (ws_id is not null))
);
create index meet_mira_evidence_erasures_erased_at
  on private.meet_mira_evidence_erasures(erased_at desc);
alter table private.meet_mira_evidence_erasures enable row level security;
revoke all on private.meet_mira_evidence_erasures
  from public, anon, authenticated, service_role;
grant select, insert on private.meet_mira_evidence_erasures to service_role;

-- Exactly one scope per call. Proofs are copied before the originals go, and
-- every copy must match a deletion, so a concurrent write fails the whole
-- transaction instead of losing evidence. Choices go first: they reference
-- acceptances. Deleting per-speaker consents of a session that can still
-- capture is refused by their own guard, which also refuses the delete.
create function private.erase_meet_mira_evidence(
  p_meeting_id uuid,
  p_ws_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  copied integer := 0;
  step integer;
  choices_erased integer;
  acceptances_erased integer;
  consents_erased integer;
begin
  if (p_meeting_id is null) = (p_ws_id is null) then
    raise exception 'Exactly one Mira evidence erase scope is required'
      using errcode = '22023';
  end if;
  if p_reason is distinct from case
    when p_meeting_id is not null then 'meeting_deleted'
    else 'workspace_deleted'
  end then
    raise exception 'Mira evidence erase reason does not match its scope'
      using errcode = '22023';
  end if;

  insert into private.meet_consent_proofs(
    kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
    notice_version, text_hash, capabilities, decided_at, erase_reason
  )
  select 'mira_acceptance', a.meeting_id, a.ws_id,
    case when exists (select 1 from auth.users u where u.id = a.user_id)
      then a.user_id end,
    null, a.event,
    a.revision, a.notice_version, null,
    case when a.event = 'accept' then a.capabilities end,
    a.created_at, p_reason
  from private.meet_mira_host_acceptances a
  where (p_meeting_id is not null and a.meeting_id = p_meeting_id)
    or (p_ws_id is not null and a.ws_id = p_ws_id);
  get diagnostics step = row_count;
  copied := copied + step;

  insert into private.meet_consent_proofs(
    kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
    notice_version, text_hash, decided_at, erase_reason
  )
  select 'mira_choice', c.meeting_id, c.ws_id, c.user_id,
    -- An account choice whose account was deleted keeps no pseudonym.
    case when c.guest or c.user_id is not null then c.participant_ref end,
    c.choice, c.acceptance_revision, c.notice_version, c.text_hash,
    c.created_at, p_reason
  from private.meet_mira_participant_choices c
  where (p_meeting_id is not null and c.meeting_id = p_meeting_id)
    or (p_ws_id is not null and c.ws_id = p_ws_id);
  get diagnostics step = row_count;
  copied := copied + step;

  -- room_seq is read through jsonb so this works before and after the column
  -- exists; guest labels are never copied.
  insert into private.meet_consent_proofs(
    kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
    notice_version, room_seq, decided_at, erase_reason
  )
  select 'self_v1_decision', s.meeting_id, m.ws_id,
    case when exists (select 1 from auth.users u where u.id = c.user_id)
      then c.user_id end,
    -- A decision of a deleted account keeps neither its id nor its pseudonym.
    case when c.user_id is null
      or exists (select 1 from auth.users u where u.id = c.user_id)
      then c.participant_ref end,
    c.decision,
    pg_catalog.row_number() over (
      partition by c.session_id, c.participant_ref
      order by c.created_at, c.id
    ),
    c.notice_version, (pg_catalog.to_jsonb(c) ->> 'room_seq')::bigint,
    c.created_at, p_reason
  from private.meet_ai_consents c
  join public.meet_ai_sessions s on s.id = c.session_id
  join public.workspace_meetings m on m.id = s.meeting_id
  where (p_meeting_id is not null and s.meeting_id = p_meeting_id)
    or (p_ws_id is not null and m.ws_id = p_ws_id);
  get diagnostics step = row_count;
  copied := copied + step;

  if p_meeting_id is not null then
    delete from private.meet_mira_participant_choices
      where meeting_id = p_meeting_id;
    get diagnostics choices_erased = row_count;
    delete from private.meet_mira_host_acceptances
      where meeting_id = p_meeting_id;
    get diagnostics acceptances_erased = row_count;
    delete from private.meet_ai_consents
      where session_id in (
        select s.id from public.meet_ai_sessions s where s.meeting_id = p_meeting_id
      );
    get diagnostics consents_erased = row_count;
  else
    delete from private.meet_mira_participant_choices
      where ws_id = p_ws_id;
    get diagnostics choices_erased = row_count;
    delete from private.meet_mira_host_acceptances
      where ws_id = p_ws_id;
    get diagnostics acceptances_erased = row_count;
    delete from private.meet_ai_consents
      where session_id in (
        select s.id
        from public.meet_ai_sessions s
        join public.workspace_meetings m on m.id = s.meeting_id
        where m.ws_id = p_ws_id
      );
    get diagnostics consents_erased = row_count;
  end if;

  if copied <> choices_erased + acceptances_erased + consents_erased then
    raise exception 'Consent evidence changed while it was being erased'
      using errcode = '40001';
  end if;

  if copied > 0 then
    insert into private.meet_mira_evidence_erasures(
      scope, meeting_id, ws_id, acceptances, choices, consents, reason
    ) values (
      case when p_meeting_id is not null then 'meeting' else 'workspace' end,
      p_meeting_id, p_ws_id, acceptances_erased, choices_erased,
      consents_erased, p_reason
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'acceptances', acceptances_erased,
    'choices', choices_erased,
    'consents', consents_erased
  );
end;
$$;
revoke all on function private.erase_meet_mira_evidence(uuid, uuid, text)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.erase_meet_mira_evidence(uuid,uuid,text) is called only by the service-role deletion functions below and by the service role directly; it moves the evidence of exactly one meeting or workspace into the minimal consent proof and keeps a non-content receipt.
grant execute on function private.erase_meet_mira_evidence(uuid, uuid, text)
  to service_role;

-- Delete wrappers for the flows that do not carry a Meet attendance intent.
-- Each erases and deletes in one transaction, so a failed delete keeps the
-- evidence. The caller has already authorized the delete.
create function private.delete_meeting_erasing_mira(
  p_ws_id uuid,
  p_meeting_id uuid
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  found_id uuid;
begin
  select meeting.id into found_id
  from public.workspace_meetings meeting
  where meeting.id = p_meeting_id
    and meeting.ws_id = p_ws_id
  for update;
  if not found then
    return 'not_deleted';
  end if;
  perform private.erase_meet_mira_evidence(p_meeting_id, null, 'meeting_deleted');
  delete from public.workspace_meetings
  where id = p_meeting_id
    and ws_id = p_ws_id;
  if not found then
    raise exception 'Meeting delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;
revoke all on function private.delete_meeting_erasing_mira(uuid, uuid)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.delete_meeting_erasing_mira(uuid,uuid) deletes one meeting after the server adapter authorized it and is restricted to the service role.
grant execute on function private.delete_meeting_erasing_mira(uuid, uuid)
  to service_role;

-- p_only_non_personal keeps a caller that must never remove a Personal
-- workspace (QA cleanup) from doing so.
create function private.delete_workspace_erasing_mira(
  p_ws_id uuid,
  p_only_non_personal boolean default false
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '60s'
as $$
declare
  found_id uuid;
begin
  select workspace.id into found_id
  from public.workspaces workspace
  where workspace.id = p_ws_id
    and (not p_only_non_personal or workspace.personal is not true)
  for update;
  if not found then
    return 'not_deleted';
  end if;
  perform private.erase_meet_mira_evidence(null, p_ws_id, 'workspace_deleted');
  delete from public.workspaces where id = p_ws_id;
  if not found then
    raise exception 'Workspace delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;
revoke all on function private.delete_workspace_erasing_mira(uuid, boolean)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.delete_workspace_erasing_mira(uuid,boolean) deletes one workspace after the server adapter authorized it and is restricted to the service role.
grant execute on function private.delete_workspace_erasing_mira(uuid, boolean)
  to service_role;

-- The existing deletion functions, unchanged except for the erase call
-- before their delete and the restated settings.
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

  -- Mira consent evidence blocks the delete (RESTRICT) until it is erased, so
  -- it is erased here, in the same transaction, after every check has passed.
  perform private.erase_meet_mira_evidence(null, p_ws_id, 'workspace_deleted');
  delete from public.workspaces where id = p_ws_id;
  if not found then
    return 'not_found';
  end if;
  insert into private.workspace_deletion_audit (ws_id, actor_id)
  values (p_ws_id, p_actor_id);
  return 'deleted';
end;
$$;
revoke all on function public.delete_owned_workspace(uuid, uuid, text)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.delete_owned_workspace(uuid,uuid,text) is restricted to the authenticated server adapter's service role.
grant execute on function public.delete_owned_workspace(uuid, uuid, text)
  to service_role;

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

  perform private.erase_meet_mira_evidence(null, p_ws_id, 'workspace_deleted');
  delete from public.workspaces where id = p_ws_id;
  if not found then
    raise exception 'Meet attendance workspace delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;

revoke all on function private.delete_workspace_with_attendance_intent(uuid, jsonb)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.delete_workspace_with_attendance_intent(uuid,jsonb) is called only by the server adapters that authorized the delete and is restricted to the service role.
grant execute on function private.delete_workspace_with_attendance_intent(uuid, jsonb)
  to service_role;

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

  perform private.erase_meet_mira_evidence(p_meeting_id, null, 'meeting_deleted');
  delete from public.workspace_meetings
  where id = p_meeting_id
    and ws_id = p_ws_id;
  if not found then
    raise exception 'Meet attendance meeting delete did not remove the row';
  end if;
  return 'deleted';
end;
$$;

revoke all on function private.delete_meeting_with_attendance_intent(uuid, uuid, jsonb)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.delete_meeting_with_attendance_intent(uuid,uuid,jsonb) is called only by the server adapter that authorized the delete and is restricted to the service role.
grant execute on function private.delete_meeting_with_attendance_intent(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
