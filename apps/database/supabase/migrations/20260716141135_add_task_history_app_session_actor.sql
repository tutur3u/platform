-- Internal satellite app sessions are authenticated by Tuturuuu rather than by
-- Supabase, so auth.uid() is intentionally NULL when an admin-backed client
-- invokes get_task_history(). Keep the existing caller-scoped RPC unchanged and
-- expose a service-role-only wrapper that supplies the already-verified actor.

create or replace function public.get_task_history_for_actor(
  p_ws_id uuid,
  p_task_id uuid,
  p_actor_user_id uuid,
  p_limit int default 50,
  p_offset int default 0,
  p_change_type text default null,
  p_field_name text default null
)
returns table (
  id uuid,
  task_id uuid,
  task_name text,
  changed_by uuid,
  changed_at timestamptz,
  change_type text,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  user_id uuid,
  user_display_name text,
  user_avatar_url text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using
      message = 'get_task_history_for_actor requires service role';
  end if;

  if p_actor_user_id is null then
    raise invalid_parameter_value using
      message = 'Task history actor is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  return query
  select *
  from public.get_task_history(
    p_ws_id,
    p_task_id,
    p_limit,
    p_offset,
    p_change_type,
    p_field_name
  );
end;
$function$;

revoke all on function public.get_task_history_for_actor(
  uuid,
  uuid,
  uuid,
  int,
  int,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.get_task_history_for_actor(
  uuid,
  uuid,
  uuid,
  int,
  int,
  text,
  text
) to service_role;

comment on function public.get_task_history_for_actor(
  uuid,
  uuid,
  uuid,
  int,
  int,
  text,
  text
) is 'Service-role-only task history wrapper for verified Tuturuuu app-session actors.';
