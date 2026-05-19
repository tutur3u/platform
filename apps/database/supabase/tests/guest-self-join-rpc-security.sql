begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(10);

select ok(
  to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)') is not null,
  'guest self-join candidate RPC exists with current two-argument signature'
);

select ok(
  to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid, text, text)') is null,
  'legacy caller-supplied email overload is absent'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = to_regprocedure(
      'public.resolve_guest_self_join_candidate(uuid, uuid)'
    )::oid
  ),
  'guest self-join candidate RPC remains security definer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_guest_self_join_candidate(uuid, uuid)',
    'execute'
  ),
  'anon cannot execute guest self-join candidate RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_guest_self_join_candidate(uuid, uuid)',
    'execute'
  ),
  'authenticated can execute guest self-join candidate RPC'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)')::oid
  ) like '%auth.uid()%',
  'guest self-join candidate RPC binds requests to auth.uid()'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)')::oid
  ) like '%auth.users%',
  'guest self-join candidate RPC resolves identity from Supabase Auth'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)')::oid
  ) like '%email_confirmed_at%',
  'guest self-join candidate RPC requires a verified auth email'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)')::oid
  ) like '%ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL%',
  'guest self-join candidate RPC checks the workspace self-join feature flag'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_guest_self_join_candidate(uuid, uuid)')::oid
  ) not like '%user_private_details%',
  'guest self-join candidate RPC does not treat editable private profile email as identity proof'
);

select * from finish();

rollback;
