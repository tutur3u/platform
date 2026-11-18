begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users(id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000e301', 'pkce-migration@example.com', now());
insert into public.users(id) values
  ('00000000-0000-4000-8000-00000000e301') on conflict do nothing;

select pg_get_constraintdef(oid) as live_def
from pg_constraint
where conrelid = 'private.cross_app_tokens'::regclass
  and conname = 'cross_app_tokens_code_challenge_check' \gset

-- Rehearse the migration against data that already violates the invariant.
alter table private.cross_app_tokens
  drop constraint cross_app_tokens_code_challenge_check;

insert into private.cross_app_tokens
  (user_id, token, expires_at, origin_app, target_app, code_challenge, code_challenge_method)
values
  ('00000000-0000-4000-8000-00000000e301', 'migration-violating', now() + interval '1 hour', 'cli', 'tasks', null, 'S256'),
  ('00000000-0000-4000-8000-00000000e301', 'migration-legacy', now() + interval '1 hour', 'cli', 'tasks', null, null),
  ('00000000-0000-4000-8000-00000000e301', 'migration-bound', now() + interval '1 hour', 'cli', 'tasks',
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'S256');

select lives_ok($$
  update private.cross_app_tokens
  set is_revoked = true,
      code_challenge_method = null
  where code_challenge is null
    and code_challenge_method is not null
$$, 'the normalization update runs against a violating row');

select lives_ok($$
  alter table private.cross_app_tokens
    add constraint cross_app_tokens_code_challenge_check check (
      (code_challenge is null and code_challenge_method is null)
      or (
        code_challenge_method = 'S256'
        and code_challenge is not null
        and code_challenge ~ '^[A-Za-z0-9_-]{43}$'
      )
    ) not valid
$$, 'the replacement constraint is added');

select lives_ok($$
  alter table private.cross_app_tokens
    validate constraint cross_app_tokens_code_challenge_check
$$, 'the constraint validates after the violating row is normalized');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'private.cross_app_tokens'::regclass
     and conname = 'cross_app_tokens_code_challenge_check'),
  :'live_def',
  'the rehearsed constraint matches the migrated constraint');

select is(
  (select is_revoked::text || ':' || coalesce(code_challenge_method, 'null')
   from private.cross_app_tokens where token = 'migration-violating'),
  'true:null',
  'the violating row is revoked and carries no method');

select is(
  (select count(*)::integer from private.cross_app_tokens
   where token in ('migration-legacy', 'migration-bound') and not is_revoked),
  2,
  'consistent legacy and bound rows are untouched');

select throws_ok($$
  update private.cross_app_tokens set code_challenge_method = 'S256'
  where token = 'migration-legacy'
$$, '23514', null, 'a method cannot be stored without a challenge');

select ok(
  (select pg_get_constraintdef(oid) like '%code_challenge IS NOT NULL%'
   from pg_constraint
   where conrelid = 'private.cross_app_tokens'::regclass
     and conname = 'cross_app_tokens_code_challenge_check'),
  'the constraint requires a non-null challenge with a method');

select * from finish();
rollback;
