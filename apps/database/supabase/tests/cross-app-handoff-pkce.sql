begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);
-- RFC 7636 appendix B: verifier and its S256 challenge.
\set verifier 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
\set challenge 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
\set wrong_verifier 'aBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
insert into auth.users(id, email, email_confirmed_at) values
('00000000-0000-4000-8000-00000000e201', 'pkce@example.com', now());
insert into public.users(id) values
('00000000-0000-4000-8000-00000000e201') on conflict do nothing;

select ok(not has_function_privilege('anon', 'public.generate_cross_app_token_pkce(uuid,text,text,integer,jsonb,text,text)', 'execute'), 'anon cannot mint PKCE handoffs');
select ok(has_function_privilege('authenticated', 'public.generate_cross_app_token_pkce(uuid,text,text,integer,jsonb,text,text)', 'execute'), 'signed-in users mint PKCE handoffs');
select ok(not has_function_privilege('service_role', 'public.generate_cross_app_token_pkce(uuid,text,text,integer,jsonb,text,text)', 'execute'), 'service_role cannot mint PKCE handoffs');
select ok(not has_function_privilege('anon', 'public.validate_cross_app_token_with_session_pkce(text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.validate_cross_app_token_with_session_pkce(text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.validate_cross_app_token_with_session_pkce(text,text,text)', 'execute'),
  'verifier redemption is service_role-only');
select ok(not has_function_privilege('anon', 'private.redeem_cross_app_token(text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.redeem_cross_app_token(text,text,text)', 'execute'),
  'redemption helper is not client executable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e201","role":"authenticated"}', true);
select public.generate_cross_app_token_pkce('00000000-0000-4000-8000-00000000e201','cli','tasks',60,'{}'::jsonb,:'challenge','S256') as bound \gset
select throws_ok(
  format($$select public.generate_cross_app_token_pkce('00000000-0000-4000-8000-00000000e201','cli','tasks',60,'{}'::jsonb,%L,'plain')$$, :'challenge'),
  '22023', null, 'plain challenge method is refused');
select throws_ok(
  $$select public.generate_cross_app_token_pkce('00000000-0000-4000-8000-00000000e201','cli','tasks',60,'{}'::jsonb,'too-short','S256')$$,
  '22023', null, 'malformed challenge is refused');
select throws_ok(
  $$select public.generate_cross_app_token_pkce('00000000-0000-4000-8000-00000000e201','cli','tasks',60,'{}'::jsonb,null,'S256')$$,
  '22023', null, 'method without challenge is refused');
select public.generate_cross_app_token_pkce('00000000-0000-4000-8000-00000000e201','cli','tasks',60,'{}'::jsonb,null,null) as unbound \gset
reset role;

select is((select code_challenge || ':' || code_challenge_method from private.cross_app_tokens where token = :'bound'), :'challenge' || ':S256', 'mint stores the S256 challenge');
select is((select code_challenge from private.cross_app_tokens where token = :'unbound'), null::text, 'null challenge mints a legacy handoff');
select throws_ok(
  $$update private.cross_app_tokens set code_challenge_method = 'S256' where code_challenge is null and user_id = '00000000-0000-4000-8000-00000000e201'$$,
  '23514', null, 'method cannot be stored without a challenge');

set local role anon;
select is((select user_id from public.validate_cross_app_token_with_session(:'bound', 'tasks')), null::uuid, 'anonymous redemption refuses a challenge-bound token');
reset role;
set local role service_role;
select is((select user_id from public.validate_cross_app_token_with_session_pkce(:'bound', 'tasks', :'wrong_verifier')), null::uuid, 'wrong verifier is refused');
select is((select user_id from public.validate_cross_app_token_with_session_pkce(:'bound', 'tasks', 'short')), null::uuid, 'malformed verifier is refused');
reset role;
select is((select used_at from private.cross_app_tokens where token = :'bound'), null::timestamptz, 'failed verification consumes nothing');
set local role service_role;
select is((select user_id from public.validate_cross_app_token_with_session_pkce(:'bound', 'tasks', :'verifier')), '00000000-0000-4000-8000-00000000e201'::uuid, 'matching verifier redeems the handoff');
select is((select user_id from public.validate_cross_app_token_with_session_pkce(:'bound', 'tasks', :'verifier')), null::uuid, 'challenge-bound handoff stays single use');
select is((select user_id from public.validate_cross_app_token_with_session_pkce(:'unbound', 'tasks', :'verifier')), null::uuid, 'verifier for a handoff minted without a challenge is refused');
reset role;
select is((select used_at from private.cross_app_tokens where token = :'unbound'), null::timestamptz, 'downgrade refusal consumes nothing');
set local role anon;
select is((select user_id from public.validate_cross_app_token_with_session(:'unbound', 'tasks')), '00000000-0000-4000-8000-00000000e201'::uuid, 'legacy handoff still redeems without a verifier');
reset role;
select * from finish();
rollback;
