begin;

create or replace function private.assign_workspace_user_referral(
  p_ws_id uuid,
  p_referrer_user_id uuid,
  p_referred_user_id uuid,
  p_actor_user_id uuid
)
returns table(
  status text,
  referral_promotion_id uuid,
  linked_promotion_id uuid
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_linked_promotion_id uuid := null;
  v_referred public.workspace_users%rowtype;
  v_referral_promotion_id uuid;
  v_referrer public.workspace_users%rowtype;
  v_settings public.workspace_settings%rowtype;
begin
  if p_referrer_user_id is null
    or p_referred_user_id is null
    or p_ws_id is null then
    return query select 'invalid_input'::text, null::uuid, null::uuid;
    return;
  end if;

  if p_referrer_user_id = p_referred_user_id then
    return query select 'self_referral'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_referrer
  from public.workspace_users
  where id = p_referrer_user_id
    and ws_id = p_ws_id
  for update;

  if not found then
    return query select 'referrer_not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referrer.archived is true then
    return query select 'referrer_archived'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_referred
  from public.workspace_users
  where id = p_referred_user_id
    and ws_id = p_ws_id
  for update;

  if not found then
    return query select 'referred_user_not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referred.archived is true then
    return query select 'referred_user_archived'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referred.referred_by = p_referrer_user_id then
    select id
    into v_referral_promotion_id
    from private.workspace_promotions
    where ws_id = p_ws_id
      and promo_type = 'REFERRAL'::public.promotion_type
      and owner_id = p_referrer_user_id
    limit 1;

    return query
      select
        'already_referred_to_referrer'::text,
        v_referral_promotion_id,
        null::uuid;
    return;
  end if;

  if v_referred.referred_by is not null then
    return query select 'target_already_referred'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_referrer.referred_by = p_referred_user_id then
    return query select 'cycle_detected'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
  into v_settings
  from public.workspace_settings
  where ws_id = p_ws_id;

  if not found then
    return query select 'settings_missing'::text, null::uuid, null::uuid;
    return;
  end if;

  select id
  into v_referral_promotion_id
  from private.workspace_promotions
  where ws_id = p_ws_id
    and promo_type = 'REFERRAL'::public.promotion_type
    and owner_id = p_referrer_user_id
  limit 1;

  if v_referral_promotion_id is null then
    begin
      insert into private.workspace_promotions (
        ws_id,
        owner_id,
        promo_type,
        value,
        code,
        name,
        description,
        use_ratio,
        creator_id
      )
      values (
        p_ws_id,
        p_referrer_user_id,
        'REFERRAL'::public.promotion_type,
        0,
        'REF',
        'Referral',
        'Referral Code for Referral System',
        true,
        p_actor_user_id
      )
      returning id into v_referral_promotion_id;
    exception
      when unique_violation then
        select id
        into v_referral_promotion_id
        from private.workspace_promotions
        where ws_id = p_ws_id
          and promo_type = 'REFERRAL'::public.promotion_type
          and owner_id = p_referrer_user_id
        limit 1;
    end;
  end if;

  update public.workspace_users
  set
    referred_by = p_referrer_user_id,
    updated_by = p_actor_user_id
  where id = p_referred_user_id
    and ws_id = p_ws_id
    and referred_by is null;

  if v_settings.referral_reward_type in (
    'RECEIVER'::public.referral_reward_type,
    'BOTH'::public.referral_reward_type
  ) and v_settings.referral_promotion_id is not null then
    insert into private.user_linked_promotions (user_id, promo_id)
    values (p_referred_user_id, v_settings.referral_promotion_id)
    on conflict (user_id, promo_id) do nothing;

    v_linked_promotion_id := v_settings.referral_promotion_id;
  end if;

  return query
    select
      'success'::text,
      v_referral_promotion_id,
      v_linked_promotion_id;
end;
$function$;

revoke all on function private.assign_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) from anon, authenticated, public;

grant execute on function private.assign_workspace_user_referral(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
