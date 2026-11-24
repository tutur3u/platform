begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.sid(n integer) returns uuid language sql immutable as
  $$ select ('e5100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

select set_config('request.jwt.claims', '{}', true);
-- One account that exists; accounts 2 and 3 never existed in auth.users.
insert into auth.users(id) values (pg_temp.sid(1));

-- Proof rows written as by the erase routine.
insert into private.meet_consent_proofs(
  kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
  notice_version, text_hash, decided_at, erase_reason
) values
  ('mira_choice', pg_temp.sid(21), pg_temp.sid(11), pg_temp.sid(1), pg_temp.sid(41), 'on', 1, 'v1', repeat('a', 64), now(), 'meeting_deleted'),
  ('mira_choice', pg_temp.sid(21), pg_temp.sid(11), pg_temp.sid(2), pg_temp.sid(42), 'off', 1, 'v1', repeat('b', 64), now(), 'meeting_deleted'),
  -- A guest row: no account id, a server-issued guest id.
  ('mira_choice', pg_temp.sid(21), pg_temp.sid(11), null, pg_temp.sid(43), 'on', 1, 'v1', repeat('c', 64), now(), 'meeting_deleted');
-- 501 more rows naming a missing account, to check the batch bound.
insert into private.meet_consent_proofs(
  kind, meeting_id, ws_id, user_id, participant_ref, choice, revision,
  notice_version, decided_at, erase_reason
)
select 'mira_choice', pg_temp.sid(22), pg_temp.sid(11), pg_temp.sid(3),
  gen_random_uuid(), 'off', 0, 'v1', now(), 'workspace_deleted'
from generate_series(1, 501);

create temporary table before_sweep as
  select * from private.meet_consent_proofs;

-- Access.
select ok(
  (select prosecdef from pg_proc where oid = 'private.sweep_meet_consent_proof_accounts(integer)'::regprocedure),
  'the sweep is security definer'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog, pg_temp', 'lock_timeout=5s']
   from pg_proc where oid = 'private.sweep_meet_consent_proof_accounts(integer)'::regprocedure),
  'the sweep pins search_path and lock_timeout'
);
select ok(has_function_privilege('service_role', 'private.sweep_meet_consent_proof_accounts(integer)', 'EXECUTE'), 'the service role can run the sweep');
select ok(not has_function_privilege('authenticated', 'private.sweep_meet_consent_proof_accounts(integer)', 'EXECUTE'), 'authenticated cannot run the sweep');
select ok(not has_function_privilege('anon', 'private.sweep_meet_consent_proof_accounts(integer)', 'EXECUTE'), 'anon cannot run the sweep');
select ok(not has_function_privilege('public', 'private.sweep_meet_consent_proof_accounts(integer)', 'EXECUTE'), 'PUBLIC cannot run the sweep');
select ok(not has_function_privilege('service_role', 'private.protect_meet_consent_proof_update()', 'EXECUTE'), 'the proof update trigger function stays closed');

-- Batch bound: a call clears at most 500 rows, even when asked for more.
select is(private.sweep_meet_consent_proof_accounts(10000), 500, 'one call clears at most 500 rows');
select is(private.sweep_meet_consent_proof_accounts(1), 1, 'a smaller limit clears that many');
select is(private.sweep_meet_consent_proof_accounts(), 1, 'the next call clears the rest');

-- Missing accounts: account id and pseudonym cleared, nothing else changed.
select is(
  (select count(*)::int from private.meet_consent_proofs
   where user_id in (pg_temp.sid(2), pg_temp.sid(3))),
  0, 'no proof row names a missing account'
);
select is(
  (select count(*)::int from private.meet_consent_proofs p
   join before_sweep b on b.id = p.id
   where b.user_id in (pg_temp.sid(2), pg_temp.sid(3))
     and p.participant_ref is null
     and (to_jsonb(p) - 'user_id' - 'participant_ref')
       = (to_jsonb(b) - 'user_id' - 'participant_ref')),
  502, 'only the account id and its pseudonym are cleared'
);

-- An existing account and a guest row are untouched.
select is(
  (select participant_ref from private.meet_consent_proofs where user_id = pg_temp.sid(1)),
  pg_temp.sid(41), 'an existing account keeps its proof row'
);
select is(
  (select count(*)::int from private.meet_consent_proofs
   where user_id is null and participant_ref = pg_temp.sid(43)),
  1, 'a guest row keeps its guest id'
);

-- Idempotent: nothing left, and another call changes nothing.
create temporary table after_sweep as
  select * from private.meet_consent_proofs;
select is(private.sweep_meet_consent_proof_accounts(), 0, 'a repeat call clears nothing');
select is(
  (select count(*)::int from private.meet_consent_proofs p
   join after_sweep a on a.id = p.id
   where to_jsonb(p) = to_jsonb(a)),
  (select count(*)::int from after_sweep),
  'a repeat call leaves every row unchanged'
);

-- The sweep setting never lets a row of an existing account change.
select pg_catalog.set_config('private.meet_consent_proof_sweep', 'on', true);
select throws_ok(
  $$ update private.meet_consent_proofs set user_id = null, participant_ref = null
     where user_id = 'e5100000-0000-4000-8000-000000000001' $$,
  '55000', 'Mira consent evidence is immutable',
  'an existing account id cannot be cleared'
);
-- Nor any other column of a row whose account is missing.
insert into private.meet_consent_proofs(
  kind, meeting_id, user_id, choice, notice_version, decided_at, erase_reason
) values ('mira_choice', pg_temp.sid(23), pg_temp.sid(4), 'off', 'v1', now(), 'meeting_deleted');
select throws_ok(
  $$ update private.meet_consent_proofs set user_id = null, choice = 'on'
     where user_id = 'e5100000-0000-4000-8000-000000000004' $$,
  '55000', 'Mira consent evidence is immutable',
  'the sweep path cannot rewrite the choice'
);
select pg_catalog.set_config('private.meet_consent_proof_sweep', '', true);
-- Outside a sweep, clearing a missing account's id directly is refused.
select throws_ok(
  $$ update private.meet_consent_proofs set user_id = null, participant_ref = null
     where user_id = 'e5100000-0000-4000-8000-000000000004' $$,
  '55000', 'Mira consent evidence is immutable',
  'a direct clear outside the sweep is refused'
);
select is(private.sweep_meet_consent_proof_accounts(), 1, 'the sweep clears it');

-- Account deletion still clears proof rows through its trigger.
delete from auth.users where id = pg_temp.sid(1);
select is(
  (select count(*)::int from private.meet_consent_proofs where participant_ref = pg_temp.sid(41)),
  0, 'account deletion still clears the deleted account and its pseudonym'
);

select * from finish();
rollback;
