-- Account benefits are service-only; Infrastructure authorizes the operator.
create table private.account_benefits (
  id uuid primary key, user_id uuid not null references public.users(id) on delete cascade,
  benefit_key text not null check (benefit_key = 'ai_credits' or benefit_key ~ '^(feature|early_access)\.[a-z][a-z0-9_.-]{0,79}$'),
  amount integer not null check (amount between 1 and 1000000),
  starts_at timestamptz not null default now(), expires_at timestamptz,
  revoked_at timestamptz, revoked_by uuid references public.users(id),
  granted_by uuid not null references public.users(id), reason text not null check (length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (benefit_key = 'ai_credits' or amount = 1),
  check (benefit_key <> 'ai_credits' or expires_at is null)
);
create index account_benefits_user_key on private.account_benefits(user_id, benefit_key) where revoked_at is null;
alter table private.account_benefits enable row level security;
revoke all on private.account_benefits from public, anon, authenticated;
grant select, insert, update on private.account_benefits to service_role;

create function private.account_personal_workspace(p_actor_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select ws.id from public.workspaces ws join public.workspace_members member on member.ws_id = ws.id
  where ws.personal and ws.creator_id=p_actor_id and coalesce(ws.deleted,false)=false and member.user_id = p_actor_id and member.type = 'MEMBER' limit 1
$$;
create function private.has_account_benefit(p_actor_id uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.account_benefits where user_id = p_actor_id and benefit_key = p_key
    and revoked_at is null and starts_at <= now() and (expires_at is null or expires_at > now()))
$$;
create function private.account_playgrounds_allowed(p_actor_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public._resolve_workspace_tier(private.account_personal_workspace(p_actor_id)) <> 'FREE', false)
    or private.has_account_benefit(p_actor_id, 'feature.learn.playgrounds')
$$;

-- A current, confirmed auth identity is required; profile/handoff emails cannot elevate a room.
create function private.meeting_programming_elevated(p_meeting_id uuid,p_owner_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_meetings m join auth.users identity on identity.id=m.creator_id
   where m.id=p_meeting_id and m.creator_id=p_owner_id and identity.email_confirmed_at is not null
     and lower(btrim(identity.email)) ~ '^[^@[:space:]]+@tuturuuu\.com$')
$$;
revoke all on function private.meeting_programming_elevated(uuid,uuid) from public,anon,authenticated;
grant execute on function private.meeting_programming_elevated(uuid,uuid) to service_role;

create function private.list_account_benefits(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by created_at desc), '[]'::jsonb)
  from (select * from private.account_benefits where user_id = p_user_id order by created_at desc limit 100) b
$$;
-- The existing balance helper has unqualified enum/table references. Pin its
-- trusted schemas so service-only callers with an empty search path can use it.
alter function public.get_or_create_credit_balance(uuid,uuid) set search_path = pg_catalog, public, pg_temp;
create function private.grant_account_benefit(p_actor_id uuid, p_grant jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_grant private.account_benefits; v_existing private.account_benefits; v_balance record; v_ws uuid;
begin
  -- Defense in depth: caller must already hold root workspace admin permission.
  if not exists (select 1 from public.workspace_members where ws_id = '00000000-0000-0000-0000-000000000000'
    and user_id = p_actor_id and type = 'MEMBER') then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_grant ->> 'requestId', 17));
  select * into v_existing from private.account_benefits where id = (p_grant ->> 'requestId')::uuid;
  if found then
    if v_existing.user_id <> (p_grant ->> 'userId')::uuid or v_existing.benefit_key <> p_grant ->> 'key'
      or v_existing.amount <> (p_grant ->> 'amount')::integer or v_existing.granted_by <> p_actor_id
      or v_existing.reason <> p_grant ->> 'reason'
      or v_existing.expires_at is distinct from (p_grant ->> 'expiresAt')::timestamptz then
      raise exception 'Conflicting grant replay' using errcode = '40001';
    end if;
    return to_jsonb(v_existing);
  end if;
  insert into private.account_benefits(id, user_id, benefit_key, amount, expires_at, granted_by, reason)
    values ((p_grant ->> 'requestId')::uuid, (p_grant ->> 'userId')::uuid, p_grant ->> 'key',
      (p_grant ->> 'amount')::integer, (p_grant ->> 'expiresAt')::timestamptz, p_actor_id, p_grant ->> 'reason')
    returning * into v_grant;
  if v_grant.benefit_key = 'ai_credits' then
    v_ws := private.account_personal_workspace(v_grant.user_id);
    if v_ws is null then raise exception 'Personal workspace missing' using errcode = 'P0002'; end if;
    select * into v_balance from public.get_or_create_credit_balance(v_ws, v_grant.user_id) limit 1;
    if v_balance.id is null then raise exception 'Credit balance missing'; end if;
    update public.workspace_ai_credit_balances set bonus_credits = bonus_credits + v_grant.amount, updated_at = now() where id = v_balance.id;
    insert into public.ai_credit_transactions(balance_id, ws_id, user_id, transaction_type, amount, metadata)
      values (v_balance.id, v_balance.ws_id, v_balance.user_id, 'bonus', v_grant.amount,
        jsonb_build_object('account_benefit_id', v_grant.id, 'reason', v_grant.reason, 'actor_id', p_actor_id));
  end if;
  return to_jsonb(v_grant);
end $$;
create function private.revoke_account_benefit(p_actor_id uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workspace_members where ws_id = '00000000-0000-0000-0000-000000000000'
    and user_id = p_actor_id and type = 'MEMBER') then raise insufficient_privilege; end if;
  -- Credits are a delivered, audited one-time allocation, not an access flag.
  update private.account_benefits set revoked_at = coalesce(revoked_at, now()), revoked_by = p_actor_id
    where id = p_id and benefit_key <> 'ai_credits';
  if not found then raise exception 'Revocable benefit not found' using errcode = 'P0002'; end if;
  return true;
end $$;
revoke all on function private.account_personal_workspace(uuid), private.has_account_benefit(uuid,text),
  private.account_playgrounds_allowed(uuid), private.list_account_benefits(uuid),
  private.grant_account_benefit(uuid,jsonb), private.revoke_account_benefit(uuid,uuid) from public, anon, authenticated;
grant execute on function private.account_personal_workspace(uuid), private.has_account_benefit(uuid,text),
  private.account_playgrounds_allowed(uuid), private.list_account_benefits(uuid),
  private.grant_account_benefit(uuid,jsonb), private.revoke_account_benefit(uuid,uuid) to service_role;
