-- Owner-controlled rollback; restores the prior access contracts.
begin;

create or replace function public.insert_ai_chat_message(
    message text,
    chat_id uuid,
    source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text := message;
begin
  if char_length(v_content) > 10000
    or octet_length(v_content) > 40000 then
    raise exception 'ai_chat_message_content_too_large'
      using errcode = '22023';
  end if;

  insert into ai_chat_messages (chat_id, content, creator_id, role, metadata)
  values (
    chat_id,
    v_content,
    auth.uid(),
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
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
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
$function$;
revoke all on function public.insert_ai_chat_message(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.insert_ai_chat_message(text, uuid, text) to authenticated, service_role;
revoke all on function public.get_user_workspace_subscription_info(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_user_workspace_subscription_info(uuid) to service_role;
commit;
