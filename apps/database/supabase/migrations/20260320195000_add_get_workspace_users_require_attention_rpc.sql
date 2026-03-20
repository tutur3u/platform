create or replace function public.get_workspace_users_require_attention(
  p_ws_id uuid,
  p_user_ids uuid[] default null,
  p_group_id uuid default null
)
returns table (
  user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct uf.user_id
  from public.user_feedbacks uf
  inner join public.workspace_users wu
    on wu.id = uf.user_id
  where uf.require_attention is true
    and wu.ws_id = p_ws_id
    and (
      p_user_ids is null
      or array_length(p_user_ids, 1) is null
      or uf.user_id = any(p_user_ids)
    )
    and (
      p_group_id is null
      or uf.group_id = p_group_id
    );
$$;

comment on function public.get_workspace_users_require_attention(uuid, uuid[], uuid) is
'Returns distinct workspace user IDs that have at least one require-attention feedback, optionally narrowed to a user-id subset and/or group.';
