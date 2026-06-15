begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(5);

select ok(
  to_regprocedure('public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])') is not null,
  'habit tracker latest stats RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])',
    'execute'
  ),
  'authenticated users can execute habit tracker latest stats RPC'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])'::regprocedure
  ) like '%caller_member.user_id = auth.uid()%',
  'habit tracker latest stats RPC validates the caller workspace membership'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])'::regprocedure
  ) like '%target_member.user_id = p_user_id%',
  'habit tracker latest stats RPC constrains the requested user to a current workspace member'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])'::regprocedure
  ) like '%target_link.platform_user_id = target_member.user_id%'
    and pg_get_functiondef(
      'public.get_workspace_habit_tracker_latest_stats(uuid,uuid,uuid[])'::regprocedure
    ) like '%target_workspace_user.id = target_link.virtual_user_id%',
  'habit tracker latest stats RPC mirrors the linked workspace member selector'
);

select * from finish();

rollback;
