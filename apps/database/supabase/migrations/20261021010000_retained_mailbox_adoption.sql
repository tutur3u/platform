-- Separate, explicit entitlement decision. Empty-only prepare is unchanged.
create table private.employee_mailbox_adoptions (
  operation_id uuid primary key,
  request jsonb not null,
  mailbox_id uuid not null unique references private.mail_mailboxes(id) on delete restrict,
  snapshot text not null check (snapshot ~ '^[a-f0-9]{64}$'),
  content_snapshot text not null,
  ownership_confirmed boolean not null check (ownership_confirmed),
  adopted_at timestamptz not null default clock_timestamp()
);
alter table private.employee_mailbox_adoptions enable row level security;
revoke all on private.employee_mailbox_adoptions from public,anon,authenticated,service_role;

-- Only four direct relations may contain retained rows. Everything else must
-- remain empty, including credentials, jobs, user state and historical access.
create function private.employee_retained_mailbox_content(p_mailbox uuid,p_target uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  dependency record; occupied boolean; inventory text[]; hashes jsonb:='{}';
  relation_name text; rows_hash text;
begin
  select array_agg(n.nspname||'.'||r.relname||'.'||a.attname order by n.nspname collate "C",r.relname collate "C",a.attname collate "C")
    into inventory
    from pg_catalog.pg_constraint c join pg_catalog.pg_class r on r.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=r.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='private.mail_mailboxes'::regclass;
  if inventory is distinct from array[
    'private.employee_mailbox_adoptions.mailbox_id',
    'private.infrastructure_employees.mailbox_id',
    'private.mail_ai_conversations.mailbox_id',
    'private.mail_ai_tool_executions.mailbox_id',
    'private.mail_auto_draft_jobs.mailbox_id',
    'private.mail_domains.catch_all_mailbox_id',
    'private.mail_events.mailbox_id',
    'private.mail_folders.mailbox_id',
    'private.mail_labels.mailbox_id',
    'private.mail_mailbox_members.mailbox_id',
    'private.mail_mcp_credential_mailboxes.mailbox_id',
    'private.mail_message_user_state.mailbox_id',
    'private.mail_messages.mailbox_id',
    'private.mail_outbound_jobs.mailbox_id',
    'private.mail_stored_objects.mailbox_id',
    'private.mail_thread_user_state.mailbox_id',
    'private.mail_threads.mailbox_id']::text[]
    or exists(select 1 from pg_catalog.pg_constraint where contype='f'
      and confrelid='private.mail_mailboxes'::regclass
      and (cardinality(conkey)<>1 or confkey<>array[(select attnum from pg_catalog.pg_attribute
        where attrelid='private.mail_mailboxes'::regclass and attname='id')]::smallint[])) then
    raise exception using errcode='23514',message='Retained mailbox catalog unavailable';
  end if;
  if (select count(*) from pg_catalog.pg_constraint where contype='f' and confrelid in(
    'private.mail_messages'::regclass,'private.mail_threads'::regclass,'private.mail_labels'::regclass,
    'private.mail_stored_objects'::regclass,'private.mail_raw_messages'::regclass))<>19
    or exists(select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class r on r.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=r.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid in('private.mail_messages'::regclass,'private.mail_threads'::regclass,
      'private.mail_labels'::regclass,'private.mail_stored_objects'::regclass,'private.mail_raw_messages'::regclass)
    and (cardinality(c.conkey)<>1 or cardinality(c.confkey)<>1
      or (select attname from pg_catalog.pg_attribute where attrelid=c.confrelid and attnum=c.confkey[1])<>'id'
      or n.nspname<>'private' or
      r.relname||'.'||a.attname||'>'||c.confrelid::regclass::text <> all(array[
        'mail_messages.thread_id>private.mail_threads',
        'mail_messages.raw_message_id>private.mail_raw_messages',
        'mail_recipients.message_id>private.mail_messages',
        'mail_attachments.message_id>private.mail_messages',
        'mail_attachments.raw_message_id>private.mail_raw_messages',
        'mail_message_labels.message_id>private.mail_messages',
        'mail_message_labels.label_id>private.mail_labels',
        'mail_message_user_state.message_id>private.mail_messages',
        'mail_events.message_id>private.mail_messages',
        'mail_outbound_jobs.message_id>private.mail_messages',
        'mail_stored_objects.message_id>private.mail_messages',
        'mail_raw_messages.stored_object_id>private.mail_stored_objects',
        'mail_inbound_jobs.stored_object_id>private.mail_stored_objects',
        'mail_attachments.stored_object_id>private.mail_stored_objects',
        'mail_message_folders.message_id>private.mail_messages',
        'mail_auto_draft_jobs.message_id>private.mail_messages',
        'mail_auto_draft_jobs.draft_message_id>private.mail_messages',
        'mail_thread_user_state.thread_id>private.mail_threads',
        'mail_notification_receipts.message_id>private.mail_messages']::text[]))) then
    raise exception using errcode='23514',message='Retained mailbox graph catalog unavailable';
  end if;
  for dependency in
    select c.conrelid::regclass as relation,a.attname as column_name
    from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a
      on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='private.mail_mailboxes'::regclass
    order by c.conrelid,a.attnum
  loop
    if dependency.relation::text not in ('private.mail_messages','private.mail_threads',
      'private.mail_labels','private.mail_stored_objects','private.mail_mailbox_members',
      'private.employee_mailbox_adoptions') then
      execute format('select exists(select 1 from %s where %I=$1)',dependency.relation,dependency.column_name)
        into occupied using p_mailbox;
      if occupied then raise exception using errcode='23514',message='Retained mailbox foreign access or dependency'; end if;
    end if;
  end loop;
  if exists(select 1 from private.mail_messages where mailbox_id=p_mailbox and created_by is not null and created_by<>p_target)
    or exists(select 1 from private.mail_labels where mailbox_id=p_mailbox and created_by is not null and created_by<>p_target)
    or exists(select 1 from private.mail_messages m join private.mail_threads t on t.id=m.thread_id
      where (m.mailbox_id=p_mailbox or t.mailbox_id=p_mailbox) and m.mailbox_id<>t.mailbox_id)
    or exists(select 1 from private.mail_message_labels ml join private.mail_messages m on m.id=ml.message_id
      join private.mail_labels l on l.id=ml.label_id
      where (m.mailbox_id=p_mailbox or l.mailbox_id=p_mailbox) and m.mailbox_id<>l.mailbox_id)
    or exists(select 1 from private.mail_stored_objects o left join private.mail_messages m on m.id=o.message_id
      where (o.mailbox_id=p_mailbox or m.mailbox_id=p_mailbox)
      and (o.mailbox_id is distinct from m.mailbox_id or m.id is null or o.deleted_at is not null))
    or exists(select 1 from private.mail_messages m join private.mail_messages other on other.raw_message_id=m.raw_message_id
      where m.mailbox_id=p_mailbox and other.mailbox_id<>p_mailbox)
    or exists(select 1 from private.mail_attachments a join private.mail_messages m on m.id=a.message_id
      left join private.mail_stored_objects o on o.id=a.stored_object_id
      left join private.mail_raw_messages r on r.id=a.raw_message_id
      left join private.mail_stored_objects ro on ro.id=r.stored_object_id
      where (m.mailbox_id=p_mailbox or o.mailbox_id=p_mailbox or ro.mailbox_id=p_mailbox
        or r.id in(select raw_message_id from private.mail_messages where mailbox_id=p_mailbox))
      and (m.mailbox_id<>p_mailbox or (o.id is not null and o.mailbox_id is distinct from m.mailbox_id)
        or (ro.id is not null and ro.mailbox_id is distinct from m.mailbox_id)
        or (a.raw_message_id is not null and a.raw_message_id is distinct from m.raw_message_id)))
    or exists(select 1 from private.mail_raw_messages r join private.mail_stored_objects o on o.id=r.stored_object_id
      left join private.mail_messages m on m.raw_message_id=r.id
      where (o.mailbox_id=p_mailbox or m.mailbox_id=p_mailbox)
      and (o.mailbox_id is distinct from m.mailbox_id or m.id is null))
    or exists(select 1 from private.mail_inbound_jobs j join private.mail_stored_objects o on o.id=j.stored_object_id
      where o.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_message_user_state s join private.mail_messages m on m.id=s.message_id
      where s.mailbox_id=p_mailbox or m.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_thread_user_state s join private.mail_threads t on t.id=s.thread_id
      where s.mailbox_id=p_mailbox or t.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_events e join private.mail_messages m on m.id=e.message_id
      where m.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_notification_receipts r join private.mail_messages m on m.id=r.message_id
      where m.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_message_folders f join private.mail_messages m on m.id=f.message_id
      where m.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_outbound_jobs j join private.mail_messages m on m.id=j.message_id
      where m.mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_auto_draft_jobs j join private.mail_messages m
      on m.id=j.message_id or m.id=j.draft_message_id where m.mailbox_id=p_mailbox) then
    raise exception using errcode='23514',message='Retained mailbox graph unavailable';
  end if;
  -- Hash complete retained rows, including object references and nullable legacy
  -- envelope fields. Never return payloads, storage keys or historical headers.
  foreach relation_name in array array['mail_messages','mail_threads','mail_labels','mail_stored_objects'] loop
    execute format('select encode(extensions.digest(coalesce(string_agg(h,'''' order by h),''''),''sha256''),''hex'')
      from (select encode(extensions.digest(to_jsonb(t)::text,''sha256''),''hex'') h
      from private.%I t where mailbox_id=$1) q',relation_name) into rows_hash using p_mailbox;
    hashes:=hashes||jsonb_build_object(relation_name,rows_hash);
  end loop;
  select hashes||jsonb_build_object('indirect',encode(extensions.digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex'))
    into hashes from (
      select encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') h from private.mail_raw_messages r
        where id in(select raw_message_id from private.mail_messages where mailbox_id=p_mailbox)
      union all select encode(extensions.digest(to_jsonb(a)::text,'sha256'),'hex') from private.mail_attachments a
        where message_id in(select id from private.mail_messages where mailbox_id=p_mailbox)
      union all select encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') from private.mail_recipients r
        where message_id in(select id from private.mail_messages where mailbox_id=p_mailbox)
      union all select encode(extensions.digest(to_jsonb(l)::text,'sha256'),'hex') from private.mail_message_labels l
        where message_id in(select id from private.mail_messages where mailbox_id=p_mailbox)
    ) q;
  return encode(extensions.digest(hashes::text,'sha256'),'hex');
end;
$$;

create function private.employee_retained_mailbox_adoption(p_action text,p_request jsonb,
  p_snapshot text default null,p_ownership_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  observed jsonb; state jsonb; fingerprint text; content_hash text;
  mailbox private.mail_mailboxes%rowtype; receipt private.employee_mailbox_adoptions%rowtype;
  target uuid:=(p_request->>'userId')::uuid; actor uuid:=(p_request->>'actorId')::uuid;
  operation uuid:=(p_request->>'operationId')::uuid;
  source text:=p_request->>'sourceAddress'; destination text:=p_request->>'destinationAddress';
  relation record;
begin
  if p_action is null or p_action not in('inspect','adopt') or p_request is null
    or (p_request-'actorId'-'userId'-'operationId'-'sourceAddress'-'destinationAddress'-'expectedRevision')<>'{}'::jsonb then
    raise exception using errcode='23514',message='Invalid retained adoption request';
  end if;
  -- Reuse the exact migration tuple parser, fresh administrator check and ordered
  -- admission/Auth/workspace/identity/mailbox locks. No provider call is made.
  observed:=private.employee_address_migration('inspect',p_request);
  -- Fence DML and DDL, including absent rows, before catalog/graph validation.
  -- NOWAIT avoids deadlock with existing ingestion and grant transactions.
  for relation in select c.oid::regclass as name from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and (c.relname like 'mail\_%' escape '\' or c.relname in
      ('employee_mailbox_adoptions','employee_address_migrations','infrastructure_employees',
       'employee_creation_intents','employee_creation_operations','employee_restore_operations'))
      and c.relkind in('r','p') order by c.oid
  loop
    execute format('lock table %s in share row exclusive mode nowait',relation.name);
  end loop;
  -- Non-mail address conflicts also need absent-row fences.
  lock table auth.users,auth.identities,public.user_private_details,public.platform_email_roles,
    public.platform_user_roles
    in share mode nowait;
  perform private.assert_employee_administrator(actor);
  observed:=private.employee_address_migration('inspect',p_request);
  select * into receipt from private.employee_mailbox_adoptions where operation_id=operation;
  if receipt.operation_id is not null and receipt.request<>p_request then
    raise exception using errcode='23514',message='Retained adoption binding conflict';
  end if;
  select * into mailbox from private.mail_mailboxes where address=destination;
  if mailbox.id is null or mailbox.type<>'personal' or mailbox.archived_at is not null
    or not exists(select 1 from private.mail_domains where id=mailbox.domain_id and domain='tuturuuu.com' and status='active')
    or exists(select 1 from private.mail_mailboxes where address=source)
    or exists(select 1 from private.employee_mailbox_adoptions where operation_id<>operation
      and (mailbox_id=mailbox.id or request->>'userId'=target::text
        or request->>'sourceAddress' in(source,destination) or request->>'destinationAddress' in(source,destination))) then
    raise exception using errcode='23514',message='Retained mailbox unavailable';
  end if;
  content_hash:=private.employee_retained_mailbox_content(mailbox.id,target);
  if receipt.operation_id is not null then
    if not coalesce((observed->>'sourceVerified')::boolean,false)
      or observed->>'addressOwnership'<>'same_identity'
      or mailbox.id<>receipt.mailbox_id or mailbox.created_by is distinct from target or mailbox.status<>'active'
      or content_hash<>receipt.content_snapshot
      or not exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id=target and role='owner')
      or exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id and user_id<>target)
      or (p_action='adopt' and (not coalesce(p_ownership_confirmed,false) or p_snapshot is distinct from receipt.snapshot)) then
      raise exception using errcode='23514',message='Retained adoption drift';
    end if;
    return jsonb_build_object('status','adopted','operationId',operation,'userId',target,
      'destinationAddress',destination,'expectedRevision',0,'snapshot',receipt.snapshot);
  end if;
  if mailbox.created_by is not null or mailbox.status<>'disabled'
    or exists(select 1 from private.mail_mailbox_members where mailbox_id=mailbox.id)
    or exists(select 1 from private.employee_address_migrations where user_id=target
      or source_address in(source,destination) or destination_address in(source,destination))
    or not coalesce(private.employee_address_google_destination(target,destination),false)
    or (select count(*) from auth.identities where user_id=target)<>1
    or not exists(select 1 from auth.users where id=target and email=source and email_confirmed_at<=clock_timestamp()
      and deleted_at is null and not is_anonymous and coalesce(email_change,'')=''
      and (banned_until is null or banned_until<=clock_timestamp()))
    or not exists(select 1 from public.user_private_details where user_id=target and email=source)
    or exists(select 1 from auth.users where id<>target and lower(email) in(source,destination))
    or exists(select 1 from auth.identities where user_id<>target and lower(identity_data->>'email') in(source,destination))
    or exists(select 1 from public.user_private_details where user_id<>target and lower(email) in(source,destination))
    or exists(select 1 from public.platform_email_roles where lower(email) in(source,destination))
    or exists(select 1 from private.infrastructure_employees where user_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_creation_intents where user_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_creation_operations where target_id=target or staff_email in(source,destination))
    or exists(select 1 from private.employee_restore_operations where user_id=target and phase<>'completed') then
    raise exception using errcode='23514',message='Retained adoption conflict';
  end if;
  state:=private.employee_address_google_state(target,source,destination,false);
  fingerprint:=encode(extensions.digest((p_request||jsonb_build_object('state',state,'content',content_hash))::text,'sha256'),'hex');
  if p_action='inspect' then
    return jsonb_build_object('status','eligible','operationId',operation,'userId',target,
      'destinationAddress',destination,'expectedRevision',0,'snapshot',fingerprint);
  end if;
  if not coalesce(p_ownership_confirmed,false) or p_snapshot is distinct from fingerprint then
    raise exception using errcode='23514',message='Retained ownership confirmation or snapshot unavailable';
  end if;
  update private.mail_mailboxes set created_by=target,status='active' where id=mailbox.id;
  insert into private.mail_mailbox_members(mailbox_id,user_id,role,created_by) values(mailbox.id,target,'owner',actor);
  insert into private.employee_mailbox_adoptions(operation_id,request,mailbox_id,snapshot,content_snapshot,ownership_confirmed)
    values(operation,p_request,mailbox.id,fingerprint,content_hash,true);
  return jsonb_build_object('status','adopted','operationId',operation,'userId',target,
    'destinationAddress',destination,'expectedRevision',0,'snapshot',fingerprint);
end;
$$;
revoke all on function private.employee_retained_mailbox_content(uuid,uuid),
  private.employee_retained_mailbox_adoption(text,jsonb,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.employee_retained_mailbox_adoption(text,jsonb,text,boolean) to service_role;

-- An adopted mailbox cannot be reserved through a replacement migration UUID.
create function private.guard_employee_mailbox_adoption_binding()
returns trigger language plpgsql security definer set search_path='' as $$
declare receipt private.employee_mailbox_adoptions%rowtype;
begin
  select * into receipt from private.employee_mailbox_adoptions
    where request->>'userId'=new.user_id::text
      or request->>'sourceAddress' in(new.source_address,new.destination_address)
      or request->>'destinationAddress' in(new.source_address,new.destination_address);
  if found and (new.operation_id<>receipt.operation_id or
    new.binding-'immutableFingerprint'-'providerIdentityFingerprint'<>receipt.request) then
    raise exception using errcode='23514',message='Retained adoption requires original migration operation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_employee_mailbox_adoption_binding() from public,anon,authenticated,service_role;
create trigger guard_employee_mailbox_adoption_binding before insert or update on private.employee_address_migrations
  for each row execute function private.guard_employee_mailbox_adoption_binding();
