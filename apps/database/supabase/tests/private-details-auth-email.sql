-- SR-926: a signed-in user must not be able to set user_private_details.email
-- to an address Auth never confirmed. Client-role changes are ignored; Auth
-- sync and service_role writes still apply.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('92600000-0000-4000-8000-000000000001', 'sr926-owner@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('92600000-0000-4000-8000-000000000002', 'sr926-norow@example.com', now(), '{}'::jsonb, '{}'::jsonb);
-- The Auth sync trigger creates the profile rows; drop one to probe INSERT.
delete from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000002';

select is(
  (select email from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000001'),
  'sr926-owner@example.com',
  'Auth sync seeds the private email'
);
select ok(
  exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.user_private_details'::regclass
      and t.tgname = 'enforce_auth_synced_private_details_email'
      and not t.tgisinternal
  ),
  'email guard trigger is installed'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'private.keep_auth_synced_private_details_email()'::regprocedure),
  'guard runs as the caller, so current_user is the client role'
);
select ok(
  not has_function_privilege('authenticated', 'private.keep_auth_synced_private_details_email()', 'EXECUTE'),
  'guard function grants no EXECUTE to authenticated'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92600000-0000-4000-8000-000000000001","role":"authenticated","email":"sr926-owner@example.com"}', true);

select lives_ok(
  $$update public.user_private_details set email = 'sr926-forged@attacker.example'
    where user_id = '92600000-0000-4000-8000-000000000001'$$,
  'authenticated email update does not error (it is ignored)'
);
select is(
  (select email from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000001'),
  'sr926-owner@example.com',
  'NEGATIVE: authenticated cannot change its own private email'
);

select lives_ok(
  $$update public.user_private_details
    set email = 'sr926-forged@attacker.example', full_name = 'SR926 Owner'
    where user_id = '92600000-0000-4000-8000-000000000001'$$,
  'mixed update by authenticated succeeds'
);
select results_eq(
  $$select email, full_name from public.user_private_details
    where user_id = '92600000-0000-4000-8000-000000000001'$$,
  $$values ('sr926-owner@example.com'::text, 'SR926 Owner'::text)$$,
  'NEGATIVE: email stays the Auth copy while other columns still update'
);

select set_config('request.jwt.claims',
  '{"sub":"92600000-0000-4000-8000-000000000002","role":"authenticated","email":"sr926-norow@example.com"}', true);
select throws_ok(
  $$insert into public.user_private_details (user_id, email)
    values ('92600000-0000-4000-8000-000000000002', 'sr926-forged@attacker.example')$$,
  '42501',
  null,
  'NEGATIVE: authenticated cannot insert a private row with a chosen email'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.user_private_details set email = 'sr926-admin-set@example.com'
  where user_id = '92600000-0000-4000-8000-000000000001';
reset role;
select is(
  (select email from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000001'),
  'sr926-admin-set@example.com',
  'service_role can still write the private email'
);

update auth.users set email = 'sr926-renamed@example.com'
  where id = '92600000-0000-4000-8000-000000000001';
select is(
  (select email from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000001'),
  'sr926-renamed@example.com',
  'Auth email changes still sync into the private row'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- anon may be refused outright (grant or RLS); either outcome is a pass as
-- long as the stored value is unchanged.
do $$
begin
  update public.user_private_details set email = 'sr926-forged@attacker.example'
    where user_id = '92600000-0000-4000-8000-000000000001';
exception when others then
  null;
end;
$$;
reset role;
select is(
  (select email from public.user_private_details where user_id = '92600000-0000-4000-8000-000000000001'),
  'sr926-renamed@example.com',
  'NEGATIVE: anon cannot change a private email'
);

select * from finish();
rollback;
