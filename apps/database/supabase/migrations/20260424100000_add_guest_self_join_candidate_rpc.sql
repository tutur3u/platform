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
  v_private_email text;
  v_selected_email text;
  v_candidate_id uuid;
  v_candidate_linked_to_other boolean;
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

  if exists (
    select 1
    from workspace_members wm
    where wm.ws_id = p_ws_id
      and wm.user_id = p_user_id
  ) then
    return query
    select false, 'already_member', null::uuid, null::text;
    return;
  end if;

  v_auth_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');

  select nullif(lower(trim(upd.email)), '')
  into v_private_email
  from user_private_details upd
  where upd.user_id = v_request_user_id
  limit 1;

  if v_auth_email is null and v_private_email is null then
    return query
    select false, 'no_email', null::uuid, null::text;
    return;
  end if;

  with candidate_emails as (
    select v_auth_email as email_norm
    where v_auth_email is not null
    union
    select v_private_email
    where v_private_email is not null
  ),
  ranked_candidates as (
    select
      wu.id,
      lower(trim(wu.email)) as email_norm,
      wu.archived,
      coalesce(wu.updated_at, wu.created_at) as freshness,
      exists (
        select 1
        from workspace_user_linked_users wulu
        where wulu.ws_id = p_ws_id
          and wulu.virtual_user_id = wu.id
      ) as linked_to_any_user,
      exists (
        select 1
        from workspace_user_linked_users wulu
        where wulu.ws_id = p_ws_id
          and wulu.virtual_user_id = wu.id
          and wulu.platform_user_id = p_user_id
      ) as already_linked_to_platform_user
    from workspace_users wu
    join candidate_emails ce
      on ce.email_norm = lower(trim(wu.email))
    where wu.ws_id = p_ws_id
      and wu.email is not null
      and trim(wu.email) <> ''
      and coalesce(wu.archived, false) = false
  )
  select
    rc.id,
    rc.email_norm,
    (rc.linked_to_any_user and not rc.already_linked_to_platform_user)
  into
    v_candidate_id,
    v_selected_email,
    v_candidate_linked_to_other
  from ranked_candidates rc
  order by
    case
      when rc.already_linked_to_platform_user then 0
      when not rc.linked_to_any_user then 1
      else 2
    end,
    case when rc.archived then 1 else 0 end,
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
    case
      when v_selected_email = v_auth_email and v_selected_email = v_private_email then 'both'
      when v_selected_email = v_auth_email then 'auth'
      when v_selected_email = v_private_email then 'private'
      else 'unknown'
    end;
end;
$$;

revoke all on function public.resolve_guest_self_join_candidate(uuid, uuid) from public;
revoke all on function public.resolve_guest_self_join_candidate(uuid, uuid) from anon;
grant execute on function public.resolve_guest_self_join_candidate(uuid, uuid) to authenticated;
