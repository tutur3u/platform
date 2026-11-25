begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);
-- RFC 7636 appendix B challenge.
\set challenge 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
\set uid '00000000-0000-4000-8000-00000000e301'
insert into auth.users(id, email, email_confirmed_at) values
(:'uid', 'worker-only-pkce@example.com', now());
insert into public.users(id) values (:'uid') on conflict do nothing;

select has_trigger('private', 'cross_app_tokens', 'enforce_worker_only_cross_app_pkce',
  'Worker-only PKCE fence is installed on cross_app_tokens');

-- The fence is deferred: each mint queues its check, and switching the
-- constraint to immediate runs it. A refused row is deleted afterwards so
-- its queued check finds nothing on the next switch.
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid'), true);
select public.generate_cross_app_token(:'uid'::uuid, 'web', 'mastermind', 60) as legacy4 \gset
reset role;
select throws_ok($$set constraints all immediate$$, '42501', null,
  'four-argument mint refuses mastermind without a challenge');
delete from private.cross_app_tokens where token = :'legacy4';

set local role authenticated;
select public.generate_cross_app_token(:'uid'::uuid, 'web', 'mastermind', 60, '{}'::jsonb) as legacy5 \gset
reset role;
select throws_ok($$set constraints all immediate$$, '42501', null,
  'five-argument mint refuses mastermind without a challenge');
delete from private.cross_app_tokens where token = :'legacy5';

set local role authenticated;
select public.generate_cross_app_token_pkce(:'uid'::uuid, 'web', 'mastermind', 60, '{}'::jsonb, null, null) as fallback \gset
reset role;
select throws_ok($$set constraints all immediate$$, '42501', null,
  'PKCE mint null-challenge fallback refuses mastermind');
delete from private.cross_app_tokens where token = :'fallback';

set local role authenticated;
select public.generate_cross_app_token_pkce(:'uid'::uuid, 'web', 'mastermind', 60, '{}'::jsonb, :'challenge', 'S256') as bound \gset
reset role;
select lives_ok($$set constraints all immediate$$,
  'challenge-bound mastermind handoff passes the fence');
set constraints all deferred;
select is((select code_challenge from private.cross_app_tokens where token = :'bound'), :'challenge',
  'challenge-bound mastermind handoff keeps its challenge');

set local role authenticated;
select public.generate_cross_app_token(:'uid'::uuid, 'web', 'tasks', 60) as unbound_tasks \gset
reset role;
select lives_ok($$set constraints all immediate$$,
  'other targets still mint legacy handoffs without a challenge');
set constraints all deferred;

-- Clearing the challenge of a Worker-only handoff is refused too.
alter table private.cross_app_tokens drop constraint cross_app_tokens_code_challenge_check;
update private.cross_app_tokens set code_challenge = null, code_challenge_method = null where token = :'bound';
select throws_ok($$set constraints all immediate$$, '42501', null,
  'stripping the challenge from a mastermind handoff is refused');
set constraints all deferred;
update private.cross_app_tokens set code_challenge = :'challenge', code_challenge_method = 'S256' where token = :'bound';
select lives_ok($$set constraints all immediate$$,
  'restoring the challenge clears the queued refusal');

-- A PostgREST mint commits as authenticated, so the deferred fence fires
-- after the security definer RPC has returned and runs as that role. These
-- checks switch to immediate before resetting the role to model that commit.
select ok(
  (select p.prosecdef from pg_proc p
   where p.oid = 'private.enforce_worker_only_cross_app_pkce()'::regprocedure),
  'Worker-only PKCE fence runs as its definer');
select ok(
  not has_function_privilege('authenticated',
    'private.enforce_worker_only_cross_app_pkce()', 'execute'),
  'authenticated cannot execute the Worker-only PKCE fence directly');
set constraints all deferred;

set local role authenticated;
select public.generate_cross_app_token(:'uid'::uuid, 'web', 'tasks', 60) as commit_tasks_legacy \gset
select lives_ok($$set constraints all immediate$$,
  'authenticated commit of a legacy tasks handoff passes the fence');
set constraints all deferred;

select public.generate_cross_app_token_pkce(:'uid'::uuid, 'web', 'tasks', 60, '{}'::jsonb, :'challenge', 'S256') as commit_tasks_pkce \gset
select lives_ok($$set constraints all immediate$$,
  'authenticated commit of a challenge-bound tasks handoff passes the fence');
set constraints all deferred;

select public.generate_cross_app_token_pkce(:'uid'::uuid, 'web', 'mastermind', 60, '{}'::jsonb, :'challenge', 'S256') as commit_bound \gset
select lives_ok($$set constraints all immediate$$,
  'authenticated commit of a challenge-bound mastermind handoff passes the fence');
set constraints all deferred;

select public.generate_cross_app_token(:'uid'::uuid, 'web', 'mastermind', 60) as commit_legacy \gset
select throws_ok($$set constraints all immediate$$, '42501',
  'Worker-only cross-app targets require a PKCE challenge',
  'authenticated commit of an unbound mastermind handoff hits the fence, not a permission error');
reset role;
delete from private.cross_app_tokens where token = :'commit_legacy';
set constraints all immediate;

select * from finish();
rollback;
