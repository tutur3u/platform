drop function if exists public.resolve_guest_self_join_candidate(uuid, uuid, text, text);

create or replace function public.resolve_guest_self_join_candidate(
  p_ws_id uuid,
  p_user_id uuid
)
returns table(
  eligible boolean,
  reason text,
  virtual_user_id uuid,
  matched_email_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_user_id uuid;
  v_auth_email text;
  v_auth_email_confirmed_at timestamp with time zone;
  v_candidate_id uuid;
  v_candidate_linked_to_other boolean;
  v_guest_self_join_enabled boolean;
begin
  v_request_user_id := auth.uid();

  if v_request_user_id is null then
    return query
    select false, 'unauthorized', null::uuid, null::text;
    return;
  end if;

  if p_user_id is distinct from v_request_user_id then
    return query
    select false, 'forbidden', null::uuid, null::text;
    return;
  end if;

  select coalesce(lower(trim(wc.value)) = 'true', false)
  into v_guest_self_join_enabled
  from public.workspace_configs wc
  where wc.ws_id = p_ws_id
    and wc.id = 'ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL';

  if not coalesce(v_guest_self_join_enabled, false) then
    return query
    select false, 'guest_self_join_disabled', null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_user_id
  ) then
    return query
    select false, 'already_member', null::uuid, null::text;
    return;
  end if;

  select
    nullif(lower(trim(auth_user.email)), ''),
    auth_user.email_confirmed_at
  into
    v_auth_email,
    v_auth_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = v_request_user_id
  limit 1;

  if v_auth_email is null then
    return query
    select false, 'no_email', null::uuid, null::text;
    return;
  end if;

  if v_auth_email_confirmed_at is null then
    return query
    select false, 'email_not_verified', null::uuid, null::text;
    return;
  end if;

  with ranked_candidates as (
    select
      wu.id,
      coalesce(wu.updated_at, wu.created_at) as freshness,
      exists (
        select 1
        from public.workspace_user_linked_users wulu
        where wulu.ws_id = p_ws_id
          and wulu.virtual_user_id = wu.id
      ) as linked_to_any_user,
      exists (
        select 1
        from public.workspace_user_linked_users wulu
        where wulu.ws_id = p_ws_id
          and wulu.virtual_user_id = wu.id
          and wulu.platform_user_id = p_user_id
      ) as already_linked_to_platform_user
    from public.workspace_users wu
    where wu.ws_id = p_ws_id
      and wu.email is not null
      and trim(wu.email) <> ''
      and lower(trim(wu.email)) = v_auth_email
      and coalesce(wu.archived, false) = false
  )
  select
    rc.id,
    (rc.linked_to_any_user and not rc.already_linked_to_platform_user)
  into
    v_candidate_id,
    v_candidate_linked_to_other
  from ranked_candidates rc
  order by
    case
      when rc.already_linked_to_platform_user then 0
      when not rc.linked_to_any_user then 1
      else 2
    end,
    rc.freshness desc,
    rc.id
  limit 1;

  if v_candidate_id is null then
    return query
    select false, 'no_matching_workspace_user', null::uuid, null::text;
    return;
  end if;

  if v_candidate_linked_to_other then
    return query
    select false, 'workspace_user_linked_to_other_platform_user', null::uuid, null::text;
    return;
  end if;

  return query
  select
    true,
    'eligible',
    v_candidate_id,
    'auth'::text;
end;
$$;

comment on function public.resolve_guest_self_join_candidate(uuid, uuid) is
'Resolves guest self-join only for the current authenticated user, enabled workspaces, and the user''s verified Supabase Auth email.';

revoke all on function public.resolve_guest_self_join_candidate(uuid, uuid) from public;
revoke all on function public.resolve_guest_self_join_candidate(uuid, uuid) from anon;
grant execute on function public.resolve_guest_self_join_candidate(uuid, uuid) to authenticated;
