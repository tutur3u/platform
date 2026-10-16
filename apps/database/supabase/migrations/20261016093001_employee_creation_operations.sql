-- Source candidate only. Root owns isolated application, generated types and wiring.
create table private.employee_creation_operations (
  actor_id uuid not null references public.users(id),
  operation_id uuid not null,
  target_id uuid not null unique default gen_random_uuid(),
  staff_email text not null unique check (length(staff_email)<=320 and staff_email=lower(staff_email)
    and staff_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'),
  managed_name text not null check (managed_name=btrim(managed_name) and length(managed_name) between 1 and 100),
  phase text not null default 'reserved' check (phase in ('reserved','auth_attempted','auth_confirmed',
    'finalize_attempted','provisioned','activation_attempted','active','unknown')),
  version integer not null default 0 check (version>=0),
  lease_id uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default clock_timestamp()+interval '60 seconds',
  revoked_at timestamptz,
  last_receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,operation_id)
);
create table private.employee_creation_operation_history (
  actor_id uuid not null,
  operation_id uuid not null,
  event_id uuid not null,
  lease_id uuid not null,
  expected_version integer not null,
  previous_phase text not null,
  next_phase text not null,
  receipt jsonb,
  resulting_version integer not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,operation_id,event_id),
  unique(actor_id,operation_id,resulting_version),
  foreign key(actor_id,operation_id) references private.employee_creation_operations(actor_id,operation_id)
);
alter table private.employee_creation_operations enable row level security;
alter table private.employee_creation_operation_history enable row level security;
revoke all on private.employee_creation_operations,private.employee_creation_operation_history
  from public,anon,authenticated,service_role;

create function private.employee_creation_operation_snapshot(p private.employee_creation_operations)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('actorUserId',p.actor_id,'operationId',p.operation_id,
    'targetUserId',p.target_id,'email',p.staff_email,'displayName',p.managed_name,
    'phase',p.phase,'version',p.version,'leaseId',p.lease_id,
    'leaseExpiresAt',floor(extract(epoch from p.lease_expires_at)*1000)::bigint,
    'revoked',p.revoked_at is not null,'lastReceipt',p.last_receipt);
$$;

create function private.employee_creation_operation_ready(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_employee_administrator(p_actor_id);
  return jsonb_build_object('ready',true);
end;
$$;

create function private.employee_creation_operation_claim(
  p_actor_id uuid,p_operation_id uuid,p_email text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype; result_kind text;
begin
  -- Serialize absent keys too. A hash collision only serializes unrelated claims.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':'||p_operation_id::text,0));
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id;
  if found then perform private.lock_employee_auth_pair(p_actor_id,op.target_id); end if;
  perform private.assert_employee_administrator(p_actor_id);
  if p_operation_id is null or p_email is null or p_name is null or p_email<>lower(p_email)
    or length(p_email)>320 or p_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$'
    or p_name<>btrim(p_name) or length(p_name) not between 1 and 100 then
    raise exception using errcode='23514',message='Invalid employee operation identity';
  end if;
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id for update;
  if found then
    result_kind='inspect';
    if op.staff_email<>p_email or op.managed_name<>p_name then
      result_kind='payload_conflict';
    elsif op.phase='reserved' and op.revoked_at is null and op.lease_expires_at<=clock_timestamp() then
      -- Only a phase which has never dispatched an effect can acquire a new lease.
      update private.employee_creation_operations set lease_id=gen_random_uuid(),
        lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
        where actor_id=p_actor_id and operation_id=p_operation_id returning * into op;
      result_kind='claimed';
    end if;
  else
    insert into private.employee_creation_operations(actor_id,operation_id,staff_email,managed_name)
      values(p_actor_id,p_operation_id,p_email,p_name) returning * into op;
    -- Reservation and stable UUID commit together; no parallel intent implementation.
    perform private.employee_creation_preflight(p_actor_id,op.target_id,p_email,p_name);
    result_kind='claimed';
  end if;
  return jsonb_build_object('kind',result_kind,'operation',private.employee_creation_operation_snapshot(op));
end;
$$;

create function private.employee_creation_operation_advance(p_actor_id uuid,p_operation_id uuid,
  p_lease_id uuid,p_expected_version integer,p_event_id uuid,p_next_phase text,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype;
  prior private.employee_creation_operation_history%rowtype;
  allowed boolean; receipt_keys text[];
begin
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id;
  perform private.lock_employee_auth_pair(p_actor_id,op.target_id);
  perform private.assert_employee_administrator(p_actor_id);
  select * into op from private.employee_creation_operations
    where actor_id=p_actor_id and operation_id=p_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Employee operation missing'; end if;
  select * into prior from private.employee_creation_operation_history
    where actor_id=p_actor_id and operation_id=p_operation_id and event_id=p_event_id;
  if found then
    if prior.lease_id is distinct from p_lease_id or prior.expected_version is distinct from p_expected_version
      or prior.next_phase is distinct from p_next_phase or prior.receipt is distinct from p_receipt then
      raise exception using errcode='23514',message='Employee event payload conflict';
    end if;
    -- A replay acknowledges current state; it never rewinds a later phase.
    return jsonb_build_object('kind','inspect','operation',private.employee_creation_operation_snapshot(op));
  end if;
  if p_event_id is null or p_expected_version is null or p_next_phase is null then
    raise exception using errcode='23514',message='Invalid employee transition';
  end if;
  if op.revoked_at is not null or op.lease_id is distinct from p_lease_id
    or op.version<>p_expected_version or op.lease_expires_at<=clock_timestamp() then
    return jsonb_build_object('kind','inspect','operation',private.employee_creation_operation_snapshot(op));
  end if;
  allowed=(op.phase='reserved' and p_next_phase='auth_attempted')
    or (op.phase='auth_attempted' and p_next_phase='auth_confirmed')
    or (op.phase='auth_confirmed' and p_next_phase='finalize_attempted')
    or (op.phase='finalize_attempted' and p_next_phase='provisioned')
    or (op.phase='provisioned' and p_next_phase='activation_attempted')
    or (op.phase='activation_attempted' and p_next_phase='active')
    or (op.phase in ('auth_attempted','auth_confirmed','finalize_attempted','provisioned','activation_attempted')
      and p_next_phase='unknown');
  if not allowed then raise exception using errcode='23514',message='Employee transition denied'; end if;
  if p_next_phase in ('auth_confirmed','provisioned','active') then
    if jsonb_typeof(p_receipt) is distinct from 'object' then
      raise exception using errcode='23514',message='Employee receipt required';
    end if;
    select array_agg(key order by key) into receipt_keys from jsonb_object_keys(p_receipt) as keys(key);
    if receipt_keys is distinct from array['authConfirmed','authPending','email','grantsConfirmed',
      'mailboxConfirmed','profilesConfirmed','providerActive','providerReceiptId','sqlConfirmed','targetUserId']::text[]
      or p_receipt->>'targetUserId' is distinct from op.target_id::text
      or p_receipt->>'email' is distinct from op.staff_email
      or coalesce(p_receipt->>'providerReceiptId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or exists(select 1 from jsonb_each(p_receipt) e where e.key in ('authConfirmed','authPending',
        'providerActive','sqlConfirmed','profilesConfirmed','mailboxConfirmed','grantsConfirmed') and jsonb_typeof(e.value)<>'boolean')
      or p_receipt->'authConfirmed' is distinct from 'true'::jsonb then
      raise exception using errcode='23514',message='Employee receipt identity denied';
    end if;
    if (p_next_phase<>'active' and (p_receipt->'authPending' is distinct from 'true'::jsonb
        or p_receipt->'providerActive' is distinct from 'false'::jsonb))
      or (p_next_phase in ('provisioned','active') and (
        p_receipt->'sqlConfirmed' is distinct from 'true'::jsonb
        or p_receipt->'profilesConfirmed' is distinct from 'true'::jsonb
        or p_receipt->'mailboxConfirmed' is distinct from 'true'::jsonb
        or p_receipt->'grantsConfirmed' is distinct from 'true'::jsonb))
      or (p_next_phase='active' and (p_receipt->'authPending' is distinct from 'false'::jsonb
        or p_receipt->'providerActive' is distinct from 'true'::jsonb)) then
      raise exception using errcode='23514',message='Employee receipt phase denied';
    end if;
    -- Receipt flags alone cannot publish SQL success. Re-observe existing identity.
    perform 1 from auth.users where id=op.target_id and email=op.staff_email
      and email_confirmed_at is not null and raw_app_meta_data->'employee_onboarding'='true'::jsonb
      and ((p_next_phase='active' and (banned_until is null or banned_until<=now()))
        or (p_next_phase<>'active' and banned_until>now()));
    if not found then raise exception using errcode='23514',message='Employee Auth outcome not confirmed'; end if;
    if p_next_phase in ('provisioned','active') then
      if p_next_phase='active' then
        perform private.employee_access_preflight(p_actor_id,op.target_id,op.staff_email,true);
      end if;
      perform 1 from private.infrastructure_employees where user_id=op.target_id
        and managed_name=op.managed_name and lifecycle_state=case when p_next_phase='active' then 'active' else 'provisioned' end;
      if not found or not exists(select 1 from private.infrastructure_employees employee
        join private.mail_mailboxes mb on mb.id=employee.mailbox_id
        join private.mail_domains d on d.id=mb.domain_id
        where employee.user_id=op.target_id and mb.address=op.staff_email
          and d.domain='tuturuuu.com' and d.status='active' and mb.type='personal'
          and mb.status='active' and mb.created_by=op.target_id
          and mb.display_name=op.managed_name and mb.sender_name=op.managed_name
          and exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id
            and mm.user_id=op.target_id and mm.role='owner')
          and not exists(select 1 from private.mail_mailbox_members mm where mm.mailbox_id=mb.id and mm.user_id<>op.target_id))
        or not exists(select 1 from public.users where id=op.target_id and display_name=op.managed_name)
        or not exists(select 1 from public.user_private_details where user_id=op.target_id
          and email=op.staff_email and full_name=op.managed_name)
        or not exists(select 1 from public.platform_user_roles where user_id=op.target_id and not enabled
          and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management) then
        raise exception using errcode='23514',message='Employee SQL outcome not confirmed';
      end if;
    end if;
  elsif p_receipt is not null then
    raise exception using errcode='23514',message='Employee attempted phase must not include receipt';
  end if;
  insert into private.employee_creation_operation_history(actor_id,operation_id,event_id,lease_id,
    expected_version,previous_phase,next_phase,receipt,resulting_version)
    values(p_actor_id,p_operation_id,p_event_id,p_lease_id,p_expected_version,op.phase,p_next_phase,p_receipt,op.version+1);
  update private.employee_creation_operations set phase=p_next_phase,version=version+1,
    last_receipt=coalesce(p_receipt,last_receipt),updated_at=clock_timestamp()
    where actor_id=p_actor_id and operation_id=p_operation_id returning * into op;
  return jsonb_build_object('kind','advanced','operation',private.employee_creation_operation_snapshot(op));
end;
$$;

create function private.employee_creation_operation_revoke(p_actor_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.employee_creation_operations%rowtype;
begin
  select * into op from private.employee_creation_operations where actor_id=p_actor_id and operation_id=p_operation_id;
  perform private.lock_employee_auth_pair(p_actor_id,op.target_id);
  perform private.assert_employee_administrator(p_actor_id);
  update private.employee_creation_operations set revoked_at=coalesce(revoked_at,clock_timestamp()),updated_at=clock_timestamp()
    where actor_id=p_actor_id and operation_id=p_operation_id returning * into op;
  if not found then raise exception using errcode='P0002',message='Employee operation missing'; end if;
  return private.employee_creation_operation_snapshot(op);
end;
$$;
revoke all on function private.employee_creation_operation_snapshot(private.employee_creation_operations)
  from public,anon,authenticated,service_role;
revoke all on function private.employee_creation_operation_ready(uuid),
  private.employee_creation_operation_claim(uuid,uuid,text,text),
  private.employee_creation_operation_advance(uuid,uuid,uuid,integer,uuid,text,jsonb),
  private.employee_creation_operation_revoke(uuid,uuid) from public,anon,authenticated;
grant execute on function private.employee_creation_operation_ready(uuid),
  private.employee_creation_operation_claim(uuid,uuid,text,text),
  private.employee_creation_operation_advance(uuid,uuid,uuid,integer,uuid,text,jsonb),
  private.employee_creation_operation_revoke(uuid,uuid) to service_role;
