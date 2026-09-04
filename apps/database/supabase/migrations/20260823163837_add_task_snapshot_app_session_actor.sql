-- Satellite app sessions are verified by Tuturuuu rather than Supabase, so
-- auth.uid() is NULL when their admin-backed client calls the historical
-- snapshot RPCs. Keep the existing authenticated RPCs unchanged and expose
-- service-role-only wrappers that install the already-verified actor for the
-- duration of each call.

create or replace function public.get_task_snapshot_at_history_for_actor(
  p_actor_user_id uuid,
  p_ws_id uuid,
  p_task_id uuid,
  p_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise insufficient_privilege using
      message = 'get_task_snapshot_at_history_for_actor requires service role';
  end if;

  if p_actor_user_id is null then
    raise invalid_parameter_value using
      message = 'Task snapshot actor is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  return public.get_task_snapshot_at_history(
    p_ws_id,
    p_task_id,
    p_history_id
  );
end;
$function$;

create or replace function public.get_task_relationships_at_snapshot_for_actor(
  p_actor_user_id uuid,
  p_ws_id uuid,
  p_task_id uuid,
  p_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise insufficient_privilege using
      message = 'get_task_relationships_at_snapshot_for_actor requires service role';
  end if;

  if p_actor_user_id is null then
    raise invalid_parameter_value using
      message = 'Task snapshot actor is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  return public.get_task_relationships_at_snapshot(
    p_ws_id,
    p_task_id,
    p_history_id
  );
end;
$function$;

revoke all on function public.get_task_snapshot_at_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

revoke all on function public.get_task_relationships_at_snapshot_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.get_task_snapshot_at_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

grant execute on function public.get_task_relationships_at_snapshot_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

comment on function public.get_task_snapshot_at_history_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) is 'Service-role-only task snapshot wrapper for verified Tuturuuu app-session actors.';

comment on function public.get_task_relationships_at_snapshot_for_actor(
  uuid,
  uuid,
  uuid,
  uuid
) is 'Service-role-only task relationship snapshot wrapper for verified Tuturuuu app-session actors.';
