set check_function_bodies = off;

create or replace function public.authorize_workspace_user_audit_access(
  p_ws_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  request_role text := auth.role();
  request_user_id uuid := auth.uid();
begin
  if request_role = 'service_role' then
    return;
  end if;

  if request_user_id is null then
    raise exception 'workspace_user_audit_auth_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workspace_members workspace_member
    where workspace_member.ws_id = p_ws_id
      and workspace_member.user_id = request_user_id
  ) then
    raise exception 'workspace_user_audit_permission_denied' using errcode = '42501';
  end if;

  if not public.has_workspace_permission(
    p_ws_id,
    request_user_id,
    'manage_workspace_audit_logs'
  ) then
    raise exception 'workspace_user_audit_permission_denied' using errcode = '42501';
  end if;
end;
$function$;

revoke execute on function public.authorize_workspace_user_audit_access(uuid) from public;
revoke execute on function public.authorize_workspace_user_audit_access(uuid) from anon;
revoke execute on function public.authorize_workspace_user_audit_access(uuid) from authenticated;
grant execute on function public.authorize_workspace_user_audit_access(uuid) to service_role;

create or replace function public.workspace_user_audit_filtered_feed(
  p_ws_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_event_kind text default 'all',
  p_source text default 'all',
  p_affected_user_query text default null,
  p_actor_query text default null
)
returns table (
  audit_record_id bigint,
  event_kind text,
  occurred_at timestamptz,
  source text,
  affected_user_id uuid,
  affected_user_name text,
  affected_user_email text,
  actor_auth_uid uuid,
  actor_workspace_user_id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  changed_fields text[],
  before jsonb,
  after jsonb
)
language sql
security definer
set search_path = public, audit
as $function$
  with authorized as materialized (
    select public.authorize_workspace_user_audit_access(p_ws_id)
  )
  select feed.*
  from authorized
  cross join public.workspace_user_audit_feed(p_ws_id, p_start, p_end) as feed
  where (p_event_kind is null or p_event_kind = 'all' or feed.event_kind = p_event_kind)
    and (p_source is null or p_source = 'all' or feed.source = p_source)
    and (
      p_affected_user_query is null
      or btrim(p_affected_user_query) = ''
      or coalesce(feed.affected_user_name, '') ilike '%' || btrim(p_affected_user_query) || '%'
      or coalesce(feed.affected_user_email, '') ilike '%' || btrim(p_affected_user_query) || '%'
    )
    and (
      p_actor_query is null
      or btrim(p_actor_query) = ''
      or coalesce(feed.actor_name, '') ilike '%' || btrim(p_actor_query) || '%'
      or coalesce(feed.actor_email, '') ilike '%' || btrim(p_actor_query) || '%'
      or coalesce(feed.actor_auth_uid::text, '') ilike '%' || btrim(p_actor_query) || '%'
    );
$function$;

revoke execute on function public.workspace_user_audit_feed(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.workspace_user_audit_feed(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.workspace_user_audit_feed(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.workspace_user_audit_feed(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function public.workspace_user_audit_filtered_feed(uuid, timestamptz, timestamptz, text, text, text, text) from public;
revoke execute on function public.workspace_user_audit_filtered_feed(uuid, timestamptz, timestamptz, text, text, text, text) from anon;
grant execute on function public.workspace_user_audit_filtered_feed(uuid, timestamptz, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.workspace_user_audit_filtered_feed(uuid, timestamptz, timestamptz, text, text, text, text) to service_role;

revoke execute on function public.list_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text, integer, integer) from public;
revoke execute on function public.list_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text, integer, integer) from anon;
grant execute on function public.list_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.list_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text, integer, integer) to service_role;

revoke execute on function public.summarize_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text) from public;
revoke execute on function public.summarize_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text) from anon;
grant execute on function public.summarize_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.summarize_workspace_user_audit_feed(uuid, timestamptz, timestamptz, text, text, text, text) to service_role;

revoke execute on function public.list_workspace_user_audit_bucket_counts(uuid, timestamptz, timestamptz, text, text, text, text, text) from public;
revoke execute on function public.list_workspace_user_audit_bucket_counts(uuid, timestamptz, timestamptz, text, text, text, text, text) from anon;
grant execute on function public.list_workspace_user_audit_bucket_counts(uuid, timestamptz, timestamptz, text, text, text, text, text) to authenticated;
grant execute on function public.list_workspace_user_audit_bucket_counts(uuid, timestamptz, timestamptz, text, text, text, text, text) to service_role;

revoke execute on function public.get_workspace_user_audit_view(uuid, timestamptz, timestamptz, text, text, text, text, text, integer, integer) from public;
revoke execute on function public.get_workspace_user_audit_view(uuid, timestamptz, timestamptz, text, text, text, text, text, integer, integer) from anon;
grant execute on function public.get_workspace_user_audit_view(uuid, timestamptz, timestamptz, text, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.get_workspace_user_audit_view(uuid, timestamptz, timestamptz, text, text, text, text, text, integer, integer) to service_role;
