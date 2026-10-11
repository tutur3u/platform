-- Additive restoration receipts only. No provider-owned Auth, mailbox, name,
-- password or grant writes. Cooperating handlers serialize via registry locks;
-- arbitrary external provider administrators are outside this fence.
alter table private.infrastructure_employees add column revision bigint not null default 0 check(revision>=0);
create table private.employee_restore_operations (
  operation_id uuid primary key,
  user_id uuid not null references private.infrastructure_employees(user_id) on delete restrict,
  staff_email text not null,
  expected_revision bigint not null check(expected_revision>=0 and expected_revision<9007199254740991),
  actor_id uuid not null references public.users(id) on delete restrict,
  phase text not null check(phase in ('reserved','attempted','unknown','completed')),
  safe_code text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  completed_at timestamptz,
  check(staff_email=lower(staff_email) and staff_email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@tuturuuu\.com$')
);
create unique index employee_restore_unresolved_target on private.employee_restore_operations(user_id) where phase<>'completed';
alter table private.employee_restore_operations enable row level security;
revoke all on private.employee_restore_operations from public,anon,authenticated,service_role;

-- Lock order: UUID-sorted actor/target Auth pair, fresh actor assertion,
-- registry/intent tuples, active domain,
-- canonical mailbox, memberships, operation. Profile proof is observational.
-- No claim that this order has been validated against actual GoTrue races yet.
create function private.inspect_employee_management(p_actor_id uuid,p_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target auth.users%rowtype;
  employee private.infrastructure_employees%rowtype;
  candidate private.infrastructure_employees%rowtype;
  intent private.employee_creation_intents%rowtype;
  operation private.employee_restore_operations%rowtype;
  mailbox private.mail_mailboxes%rowtype;
  domain_id uuid;
  canonical_email text;
  conflict boolean:=false;
  reserved boolean:=false;
  registered boolean:=false;
  ready boolean:=false;
  marked boolean:=false;
  code text;
begin
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  perform private.assert_employee_administrator(p_actor_id);
  if p_actor_id=p_user_id then raise exception using errcode='42501',message='Self employee action denied'; end if;
  select * into target from auth.users where id=p_user_id for update;
  canonical_email:=coalesce(p_email,target.email);
  marked:=coalesce(target.raw_app_meta_data->'employee_onboarding'='true'::jsonb,false);
  if target.id is not null and target.email is distinct from p_email then conflict:=true; end if;
  -- Independently resolve both OR-overlapping tables. Never select by email alone
  -- and never prefer one overlapping row over another.
  for candidate in select * from private.infrastructure_employees
    where user_id=p_user_id or staff_email=canonical_email order by user_id for update loop
    if candidate.user_id<>p_user_id or (canonical_email is not null and candidate.staff_email<>canonical_email) then conflict:=true;
    else employee:=candidate; registered:=true; canonical_email:=candidate.staff_email; end if;
  end loop;
  for intent in select * from private.employee_creation_intents
    where user_id=p_user_id or staff_email=canonical_email order by user_id for update loop
    if intent.user_id<>p_user_id or (canonical_email is not null and intent.staff_email<>canonical_email) then conflict:=true;
    else reserved:=true; canonical_email:=intent.staff_email; end if;
  end loop;
  if registered and (not marked or target.id is null or target.email is distinct from employee.staff_email) then conflict:=true; end if;
  if marked and not registered then conflict:=true; end if;
  if registered then
    select id into domain_id from private.mail_domains where domain='tuturuuu.com' and status='active' for update;
    select * into mailbox from private.mail_mailboxes where id=employee.mailbox_id for update;
    perform 1 from private.mail_mailbox_members where mailbox_id=mailbox.id order by user_id for update;
    perform 1 from public.users where id=p_user_id for update;
    perform 1 from public.user_private_details where user_id=p_user_id for update;
    ready:=not conflict
      and mailbox.id is not null and mailbox.address=employee.staff_email and mailbox.domain_id=domain_id
      and mailbox.type='personal' and mailbox.status='active' and mailbox.created_by=p_user_id
      and mailbox.display_name=employee.managed_name and mailbox.sender_name=employee.managed_name
      and exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id=p_user_id and role='owner')
      and not exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id<>p_user_id)
      and exists(select 1 from public.users where id=p_user_id and display_name=employee.managed_name)
      and exists(select 1 from public.user_private_details where user_id=p_user_id and email=employee.staff_email and full_name=employee.managed_name);
  end if;
  select * into operation from private.employee_restore_operations where user_id=p_user_id
    order by (phase<>'completed') desc,created_at desc,operation_id desc limit 1 for update;
  code:=case when conflict then 'tuple_conflict' when not registered then 'not_managed'
    when employee.lifecycle_state<>'active' then 'creation_pending' when coalesce(ready,false) and target.email_confirmed_at is not null then 'ready' else 'mailbox_unavailable' end;
  return jsonb_build_object('id',p_user_id,'email',canonical_email,
    'registryState',case when registered then employee.lifecycle_state else 'absent' end,
    'managedName',employee.managed_name,'managementRoleLabel',employee.management_role_label,
    'revision',employee.revision,'mailboxReady',coalesce(ready,false),'readinessCode',code,
    'reservation',case when conflict then 'conflicting_tuple' when reserved then 'exact_intent' else 'none' end,
    'managed',registered or reserved or marked or conflict,
    'operation',case when operation.operation_id is null then null else jsonb_build_object(
      'operationId',operation.operation_id,'revision',operation.expected_revision,'phase',operation.phase) end,
    'recovery',case when registered then jsonb_build_object('email',employee.recovery_email,'verified',employee.recovery_verified_at is not null) else null end);
end;
$$;

create function private.begin_employee_restore(p_actor_id uuid,p_user_id uuid,p_email text,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare observation jsonb;
begin
  observation:=private.inspect_employee_management(p_actor_id,p_user_id,p_email);
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991
    or observation->>'email' is distinct from p_email or observation->>'readinessCode'<>'ready'
    or (observation->>'revision')::bigint is distinct from p_expected_revision then
    raise exception using errcode='23514',message='Employee restoration tuple or revision conflict';
  end if;
  if exists(select 1 from private.employee_restore_operations where user_id=p_user_id and phase<>'completed') then
    raise exception using errcode='23505',message='Employee operation unresolved';
  end if;
  insert into private.employee_restore_operations(operation_id,user_id,staff_email,expected_revision,actor_id,phase)
    values(p_operation_id,p_user_id,p_email,p_expected_revision,p_actor_id,'reserved');
  return jsonb_build_object('operationId',p_operation_id,'revision',p_expected_revision,'phase','reserved');
end;
$$;

create function private.mark_employee_restore_attempt(p_actor_id uuid,p_user_id uuid,p_email text,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare observation jsonb; operation private.employee_restore_operations%rowtype;
begin
  observation:=private.inspect_employee_management(p_actor_id,p_user_id,p_email);
  select * into operation from private.employee_restore_operations where operation_id=p_operation_id for update;
  if not found or operation.user_id<>p_user_id or operation.staff_email<>p_email or operation.actor_id<>p_actor_id
    or operation.expected_revision is distinct from p_expected_revision or operation.phase<>'reserved'
    or observation->>'email' is distinct from p_email or observation->'operation'->>'operationId' is distinct from p_operation_id::text
    or observation->>'readinessCode'<>'ready' or (observation->>'revision')::bigint is distinct from p_expected_revision then
    raise exception using errcode='23514',message='Employee attempt receipt conflict';
  end if;
  -- A replay never acknowledges another launch. A crash after this commit stays
  -- inspectable and unresolved until an explicit verified reconciliation.
  update private.employee_restore_operations set phase='attempted',attempted_at=now() where operation_id=p_operation_id;
  return jsonb_build_object('operationId',p_operation_id,'revision',p_expected_revision,'phase','attempted');
end;
$$;

create function private.confirm_employee_restore(p_actor_id uuid,p_user_id uuid,p_email text,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare observation jsonb; operation private.employee_restore_operations%rowtype; current_revision bigint;
begin
  observation:=private.inspect_employee_management(p_actor_id,p_user_id,p_email);
  select * into operation from private.employee_restore_operations where operation_id=p_operation_id for update;
  if not found or operation.user_id<>p_user_id or operation.staff_email<>p_email or operation.actor_id<>p_actor_id
    or p_expected_revision is null or operation.expected_revision is distinct from p_expected_revision
    or observation->>'email' is distinct from p_email or observation->>'readinessCode'<>'ready' then
    raise exception using errcode='23514',message='Employee confirmation receipt conflict';
  end if;
  perform 1 from auth.users where id=p_user_id and email=p_email and email_confirmed_at is not null
    and raw_app_meta_data->'employee_onboarding'='true'::jsonb and (banned_until is null or banned_until<=now());
  if not found then raise exception using errcode='23514',message='Employee provider activation is unconfirmed'; end if;
  current_revision:=(observation->>'revision')::bigint;
  if exists(select 1 from private.employee_restore_operations where user_id=p_user_id and operation_id<>p_operation_id and phase<>'completed') then
    raise exception using errcode='23514',message='Employee competing operation unresolved';
  end if;
  if operation.phase='completed' then
    if current_revision<>p_expected_revision+1 then raise exception using errcode='23514',message='Employee completed receipt stale'; end if;
  else
    if current_revision<>p_expected_revision then raise exception using errcode='23514',message='Employee revision stale'; end if;
    update private.infrastructure_employees set revision=revision+1,updated_by=p_actor_id,updated_at=now() where user_id=p_user_id;
    update private.employee_restore_operations set phase='completed',completed_at=now(),safe_code='employee_restored' where operation_id=p_operation_id;
  end if;
  return jsonb_build_object('id',p_user_id,'email',p_email,'displayName',observation->>'managedName',
    'operationId',p_operation_id,'revision',p_expected_revision+1,'status','restored');
end;
$$;

create function private.reconcile_employee_restore(p_actor_id uuid,p_user_id uuid,p_email text,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  -- Named matching receipt only. No insert, provider write, lifecycle advancement,
  -- provisioning, expiry, takeover or deletion. Confirmation rechecks every lock.
  return private.confirm_employee_restore(p_actor_id,p_user_id,p_email,p_expected_revision,p_operation_id);
end;
$$;
revoke all on function private.inspect_employee_management(uuid,uuid,text),
  private.begin_employee_restore(uuid,uuid,text,bigint,uuid),private.mark_employee_restore_attempt(uuid,uuid,text,bigint,uuid),
  private.confirm_employee_restore(uuid,uuid,text,bigint,uuid),private.reconcile_employee_restore(uuid,uuid,text,bigint,uuid) from public,anon,authenticated;
grant execute on function private.inspect_employee_management(uuid,uuid,text),
  private.begin_employee_restore(uuid,uuid,text,bigint,uuid),private.mark_employee_restore_attempt(uuid,uuid,text,bigint,uuid),
  private.confirm_employee_restore(uuid,uuid,text,bigint,uuid),private.reconcile_employee_restore(uuid,uuid,text,bigint,uuid) to service_role;
