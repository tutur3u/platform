-- Rolls back the sweep_meet_consent_proof_accounts migration. The sweep
-- function is dropped and the proof update trigger returns to allowing only
-- the account-deletion change. Rows the sweep already cleared stay cleared.
begin;
set local lock_timeout = '5s';

drop function if exists private.sweep_meet_consent_proof_accounts(integer);

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
  raise exception 'Mira consent evidence is immutable' using errcode = '55000';
end;
$$;
revoke all on function private.protect_meet_consent_proof_update()
  from public, anon, authenticated, service_role;

commit;
