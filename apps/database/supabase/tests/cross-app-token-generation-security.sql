begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(10);

insert into public.users (id)
values
  ('00000000-0000-0000-0000-00000000ca11'),
  ('00000000-0000-0000-0000-00000000b0b0')
on conflict (id) do nothing;

select ok(
  has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer)',
    'execute'
  ),
  'authenticated can execute the legacy cross-app token generator overload'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'execute'
  ),
  'authenticated can execute the session-data cross-app token generator overload'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.generate_cross_app_token(uuid,text,text,integer)',
    'execute'
  ),
  'anon cannot execute the legacy cross-app token generator overload'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.generate_cross_app_token(uuid,text,text,integer,jsonb)',
    'execute'
  ),
  'anon cannot execute the session-data cross-app token generator overload'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-00000000ca11',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-00000000ca11',
      'web',
      'tulearn',
      300
    )
  $$,
  'authenticated callers can mint legacy cross-app tokens for themselves'
);

select lives_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-00000000ca11',
      'web',
      'tulearn',
      300,
      null::jsonb
    )
  $$,
  'authenticated callers can mint session-data cross-app tokens for themselves'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-00000000b0b0',
      'web',
      'tulearn',
      300
    )
  $$,
  '42501',
  'Cannot generate cross-app token for another user',
  'legacy overload rejects caller-supplied victim user IDs'
);

select throws_ok(
  $$
    select public.generate_cross_app_token(
      '00000000-0000-0000-0000-00000000b0b0',
      'web',
      'tulearn',
      300,
      null::jsonb
    )
  $$,
  '42501',
  'Cannot generate cross-app token for another user',
  'session-data overload rejects caller-supplied victim user IDs'
);

select throws_ok(
  $$
    select public.revoke_all_cross_app_tokens(
      '00000000-0000-0000-0000-00000000b0b0'
    )
  $$,
  '42501',
  'Cannot revoke cross-app tokens for another user',
  'token revocation is also bound to the authenticated caller'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.cross_app_tokens
    where user_id = '00000000-0000-0000-0000-00000000b0b0'
      and target_app = 'tulearn'
  ),
  0,
  'forged victim cross-app token attempts do not insert token rows'
);

select * from finish();

rollback;
