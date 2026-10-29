-- Align database-owned AI chat and account lifecycle access.
begin;

create or replace function public.insert_ai_chat_message(
    message text,
    chat_id uuid,
    source text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_content text := message;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'ai_chat_access_denied' using errcode = '42501';
  end if;
  perform 1 from public.ai_chats chat
    where chat.id = $2 and chat.creator_id = v_user_id
    for share;
  if not found then
    raise exception 'ai_chat_access_denied' using errcode = '42501';
  end if;

  if char_length(v_content) > 10000
    or octet_length(v_content) > 40000 then
    raise exception 'ai_chat_message_content_too_large'
      using errcode = '22023';
  end if;

  insert into public.ai_chat_messages (chat_id, content, creator_id, role, metadata)
  values (
    chat_id,
    v_content,
    v_user_id,
    'USER',
    jsonb_build_object('source', coalesce(source, 'Unknown'))
  );
end;
$$;

create or replace function public.get_user_workspace_subscription_info(
  _user_id uuid
)
returns table(
  ws_id uuid,
  ws_name text,
  ws_personal boolean,
  member_count bigint,
  polar_subscription_id text,
  subscription_tier text,
  pricing_model text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return query
  select
    workspace.id as ws_id,
    coalesce(workspace.name, 'Unnamed Workspace') as ws_name,
    workspace.personal as ws_personal,
    (
      select count(*)
      from public.workspace_members member_count_rows
      where member_count_rows.ws_id = workspace.id
    ) as member_count,
    subscription.polar_subscription_id,
    product.tier::text as subscription_tier,
    product.pricing_model::text as pricing_model
  from public.workspace_members member
  join public.workspaces workspace
    on workspace.id = member.ws_id
  left join public.workspace_subscriptions subscription
    on subscription.ws_id = workspace.id
   and subscription.status in ('active', 'trialing', 'past_due')
  left join private.workspace_subscription_products product
    on product.id = subscription.product_id
  where member.user_id = _user_id
    and workspace.id != '00000000-0000-0000-0000-000000000000';
end;
$function$;

revoke all on function public.insert_ai_chat_message(text, uuid, text) from public, anon;
grant execute on function public.insert_ai_chat_message(text, uuid, text) to authenticated, service_role;
commit;
