-- Fix-forward for two races found in a late review of 20261124191000.
--
-- 1. Account-erasure proof race. A first per-speaker decision is written under
--    the meet_ai_sessions row lock, not the meeting row, so it could commit
--    after the erase routine had scanned and locked the accounts, and be copied
--    with the id of an account whose deletion then committed first, leaving a
--    deleted account's id in a proof row. The routine now locks the in-scope
--    sessions, in id order, before it collects and locks accounts, and holds
--    them to the end of the transaction. The sweep in 20261124191500 stays as
--    the backstop for rows this cannot reach.
-- 2. Active capture bypass. The per-consent-row guard skips decisions whose
--    account was deleted (a null user_id), so deleting an account could clear
--    the only speaker's account id and let a meeting delete cascade into a
--    session whose capture is active or draining. The routine now refuses
--    (55000, the meeting API answers 409 MEETING_DELETE_BLOCKED) when any
--    in-scope self_v1 session that holds consent decisions is active or
--    draining, checked at the session level under the lock.
-- 3. The auth.users trigger function anonymize_linked_meet_evidence is only
--    ever invoked by that trigger, so the service role loses EXECUTE on it.
--
-- CREATE OR REPLACE keeps the routine's grants and its reviewed marker; the
-- search_path and SECURITY DEFINER are restated.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.erase_meet_mira_evidence(
  p_meeting_id uuid,
  p_ws_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  acceptances_copied integer;
  choices_copied integer;
  consents_copied integer;
  choices_erased integer;
  acceptances_erased integer;
  consents_erased integer;
begin
  if (p_meeting_id is null) = (p_ws_id is null) then
    raise exception 'Exactly one Mira evidence erase scope is required'
      using errcode = '22023';
  end if;
  -- PL/pgSQL ends an IF condition at its first THEN, so the CASE is
  -- parenthesized.
  if p_reason is distinct from (case
    when p_meeting_id is not null then 'meeting_deleted'
    else 'workspace_deleted'
  end) then
    raise exception 'Mira evidence erase reason does not match its scope'
      using errcode = '22023';
  end if;

  -- Lock the in-scope sessions first, in id order, and keep the locks to the
  -- end of this transaction. A per-speaker decision is written under its
  -- session's row lock, so it either committed before this point, and
  -- everything below reads it, or waits for this transaction and then fails on
  -- the deleted session. Taking these locks before the account scan closes the
  -- window where a first decision committed after the scan and was copied with
  -- the id of an account whose deletion committed first.
  perform 1
  from public.meet_ai_sessions s
  join public.workspace_meetings m on m.id = s.meeting_id
  where (p_meeting_id is not null and s.meeting_id = p_meeting_id)
    or (p_ws_id is not null and m.ws_id = p_ws_id)
  order by s.id
  for update of s;

  -- Capture is checked per session, under that lock, instead of per consent
  -- row: the row guard skips decisions whose account was deleted (a null
  -- user_id), so deleting the only speaker's account must not let a live
  -- capture session be erased and cascaded. Same error as the row guard, so
  -- the meeting API answers 409 MEETING_DELETE_BLOCKED.
  if exists (
    select 1
    from public.meet_ai_sessions s
    join public.workspace_meetings m on m.id = s.meeting_id
    where ((p_meeting_id is not null and s.meeting_id = p_meeting_id)
        or (p_ws_id is not null and m.ws_id = p_ws_id))
      and s.protocol = 'self_v1'
      and s.capture_state in ('active', 'draining')
      and exists (
        select 1 from private.meet_ai_consents c where c.session_id = s.id
      )
  ) then
    raise exception 'self_v1 consent evidence is kept while capture can run'
      using errcode = '55000';
  end if;

  -- Lock the accounts that in-scope evidence names, in id order, before
  -- copying. An Auth account delete that starts later waits for this
  -- transaction, so its anonymization sees the proof rows written here; one
  -- already running is waited for, and the copies below then see the rows it
  -- anonymized. Without the lock a concurrent delete could miss uncommitted
  -- proof rows and leave the account id in them.
  perform 1 from auth.users u
  where u.id in (
    select a.user_id from private.meet_mira_host_acceptances a
    where (p_meeting_id is not null and a.meeting_id = p_meeting_id)
      or (p_ws_id is not null and a.ws_id = p_ws_id)
    union
    select c.user_id from private.meet_mira_participant_choices c
    where (p_meeting_id is not null and c.meeting_id = p_meeting_id)
      or (p_ws_id is not null and c.ws_id = p_ws_id)
    union
    select c.user_id from private.meet_ai_consents c
    join public.meet_ai_sessions s on s.id = c.session_id
    join public.workspace_meetings m on m.id = s.meeting_id
    where (p_meeting_id is not null and s.meeting_id = p_meeting_id)
      or (p_ws_id is not null and m.ws_id = p_ws_id)
  )
  order by u.id
  for key share of u;

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
  get diagnostics acceptances_copied = row_count;

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
  get diagnostics choices_copied = row_count;

  -- room_seq and text_hash are read through jsonb so this works before and
  -- after those columns exist; guest labels are never copied.
  insert into private.meet_consent_proofs(
    kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
    notice_version, text_hash, room_seq, decided_at, erase_reason
  )
  select 'self_v1_decision', s.meeting_id, m.ws_id,
    case when exists (select 1 from auth.users u where u.id = c.user_id)
      then c.user_id end,
    -- A decision still naming a deleted account keeps neither its id nor its
    -- pseudonym. Account deletion clears the id from live decisions; their
    -- per-session pseudonym then links to no account and stays, since it
    -- cannot be told apart from a guest's.
    case when c.user_id is null
      or exists (select 1 from auth.users u where u.id = c.user_id)
      then c.participant_ref end,
    c.decision,
    pg_catalog.row_number() over (
      partition by c.session_id, c.participant_ref
      order by c.created_at, c.id
    ),
    c.notice_version, pg_catalog.to_jsonb(c) ->> 'text_hash',
    (pg_catalog.to_jsonb(c) ->> 'room_seq')::bigint,
    c.created_at, p_reason
  from private.meet_ai_consents c
  join public.meet_ai_sessions s on s.id = c.session_id
  join public.workspace_meetings m on m.id = s.meeting_id
  where (p_meeting_id is not null and s.meeting_id = p_meeting_id)
    or (p_ws_id is not null and m.ws_id = p_ws_id);
  get diagnostics consents_copied = row_count;

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

  -- Each table's copies must match its deletions.
  if acceptances_copied <> acceptances_erased
    or choices_copied <> choices_erased
    or consents_copied <> consents_erased then
    raise exception 'Consent evidence changed while it was being erased'
      using errcode = '40001';
  end if;

  if acceptances_erased + choices_erased + consents_erased > 0 then
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
-- tuturuuu: reviewed(function-grant): private.erase_meet_mira_evidence(uuid,uuid,text) is called only by the service-role delete wrappers and deletion functions of 20261124191000, inside the transaction of their delete; it moves the evidence of exactly one meeting or workspace into the minimal consent proof and keeps a non-content receipt.
grant execute on function private.erase_meet_mira_evidence(uuid, uuid, text)
  to service_role;

-- A trigger function: the trigger fires without EXECUTE on the function, and
-- nothing else calls it. This supersedes the service_role grant and the
-- review note on it in 20261124191000.
revoke all on function private.anonymize_linked_meet_evidence()
  from public, anon, authenticated, service_role;

commit;
