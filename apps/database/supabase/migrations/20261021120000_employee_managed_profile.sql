-- Additive administrator protocol. The existing profile name guards stay enabled.
create table private.employee_profile_renames (
  operation_id uuid primary key,
  actor_id uuid not null references public.users(id) on delete restrict,
  user_id uuid not null references private.infrastructure_employees(user_id) on delete restrict,
  staff_email text not null,
  before_revision bigint not null check(before_revision>=0),
  after_revision bigint not null check(after_revision=before_revision+1),
  before_name text not null,
  after_name text not null check(after_name=btrim(after_name) and length(after_name) between 1 and 100),
  before_handle text,
  after_handle text,
  creation_actor_id uuid,
  creation_operation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,before_revision),
  foreign key(creation_actor_id,creation_operation_id)
    references private.employee_creation_operations(actor_id,operation_id),
  check((creation_actor_id is null)=(creation_operation_id is null))
);
alter table private.employee_profile_renames enable row level security;
revoke all on private.employee_profile_renames from public,anon,authenticated,service_role;

create function private.reject_employee_profile_receipt_change()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501',message='Employee profile provenance is append only';
end;
$$;
create trigger employee_profile_renames_append_only before update or delete on private.employee_profile_renames
for each row execute function private.reject_employee_profile_receipt_change();
revoke all on function private.reject_employee_profile_receipt_change() from public,anon,authenticated,service_role;

-- Shared address admission precedes the established Auth, registry/intent,
-- domain/mailbox/member, profile, operation row order. Supports the existing
-- profile self-edit eligibility without widening restoration's self-action rule.
create function private.inspect_employee_profile(p_actor_id uuid,p_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target auth.users%rowtype;
  employee private.infrastructure_employees%rowtype;
  candidate private.infrastructure_employees%rowtype;
  intent private.employee_creation_intents%rowtype;
  mailbox private.mail_mailboxes%rowtype;
  domain_id uuid;
  managed boolean:=false;
  conflict boolean:=false;
  ready boolean:=false;
  profile public.users%rowtype;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Employee profile requires read committed';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('employee-address-reservations',0));
  perform private.lock_employee_auth_pair(p_actor_id,p_user_id);
  select * into target from auth.users where id=p_user_id;
  for candidate in select * from private.infrastructure_employees
    where user_id=p_user_id or staff_email=p_email order by user_id for update loop
    managed:=true;
    if candidate.user_id<>p_user_id or candidate.staff_email<>p_email then conflict:=true;
    else employee:=candidate; end if;
  end loop;
  for intent in select * from private.employee_creation_intents
    where user_id=p_user_id or staff_email=p_email order by user_id for update loop
    managed:=true;
    if intent.user_id<>p_user_id or intent.staff_email<>p_email then conflict:=true; end if;
  end loop;
  managed:=managed or coalesce(target.raw_app_meta_data->'employee_onboarding'='true'::jsonb,false);
  if not managed then return jsonb_build_object('managed',false); end if;
  perform private.assert_employee_administrator(p_actor_id);
  if employee.user_id is null or target.email is distinct from p_email
    or target.raw_app_meta_data->'employee_onboarding' is distinct from 'true'::jsonb then conflict:=true; end if;
  select id into domain_id from private.mail_domains where domain='tuturuuu.com' and status='active' for update;
  select * into mailbox from private.mail_mailboxes where id=employee.mailbox_id for update;
  perform 1 from private.mail_mailbox_members where mailbox_id=mailbox.id order by user_id for update;
  select * into profile from public.users where id=p_user_id for update;
  perform 1 from public.user_private_details where user_id=p_user_id for update;
  perform 1 from private.employee_creation_operations where target_id=p_user_id order by actor_id,operation_id for update;
  perform 1 from private.employee_restore_operations where user_id=p_user_id order by operation_id for update;
  ready:=not conflict and employee.lifecycle_state='active'
    and target.email_confirmed_at is not null and (target.banned_until is null or target.banned_until<=now())
    and mailbox.id is not null and mailbox.address=employee.staff_email and mailbox.domain_id=domain_id
    and mailbox.type='personal' and mailbox.status='active' and mailbox.created_by=p_user_id
    and mailbox.display_name=employee.managed_name and mailbox.sender_name=employee.managed_name
    and exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id=p_user_id and role='owner')
    and not exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id<>p_user_id)
    and profile.display_name=employee.managed_name
    and (profile.handle is null or exists(select 1 from public.handles where value=profile.handle and creator_id=p_user_id))
    and exists(select 1 from public.user_private_details where user_id=p_user_id and email=p_email and full_name=employee.managed_name)
    and not exists(select 1 from private.employee_creation_operations where target_id=p_user_id and (phase<>'active' or revoked_at is not null))
    and not exists(select 1 from private.employee_restore_operations where user_id=p_user_id and phase<>'completed')
    and not exists(select 1 from private.employee_address_migrations where user_id=p_user_id and phase<>'completed');
  return jsonb_build_object('managed',true,'ready',coalesce(ready,false),'revision',employee.revision,
    'id',p_user_id,'email',p_email,'displayName',employee.managed_name,'username',profile.handle);
end;
$$;

create function private.employee_profile_receipt(p private.employee_profile_renames)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('operationId',p.operation_id,'actorUserId',p.actor_id,'id',p.user_id,
    'email',p.staff_email,'expectedRevision',p.before_revision,'revision',p.after_revision,
    'displayName',p.after_name,'username',p.after_handle);
$$;
revoke all on function private.employee_profile_receipt(private.employee_profile_renames) from public,anon,authenticated,service_role;

create function private.update_employee_profile(p_actor_id uuid,p_user_id uuid,p_email text,
  p_expected_revision bigint,p_operation_id uuid,p_name text,p_handle text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  observed jsonb;
  receipt private.employee_profile_renames%rowtype;
  creation private.employee_creation_operations%rowtype;
  mailbox_id uuid;
  affected integer;
begin
  observed:=private.inspect_employee_profile(p_actor_id,p_user_id,p_email);
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>=9007199254740991 or p_name is null or p_name<>btrim(p_name)
    or length(p_name) not between 1 and 100 then
    raise exception using errcode='22023',message='Invalid employee profile request';
  end if;
  select * into receipt from private.employee_profile_renames where operation_id=p_operation_id;
  if found then
    if receipt.actor_id<>p_actor_id or receipt.user_id<>p_user_id or receipt.staff_email<>p_email
      or receipt.before_revision<>p_expected_revision or receipt.after_name<>p_name
      or receipt.after_handle is distinct from p_handle then
      raise exception using errcode='23505',message='Employee profile operation payload conflict';
    end if;
    return private.employee_profile_receipt(receipt);
  end if;
  if observed->'managed' is distinct from 'true'::jsonb or observed->'ready' is distinct from 'true'::jsonb
    or (observed->>'revision')::bigint<>p_expected_revision then
    raise exception using errcode='23514',message='Employee profile preimage conflict';
  end if;
  select * into creation from private.employee_creation_operations where target_id=p_user_id;
  if not private.employee_profile_lineage(p_user_id,p_email,observed->>'displayName',p_expected_revision,
    creation.actor_id,creation.operation_id) then
    raise exception using errcode='23514',message='Employee profile lineage conflict';
  end if;
  select e.mailbox_id into mailbox_id from private.infrastructure_employees e where user_id=p_user_id;
  update private.infrastructure_employees set managed_name=p_name,revision=revision+1,
    updated_by=p_actor_id,updated_at=now() where user_id=p_user_id and revision=p_expected_revision;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee profile revision conflict'; end if;
  perform public.update_public_user_profile(p_user_id,jsonb_build_object('display_name',p_name,'handle',p_handle));
  update public.user_private_details set full_name=p_name where user_id=p_user_id and email=p_email;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee private profile conflict'; end if;
  update private.mail_mailboxes set display_name=p_name,sender_name=p_name where id=mailbox_id and address=p_email;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception using errcode='23514',message='Employee mailbox conflict'; end if;
  insert into private.employee_profile_renames(operation_id,actor_id,user_id,staff_email,
    before_revision,after_revision,before_name,after_name,before_handle,after_handle,creation_actor_id,creation_operation_id)
    values(p_operation_id,p_actor_id,p_user_id,p_email,p_expected_revision,p_expected_revision+1,
      observed->>'displayName',p_name,observed->>'username',p_handle,creation.actor_id,creation.operation_id)
    returning * into receipt;
  observed:=private.inspect_employee_profile(p_actor_id,p_user_id,p_email);
  if observed->'ready' is distinct from 'true'::jsonb or observed->>'displayName' is distinct from p_name
    or observed->>'username' is distinct from p_handle
    or (observed->>'revision')::bigint<>p_expected_revision+1 then
    raise exception using errcode='23514',message='Employee profile postimage conflict';
  end if;
  return private.employee_profile_receipt(receipt);
end;
$$;

create function private.inspect_employee_profile_operation(p_actor_id uuid,p_user_id uuid,p_email text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare observed jsonb; receipt private.employee_profile_renames%rowtype;
begin
  observed:=private.inspect_employee_profile(p_actor_id,p_user_id,p_email);
  select * into receipt from private.employee_profile_renames where operation_id=p_operation_id
    and actor_id=p_actor_id and user_id=p_user_id and staff_email=p_email;
  return jsonb_build_object('current',observed,'receipt',
    case when receipt.operation_id is null then null else private.employee_profile_receipt(receipt) end);
end;
$$;
revoke all on function private.inspect_employee_profile(uuid,uuid,text),
  private.update_employee_profile(uuid,uuid,text,bigint,uuid,text,text),
  private.inspect_employee_profile_operation(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.inspect_employee_profile(uuid,uuid,text),
  private.update_employee_profile(uuid,uuid,text,bigint,uuid,text,text),
  private.inspect_employee_profile_operation(uuid,uuid,text,uuid) to service_role;
