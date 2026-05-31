create or replace function private.chat_create_friend_request_by_email(
  p_ws_id uuid,
  p_actor_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, auth, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target_user_id uuid;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'chat_friend_email_invalid'
      using errcode = '22023';
  end if;

  select auth_user.id
  into v_target_user_id
  from auth.users auth_user
  where lower(auth_user.email) = v_email
  limit 1;

  if v_target_user_id is null then
    return jsonb_build_object('queued', true);
  end if;

  if v_target_user_id = p_actor_user_id then
    raise exception 'chat_friend_self_invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from private.chat_friend_requests request
    where request.status in ('pending', 'accepted')
      and (
        (
          request.requester_user_id = p_actor_user_id
          and request.recipient_user_id = v_target_user_id
        )
        or (
          request.requester_user_id = v_target_user_id
          and request.recipient_user_id = p_actor_user_id
        )
      )
  ) then
    begin
      insert into private.chat_friend_requests (
        requester_user_id,
        recipient_user_id
      )
      values (
        p_actor_user_id,
        v_target_user_id
      );
    exception
      when unique_violation then
        null;
    end;
  end if;

  return jsonb_build_object('queued', true);
end;
$$;

revoke all on function private.chat_create_friend_request_by_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.chat_create_friend_request_by_email(uuid, uuid, text) to service_role;
