-- Clear account ids from consent proof rows whose account no longer exists.
--
-- Account deletion clears proof rows through the anonymize_linked_meet_evidence
-- trigger on auth.users, and the erase routine locks the accounts it copies, so
-- a delete during an erase still reaches the new rows. This sweep is the
-- backstop for an account row removed without that trigger (a restore, a
-- replica-mode session or a manual repair): it clears user_id, and the
-- participant_ref pseudonym that could link the row back to the account, from
-- proof rows naming an account that is gone. A guest id is kept, since a row
-- with no user_id is never touched. Each call handles at most 500 rows and
-- returns how many it cleared; calling it again until it returns 0 is safe.
--
-- The proof update trigger allows exactly this change during a sweep call:
-- only user_id and participant_ref may become null, only for an account that
-- no longer exists, and every other column must be unchanged. The trigger keeps
-- its account-deletion branch. CREATE OR REPLACE keeps the trigger function's
-- privileges; they are restated below.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- tuturuuu: no-grant (trigger)
create or replace function private.protect_meet_consent_proof_update()
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
  -- The sweep: an account id that names no account is cleared with its
  -- pseudonym, and nothing else changes.
  if current_setting('role', true) not in ('anon', 'authenticated')
    and current_setting('private.meet_consent_proof_sweep', true) = 'on'
    and old.user_id is not null
    and not exists (select 1 from auth.users where id = old.user_id)
    and new.user_id is null and new.participant_ref is null
    and (to_jsonb(new) - 'user_id' - 'participant_ref')
      = (to_jsonb(old) - 'user_id' - 'participant_ref') then
    return new;
  end if;
  raise exception 'Mira consent evidence is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.protect_meet_consent_proof_update()
  from public, anon, authenticated, service_role;

create function private.sweep_meet_consent_proof_accounts(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $$
declare
  batch integer := least(greatest(coalesce(p_limit, 500), 1), 500);
  cleared integer;
begin
  perform pg_catalog.set_config('private.meet_consent_proof_sweep', 'on', true);
  -- Rows another transaction holds are left for the next call.
  with due as (
    select p.id from private.meet_consent_proofs p
    where p.user_id is not null
      and not exists (select 1 from auth.users u where u.id = p.user_id)
    order by p.id
    limit batch
    for update of p skip locked
  )
  update private.meet_consent_proofs p
    set user_id = null, participant_ref = null
    from due
    where p.id = due.id;
  get diagnostics cleared = row_count;
  perform pg_catalog.set_config('private.meet_consent_proof_sweep', '', true);
  return cleared;
end;
$$;
revoke all on function private.sweep_meet_consent_proof_accounts(integer)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.sweep_meet_consent_proof_accounts(integer) only clears account ids that name no account, at most 500 rows per call, and is called by the server-side proof purge job.
grant execute on function private.sweep_meet_consent_proof_accounts(integer)
  to service_role;

commit;
