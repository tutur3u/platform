-- Forward-only compatibility for a verified Google destination, without a
-- legacy mailbox. Existing email-v1 receipts retain their original contract.
alter table private.employee_address_migrations
  add column transition_kind text not null default 'email_v1'
    check (transition_kind in('email_v1','google_destination')),
  add column transition_receipt jsonb;
alter table private.employee_address_migrations add constraint employee_address_transition_receipt
  check ((transition_kind='google_destination' and phase='completed')=(transition_receipt is not null));

create function private.employee_address_google_destination(p_user uuid,p_destination text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select count(*) from auth.identities where user_id=p_user and provider='google')=1
    and not exists(select 1 from auth.identities where user_id=p_user and provider not in('google','email'))
    and exists(select 1 from auth.identities where user_id=p_user and provider='google'
      and provider_id<>'' and provider_id=identity_data->>'sub'
      and identity_data->>'email'=p_destination and identity_data->'email_verified'='true'::jsonb);
$$;

create function private.employee_address_google_state(p_user uuid,p_source text,p_destination text,p_without_email boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(private.employee_address_state(p_user,p_source,p_destination),'{identities}',
    coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'providerId',i.provider_id,
      'provider',i.provider,'userId',i.user_id,'data',i.identity_data) order by i.id)
      from auth.identities i where i.user_id=p_user and (not p_without_email or i.provider<>'email')),'[]'::jsonb));
$$;

create or replace function private.employee_address_migration(p_action text,p_request jsonb,p_attempt_id uuid default null)
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
  bound jsonb; record jsonb; oauth boolean; google_source boolean; transition jsonb;
  normalized_state jsonb; mailbox private.mail_mailboxes%rowtype; dependency record; occupied boolean;
begin
  if p_action is null or p_action not in('inspect','prepare','reserve','claim','complete') or jsonb_typeof(p_request)<>'object'
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
  -- Never queue exclusive admission behind a shared writer: PostgreSQL would
  -- also queue later shared writers behind that exclusive waiter.
  if not pg_try_advisory_xact_lock(hashtextextended('employee-address-reservations',0)) then
    raise exception using errcode='55P03',message='Address migration admission busy';
  end if;
  -- Existing CREATE/RESTORE/provider transactions may already hold Auth rows
  -- before they reach shared admission. Never wait while holding exclusive
  -- admission: contention aborts this transaction without issuing a capability.
  perform 1 from auth.users where id in(actor,target) order by id for update nowait;
  -- SHARE locks also cover absent role/default rows and prevent revocation or
  -- grant phantoms until this short service transaction commits.
  lock table public.workspace_members,public.workspaces,public.workspace_role_members,
    public.workspace_roles,public.workspace_role_permissions,public.workspace_default_permissions,
    private.mail_mailbox_members in share mode nowait;
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
  google_source:=private.employee_address_google_destination(target,destination);
  oauth:=coalesce(op.transition_kind='google_destination',false) or (op.operation_id is null and google_source);
  if oauth then current_state:=private.employee_address_google_state(target,source,destination,false);
  else current_state:=private.employee_address_state(target,source,destination); end if;
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
  if p_action='prepare' then
    -- An existing binding cannot be rebased or reset through preparation.
    if op.operation_id is not null or not google_source or (select count(*) from auth.identities where user_id=target)<>1 or target_auth.email<>source
      or target_auth.email_confirmed_at is null or target_auth.email_confirmed_at>clock_timestamp()
      or target_auth.deleted_at is not null or target_auth.is_anonymous
      or (target_auth.banned_until is not null and target_auth.banned_until>clock_timestamp())
      or coalesce(target_auth.email_change,'')<>''
      or not exists(select 1 from public.user_private_details where user_id=target and email=source) then
      raise exception using errcode='23514',message='Mailbox preparation unavailable';
    end if;
    select * into mailbox from private.mail_mailboxes where address=destination;
    if mailbox.id is null or mailbox.created_by is not null or mailbox.type<>'personal'
      or mailbox.status<>'disabled' or mailbox.archived_at is not null
      or not exists(select 1 from private.mail_domains where id=mailbox.domain_id and domain='tuturuuu.com' and status='active')
      or exists(select 1 from private.mail_mailboxes where address=source)
      or exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id) then
      raise exception using errcode='23514',message='Mailbox preparation unavailable';
    end if;
    -- The only ignorable conflict is this exact empty unowned placeholder.
    -- Lock every referencing table to fence both existing and absent FK rows.
    if exists(select 1 from pg_catalog.pg_constraint where contype='f'
      and confrelid='private.mail_mailboxes'::regclass and cardinality(conkey)<>1) then
      raise exception using errcode='23514',message='Mailbox preparation dependency unavailable';
    end if;
    for dependency in
      select c.conrelid::regclass as relation,a.attname as column_name
      from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a
        on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      where c.contype='f' and c.confrelid='private.mail_mailboxes'::regclass
        and cardinality(c.conkey)=1
      order by c.conrelid,a.attnum
    loop
      execute format('lock table %s in share mode nowait',dependency.relation);
      execute format('select exists(select 1 from %s where %I=$1)',dependency.relation,dependency.column_name)
        into occupied using mailbox.id;
      if occupied then raise exception using errcode='23514',message='Mailbox preparation has retained data'; end if;
    end loop;
    if exists(select 1 from auth.users where id<>target and lower(email) in(source,destination))
      or exists(select 1 from auth.identities where user_id<>target and lower(identity_data->>'email') in(source,destination))
      or exists(select 1 from public.user_private_details where user_id<>target and lower(email) in(source,destination))
      or exists(select 1 from public.platform_email_roles where lower(email) in(source,destination))
      or exists(select 1 from private.infrastructure_employees where user_id=target or staff_email in(source,destination))
      or exists(select 1 from private.employee_creation_intents where user_id=target or staff_email in(source,destination))
      or exists(select 1 from private.employee_creation_operations where target_id=target or staff_email in(source,destination))
      or exists(select 1 from private.employee_restore_operations where user_id=target and phase<>'completed')
      or exists(select 1 from private.employee_address_migrations where user_id=target
        or source_address in(source,destination) or destination_address in(source,destination)) then
      raise exception using errcode='23514',message='Mailbox preparation conflict';
    end if;
    update private.mail_mailboxes set created_by=target,status='active' where id=mailbox.id;
    insert into private.mail_mailbox_members(mailbox_id,user_id,role,created_by) values(mailbox.id,target,'owner',actor);
    return jsonb_build_object('prepared',true,'userId',target,'destinationAddress',destination);
  end if;
  source_verified:=target_auth.email_confirmed_at is not null and target_auth.email_confirmed_at<=clock_timestamp() and target_auth.deleted_at is null
    and (target_auth.banned_until is null or target_auth.banned_until<=clock_timestamp())
    and target_auth.email=case when op.phase in('attempted','completed') then target_auth.email else source end
    and not coalesce(target_auth.is_anonymous,true)
    and target_auth.email in(source,destination) and coalesce(target_auth.email_change,'')=''
    and exists(select 1 from public.user_private_details where user_id=target and email=target_auth.email)
    and ((not oauth and exists(select 1 from auth.identities where user_id=target and provider='email')
      and not exists(select 1 from auth.identities where user_id=target
        and (provider<>'email' or identity_data->>'email' is distinct from target_auth.email
          or identity_data->'email_verified' is distinct from 'true'::jsonb))
      and (select count(*) from private.mail_mailboxes m join private.mail_domains d on d.id=m.domain_id
        where m.address in(source,destination) and d.domain=split_part(m.address,'@',2) and d.status='active')=2)
    or (oauth and private.employee_address_google_destination(target,destination)
      and not exists(select 1 from private.mail_mailboxes where address=source)
      and exists(select 1 from private.mail_mailboxes m join private.mail_domains d on d.id=m.domain_id
        where m.address=destination and m.created_by=target and m.type='personal' and m.status='active'
          and d.domain='tuturuuu.com' and d.status='active'
          and exists(select 1 from private.mail_mailbox_members where mailbox_id=m.id and user_id=target and role='owner')
          and not exists(select 1 from private.mail_mailbox_members where mailbox_id=m.id and user_id<>target))
      and ((target_auth.email=source and (select count(*) from auth.identities where user_id=target)=1)
        or (op.phase in('attempted','completed') and target_auth.email=destination
          and (select count(*) from auth.identities where user_id=target)=2
          and exists(select 1 from auth.identities where user_id=target and provider='email'
            and provider_id=target::text and identity_data->>'sub'=target::text
            and identity_data->>'email'=destination and identity_data->'email_verified'='true'::jsonb)))));
  if op.operation_id is not null then
    if oauth and target_auth.email=destination and source_verified then
      normalized_state:=private.employee_address_google_state(target,source,destination,true);
      source_verified:=normalized_state=op.original_state;
      if source_verified then
        transition:=jsonb_build_object('kind','google_destination',
          'beforeImmutableFingerprint',op.binding->>'immutableFingerprint',
          'beforeProviderIdentityFingerprint',op.binding->>'providerIdentityFingerprint',
          'afterImmutableFingerprint',state_hash,'afterProviderIdentityFingerprint',identity_hash);
        if op.phase='completed' and op.transition_receipt is distinct from transition then source_verified:=false; end if;
      end if;
    else source_verified:=source_verified and current_state=op.original_state
      and identity_hash=op.binding->>'providerIdentityFingerprint'; end if;
  end if;
  bound:=p_request||jsonb_build_object('immutableFingerprint',state_hash,'providerIdentityFingerprint',identity_hash);
  if p_action<>'inspect' then
    if conflict or not coalesce(source_verified,false) or (op.phase='completed' and p_action<>'complete')
      or (transition is null and (p_request->>'immutableFingerprint' is distinct from state_hash
        or p_request->>'providerIdentityFingerprint' is distinct from identity_hash))
      or (transition is not null and p_request<>op.binding) then
      raise exception using errcode='23514',message='Migration state unavailable';
    end if;
    if p_action='reserve' then
      if op.operation_id is null then
        insert into private.employee_address_migrations(operation_id,user_id,source_address,destination_address,binding,phase,original_state,transition_kind)
          values(operation,target,source,destination,bound,'reserved',current_state,case when oauth then 'google_destination' else 'email_v1' end) returning * into op;
      elsif op.binding<>bound then raise exception using errcode='23514',message='Migration binding conflict'; end if;
    else
      if op.operation_id is null or op.binding<>case when transition is not null then p_request else bound end then
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
        update private.employee_address_migrations set phase='completed',transition_receipt=transition,completed_at=coalesce(completed_at,clock_timestamp()) where operation_id=operation;
      else raise exception using errcode='23514',message='Invalid migration action'; end if;
    end if;
    return 'true'::jsonb;
  end if;
  record:=case when op.operation_id is null then null else jsonb_build_object('binding',op.binding,'phase',op.phase,'attemptId',op.attempt_id)||case when op.transition_receipt is not null then jsonb_build_object('transition',op.transition_receipt) else '{}'::jsonb end end;
  return jsonb_build_object('authorized',true,'revision',revision,'immutableFingerprint',state_hash,
    'providerIdentityFingerprint',identity_hash,'sourceVerified',coalesce(source_verified,false),
    'addressOwnership',case when conflict then 'conflict' else 'same_identity' end,'record',record)||case when transition is not null then jsonb_build_object('transition',transition) else '{}'::jsonb end;
end;
$$;

revoke all on function private.employee_address_google_destination(uuid,text),
  private.employee_address_google_state(uuid,text,text,boolean) from public,anon,authenticated,service_role;
-- CREATE OR REPLACE retains the original service-only RPC ACL.
