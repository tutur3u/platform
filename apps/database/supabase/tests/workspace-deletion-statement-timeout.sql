begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(3);

-- PostgREST applies a called function's statement_timeout to the API request,
-- replacing the API role's 8-second limit that large cascading deletes exceed.
select ok(
  coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc
    where oid = 'public.delete_owned_workspace(uuid, uuid, text)'::regprocedure), false),
  'owner workspace deletion runs with a 60-second statement timeout'
);
select ok(
  coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc
    where oid = 'private.delete_owned_workspace_with_attendance_intent(uuid, uuid, text, jsonb)'::regprocedure), false),
  'attendance-aware owner deletion runs with a 60-second statement timeout'
);
select ok(
  coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc
    where oid = 'private.delete_workspace_with_attendance_intent(uuid, jsonb)'::regprocedure), false),
  'account-deletion workspace cleanup runs with a 60-second statement timeout'
);

select * from finish();
rollback;
