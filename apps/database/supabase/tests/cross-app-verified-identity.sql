begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);
insert into auth.users(id, email, email_confirmed_at) values
('00000000-0000-4000-8000-00000000e101', 'canonical@example.com', now()),
('00000000-0000-4000-8000-00000000e102', 'unconfirmed@example.com', null);
insert into public.users(id) values
('00000000-0000-4000-8000-00000000e101'),
('00000000-0000-4000-8000-00000000e102') on conflict do nothing;
select ok(not has_function_privilege('anon', 'public.generate_cross_app_token(uuid,text,text,integer,jsonb)', 'execute'), 'anon cannot mint session handoffs');
select ok(not has_function_privilege('anon', 'public.generate_cross_app_token(uuid,text,text,integer)', 'execute'), 'anon cannot mint legacy handoffs');
select ok(has_function_privilege('anon', 'public.validate_cross_app_token_with_session(text,text)', 'execute'), 'one-time bearer redemption remains available to anon');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e101","role":"authenticated"}', true);
select public.generate_cross_app_token('00000000-0000-4000-8000-00000000e101','cli','tasks',60,'{"email":"other@tuturuuu.com","user_id":"other","mfaTransfer":"signed-fixture"}') as token \gset
reset role;
select is((select session_data->>'email' from private.cross_app_tokens where token = :'token'), 'canonical@example.com', 'mint stores only confirmed auth email');
select is((select session_data->>'user_id' from private.cross_app_tokens where token = :'token'), '00000000-0000-4000-8000-00000000e101', 'mint binds session identity to subject');
select is((select session_data->>'mfaTransfer' from private.cross_app_tokens where token = :'token'), 'signed-fixture', 'mint preserves MFA transfer');
-- Model outstanding handoffs created before the migration.
update private.cross_app_tokens set session_data = '{"email":"stale@example.com","user_id":"other","mfaTransfer":"signed-fixture"}' where token = :'token';
set local role anon;
select session_data as redeemed from public.validate_cross_app_token_with_session(:'token', 'tasks') where user_id is not null \gset
reset role;
select is(:'redeemed'::jsonb->>'email', 'canonical@example.com', 'redemption re-derives old handoff email');
select is(:'redeemed'::jsonb->>'user_id', '00000000-0000-4000-8000-00000000e101', 'redemption re-derives old handoff subject');
select is((select user_id from public.validate_cross_app_token_with_session(:'token','tasks')), null::uuid, 'handoff stays single use');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e102","role":"authenticated"}', true);
select public.generate_cross_app_token('00000000-0000-4000-8000-00000000e102','cli','tasks',60,'{"email":"other@example.com"}') as unconfirmed \gset
reset role;
select is((select session_data->>'email' from private.cross_app_tokens where token=:'unconfirmed'), null::text, 'unconfirmed auth email grants no email identity');
select is((select session_data->>'email' from public.validate_cross_app_token_with_session(:'unconfirmed','tasks') where user_id is not null), null::text, 'unconfirmed redemption grants no email identity');
select is((select count(*) from private.cross_app_tokens where token=:'unconfirmed' and used_at is not null), 1::bigint, 'unconfirmed subject can still use identity-only handoff');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000e101","role":"authenticated"}', true);
select public.generate_cross_app_token('00000000-0000-4000-8000-00000000e101','cli','tasks',60) as legacy \gset
reset role;
select is((select session_data->>'email' from private.cross_app_tokens where token=:'legacy'), 'canonical@example.com', 'legacy overload stores canonical email');
update auth.users set email = 'current@example.com' where id='00000000-0000-4000-8000-00000000e101';
select is((select session_data->>'email' from public.validate_cross_app_token_with_session(:'legacy','tasks') where user_id is not null), 'current@example.com', 'redemption uses current Auth email after mailbox change');
select * from finish();
rollback;
