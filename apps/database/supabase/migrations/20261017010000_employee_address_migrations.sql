-- Inactive legacy-only supplier. No Auth writes, onboarding conversion or mail
-- provisioning. Both existing local routes must already belong to the UUID.
create table private.employee_address_migrations (
  operation_id uuid primary key,
  user_id uuid not null unique references public.users(id) on delete restrict,
  source_address text not null unique,
  destination_address text not null unique,
  binding jsonb not null,
  phase text not null check (phase in ('reserved','attempted','completed')),
  attempt_id uuid unique,
  original_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((phase='reserved')=(attempt_id is null)),
  check (binding->>'operationId'=operation_id::text and binding->>'userId'=user_id::text
    and binding->>'sourceAddress'=source_address and binding->>'destinationAddress'=destination_address)
);
alter table private.employee_address_migrations enable row level security;
revoke all on private.employee_address_migrations from public,anon,authenticated,service_role;

create function private.employee_address_identity_fingerprint(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select encode(extensions.digest('['||coalesce(string_agg(
    '['||to_json(i.id::text)::text||','||to_json(i.provider)::text||','||to_json(i.user_id::text)::text||']',
    ',' order by i.id::text collate "C",i.provider collate "C",i.user_id::text collate "C"),'')||']','sha256'),'hex')
  from auth.identities i where i.user_id=p_user_id;
$$;

create function private.employee_address_state(p_user_id uuid,p_source text,p_destination text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'auth',(select jsonb_build_object('id',u.id,'password',u.encrypted_password,'app',u.raw_app_meta_data,
      'user',u.raw_user_meta_data,'ban',u.banned_until,'role',u.role,'aud',u.aud,'phone',u.phone,
      'phoneConfirmed',u.phone_confirmed_at,'deleted',u.deleted_at,'sso',u.is_sso_user) from auth.users u where u.id=p_user_id),
    'identities',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'providerId',i.provider_id,'provider',i.provider,'userId',i.user_id) order by i.id) from auth.identities i where user_id=p_user_id),'[]'),
    'profile',(select to_jsonb(u) from public.users u where id=p_user_id),
    'details',(select to_jsonb(d)-'email'-'new_email'-'updated_at' from public.user_private_details d where user_id=p_user_id),
    'memberships',coalesce((select jsonb_agg(to_jsonb(m) order by m.ws_id) from public.workspace_members m where user_id=p_user_id),'[]'),
    'workspaceRoles',coalesce((select jsonb_agg(to_jsonb(r) order by r.role_id) from public.workspace_role_members r where user_id=p_user_id),'[]'),
    'roleDefinitions',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.workspace_roles r where r.id in(select role_id from public.workspace_role_members where user_id=p_user_id)),'[]'),
    'rolePermissions',coalesce((select jsonb_agg(to_jsonb(r) order by r.role_id,r.permission) from public.workspace_role_permissions r where r.role_id in(select role_id from public.workspace_role_members where user_id=p_user_id)),'[]'),
    'grants',coalesce((select jsonb_agg(to_jsonb(r) order by r.user_id) from public.platform_user_roles r where user_id=p_user_id),'[]'),
    'mailboxes',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from private.mail_mailboxes m
      where m.address in (p_source,p_destination) or m.created_by=p_user_id),'[]'),
    'mailMemberships',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from private.mail_mailbox_members m
      where m.user_id=p_user_id or m.mailbox_id in (select id from private.mail_mailboxes where address in(p_source,p_destination))),'[]'),
    'domains',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from private.mail_domains d
      where d.domain in(split_part(p_source,'@',2),'tuturuuu.com')),'[]'));
$$;

create function private.employee_address_migration(p_action text,p_request jsonb,p_attempt_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(p_request->>'actorId')::uuid;
  target uuid:=(p_request->>'userId')::uuid;
  operation uuid:=(p_request->>'operationId')::uuid;
  source text:=p_request->>'sourceAddress'; destination text:=p_request->>'destinationAddress';
  expected bigint:=(p_request->>'expectedRevision')::bigint;
  op private.employee_address_migrations%rowtype;
  current_state jsonb; state_hash text; identity_hash text; revision bigint:=0;
  conflict boolean; source_verified boolean; target_auth auth.users%rowtype;
  bound jsonb; record jsonb;
begin
  if p_action is null or p_action not in('inspect','reserve','claim','complete') or jsonb_typeof(p_request)<>'object'
    or actor::text is distinct from p_request->>'actorId' or target::text is distinct from p_request->>'userId'
    or operation::text is distinct from p_request->>'operationId' or jsonb_typeof(p_request->'expectedRevision')<>'number'
    or length(split_part(source,'@',1))>64
    or actor is null or target is null or operation is null or actor=target or expected is null or expected<>0
    or source is null or destination is null or length(source)>254 or length(destination)>254
    or source<>lower(source) or destination<>lower(destination)
    or source !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+tuturuuu\.com$'
    or destination<>split_part(source,'@',1)||'@tuturuuu.com' then
    raise exception using errcode='23514',message='Invalid address migration tuple';
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Address migration requires read committed';
  end if;
  -- Exclusive admission precedes all row locks. Ordinary guarded statements
  -- take shared admission BEFORE their rows, preventing the row/advisory cycle.
  perform pg_advisory_xact_lock(hashtextextended('employee-address-reservations',0));
  -- Existing CREATE/RESTORE/provider transactions may already hold Auth rows
  -- before they reach shared admission. Never wait while holding exclusive
  -- admission: contention aborts this transaction without issuing a capability.
  perform 1 from auth.users where id in(actor,target) order by id for update nowait;
  -- SHARE locks also cover absent role/default rows and prevent revocation or
  -- grant phantoms until this short service transaction commits.
  lock table public.workspace_members,public.workspaces,public.workspace_role_members,
    public.workspace_roles,public.workspace_role_permissions,public.workspace_default_permissions in share mode nowait;
  perform private.assert_employee_administrator(actor);
  if exists(select 1 from auth.users where id=actor and (deleted_at is not null or is_anonymous)) then
    raise exception using errcode='42501',message='Employee administrator access denied';
  end if;
  perform 1 from public.users where id=target for update nowait;
  if not found then raise exception using errcode='23514',message='Migration target missing'; end if;
  perform 1 from public.user_private_details where user_id=target for update nowait;
  perform 1 from public.workspace_members where user_id=target order by ws_id for update nowait;
  perform 1 from public.platform_user_roles where user_id=target for update nowait;
  perform 1 from private.mail_domains where domain in(split_part(source,'@',2),'tuturuuu.com') order by id for update nowait;
  perform 1 from private.mail_mailboxes where address in(source,destination) or created_by=target order by id for update nowait;
  perform 1 from private.mail_mailbox_members where user_id=target or mailbox_id in
    (select id from private.mail_mailboxes where address in(source,destination)) order by id for update nowait;
  perform 1 from auth.identities where user_id=target order by id for update nowait;
  select * into target_auth from auth.users where id=target;
  select * into op from private.employee_address_migrations where operation_id=operation for update nowait;
  if found and (op.user_id<>target or op.source_address<>source or op.destination_address<>destination
    or op.binding->>'actorId'<>actor::text or op.binding->>'expectedRevision'<>expected::text) then
    raise exception using errcode='23514',message='Migration binding conflict';
  end if;
  if op.phase='completed' then revision:=1; end if;
  current_state:=private.employee_address_state(target,source,destination);
  state_hash:=encode(extensions.digest(current_state::text,'sha256'),'hex');
  identity_hash:=private.employee_address_identity_fingerprint(target);
  conflict:=exists(select 1 from auth.users where id<>target and lower(email) in(source,destination))
    or exists(select 1 from auth.identities where user_id<>target and lower(identity_data->>'email') in(source,destination))
    or exists(select 1 from public.user_private_details where user_id<>target and lower(email) in(source,destination))
    or exists(select 1 from public.platform_email_roles where lower(email) in(source,destination))
    or exists(select 1 from private.infrastructure_employees where user_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_creation_intents where user_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_creation_operations where target_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_restore_operations where user_id=target and phase<>'completed')
    or exists(select 1 from private.employee_address_migrations where operation_id<>operation
      and (user_id=target or destination_address=destination or source_address=source))
    or exists(select 1 from private.mail_mailboxes m where m.address in(source,destination)
      and (m.created_by is distinct from target or m.type<>'personal' or m.status<>'active'
        or not exists(select 1 from private.mail_mailbox_members where mailbox_id=m.id and user_id=target and role='owner')
        or exists(select 1 from private.mail_mailbox_members where mailbox_id=m.id and user_id<>target)));
  source_verified:=target_auth.email_confirmed_at is not null and target_auth.deleted_at is null
    and (target_auth.banned_until is null or target_auth.banned_until<=clock_timestamp())
    and target_auth.email=case when op.phase in('attempted','completed') then target_auth.email else source end
    and not coalesce(target_auth.is_anonymous,true)
    and target_auth.email in(source,destination) and coalesce(target_auth.email_change,'')=''
    and exists(select 1 from public.user_private_details where user_id=target and email=target_auth.email)
    and exists(select 1 from auth.identities where user_id=target and provider='email')
    and not exists(select 1 from auth.identities where user_id=target
      and (provider<>'email' or identity_data->>'email' is distinct from target_auth.email
        or identity_data->'email_verified' is distinct from 'true'::jsonb))
    and (select count(*) from private.mail_mailboxes m join private.mail_domains d on d.id=m.domain_id
      where m.address in(source,destination) and d.domain=split_part(m.address,'@',2) and d.status='active')=2;
  if op.operation_id is not null then
    source_verified:=source_verified and current_state=op.original_state
      and identity_hash=op.binding->>'providerIdentityFingerprint';
  end if;
  bound:=p_request||jsonb_build_object('immutableFingerprint',state_hash,'providerIdentityFingerprint',identity_hash);
  if p_action<>'inspect' then
    if conflict or not coalesce(source_verified,false) or (op.phase='completed' and p_action<>'complete')
      or p_request->>'immutableFingerprint' is distinct from state_hash
      or p_request->>'providerIdentityFingerprint' is distinct from identity_hash then
      raise exception using errcode='23514',message='Migration state unavailable';
    end if;
    if p_action='reserve' then
      if op.operation_id is null then
        insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,original_state)
          values(operation,target,source,destination,bound,'reserved',current_state) returning * into op;
      elsif op.binding<>bound then raise exception using errcode='23514',message='Migration binding conflict'; end if;
    else
      if op.operation_id is null or op.binding<>bound then
        raise exception using errcode='23514',message='Migration receipt missing';
      end if;
      if p_action='claim' then
        if op.phase<>'reserved' then return 'false'::jsonb; end if;
        if p_attempt_id is null or target_auth.email<>source then
          raise exception using errcode='23514',message='Migration attempt unavailable';
        end if;
        update private.employee_address_migrations set phase='attempted',attempt_id=p_attempt_id where operation_id=operation;
        return 'true'::jsonb;
      elsif p_action='complete' then
        if op.phase not in('attempted','completed') or target_auth.email<>destination then
          raise exception using errcode='23514',message='Migration provider unconfirmed';
        end if;
        update private.employee_address_migrations set phase='completed',completed_at=coalesce(completed_at,clock_timestamp()) where operation_id=operation;
      else raise exception using errcode='23514',message='Invalid migration action'; end if;
    end if;
    return 'true'::jsonb;
  end if;
  record:=case when op.operation_id is null then null else jsonb_build_object('binding',op.binding,'phase',op.phase,'attemptId',op.attempt_id) end;
  return jsonb_build_object('authorized',true,'revision',revision,'immutableFingerprint',state_hash,
    'providerIdentityFingerprint',identity_hash,'sourceVerified',coalesce(source_verified,false),
    'addressOwnership',case when conflict then 'conflict' else 'same_identity' end,'record',record);
end;
$$;

-- Reserve destination across existing CREATE, profile, Auth and mailbox writers.
-- The target Auth update remains provider-owned and requires the durable attempt.
create function private.guard_employee_address_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
declare address text; owner_id uuid; op private.employee_address_migrations%rowtype;
begin
  if tg_table_name='identities' then address:=new.identity_data->>'email'; owner_id:=new.user_id;
  elsif tg_table_schema='auth' then address:=new.email; owner_id:=new.id;
  elsif tg_table_name='user_private_details' then address:=new.email; owner_id:=new.user_id;
  elsif tg_table_name='mail_mailboxes' then address:=new.address; owner_id:=new.created_by;
  elsif tg_table_name='platform_email_roles' then address:=new.email; owner_id:=null;
  else address:=new.staff_email; owner_id:=new.user_id; end if;
  select * into op from private.employee_address_migrations
    where destination_address=lower(address) or source_address=lower(address);
  if found and (owner_id is distinct from op.user_id or
    (tg_table_schema='auth' and op.phase='reserved' and address=op.destination_address)) then
    raise exception using errcode='23505',message='Address reserved by migration';
  end if;
  return new;
end;
$$;
-- Shared admission does not serialize ordinary writers with one another.
create function private.lock_employee_address_writers()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception using errcode='25001',message='Address writer requires read committed';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('employee-address-reservations',0));
  return null;
end;
$$;
create trigger admit_employee_address_identity before insert or update on auth.identities for each statement execute function private.lock_employee_address_writers();
create trigger admit_employee_address_auth before insert or update on auth.users for each statement execute function private.lock_employee_address_writers();
create trigger admit_employee_address_profile before insert or update on public.user_private_details for each statement execute function private.lock_employee_address_writers();
create trigger admit_employee_address_mailbox before insert or update on private.mail_mailboxes for each statement execute function private.lock_employee_address_writers();
create trigger admit_employee_address_grant before insert or update on public.platform_email_roles for each statement execute function private.lock_employee_address_writers();
create trigger admit_employee_address_intent before insert or update on private.employee_creation_intents for each statement execute function private.lock_employee_address_writers();
create trigger guard_employee_address_identity before insert or update of identity_data,user_id,provider_id on auth.identities for each row execute function private.guard_employee_address_reservation();
create trigger guard_employee_address_auth before insert or update of email on auth.users for each row execute function private.guard_employee_address_reservation();
create trigger guard_employee_address_profile before insert or update of email,user_id on public.user_private_details for each row execute function private.guard_employee_address_reservation();
create trigger guard_employee_address_mailbox before insert or update of address,created_by on private.mail_mailboxes for each row execute function private.guard_employee_address_reservation();
create trigger guard_employee_address_grant before insert or update of email on public.platform_email_roles for each row execute function private.guard_employee_address_reservation();
create trigger guard_employee_address_intent before insert or update of staff_email,user_id on private.employee_creation_intents for each row execute function private.guard_employee_address_reservation();
revoke all on function private.employee_address_identity_fingerprint(uuid),private.employee_address_state(uuid,text,text),
  private.guard_employee_address_reservation(),private.lock_employee_address_writers(),private.employee_address_migration(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.employee_address_migration(text,jsonb,uuid) to service_role;
