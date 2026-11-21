-- Register the sender-block foreign key in the closed catalog. The existing
-- dependency checks still require sender blocks to be absent during adoption.
CREATE OR REPLACE FUNCTION private.employee_retained_mailbox_content(p_mailbox uuid, p_target uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  inventory text[];
  hashes jsonb;
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
    'private.mail_sender_blocks.mailbox_id',
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
  if exists(select 1 from private.infrastructure_employees where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_ai_conversations where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_ai_tool_executions where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_auto_draft_jobs where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_domains where catch_all_mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_events where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_folders where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_mcp_credential_mailboxes where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_message_user_state where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_outbound_jobs where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_sender_blocks where mailbox_id=p_mailbox)
    or exists(select 1 from private.mail_thread_user_state where mailbox_id=p_mailbox) then
    raise exception using errcode='23514',message='Retained mailbox foreign access or dependency';
  end if;
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
  with mailbox_rows(relation_name, payload) as (
    select 'mail_messages', to_jsonb(m)::text
    from private.mail_messages m where m.mailbox_id=p_mailbox
    union all
    select 'mail_threads', to_jsonb(t)::text
    from private.mail_threads t where t.mailbox_id=p_mailbox
    union all
    select 'mail_labels', to_jsonb(l)::text
    from private.mail_labels l where l.mailbox_id=p_mailbox
    union all
    select 'mail_stored_objects', to_jsonb(o)::text
    from private.mail_stored_objects o where o.mailbox_id=p_mailbox
  ), row_hashes as (
    select relation_name, encode(extensions.digest(payload,'sha256'),'hex') as hash
    from mailbox_rows
  ), relation_hashes as (
    select
      allowed.relation_name,
      encode(extensions.digest(
        coalesce(string_agg(row_hashes.hash,'' order by row_hashes.hash),''),
        'sha256'
      ),'hex') as hash
    from (values
      ('mail_messages'), ('mail_threads'), ('mail_labels'), ('mail_stored_objects')
    ) as allowed(relation_name)
    left join row_hashes using (relation_name)
    group by allowed.relation_name
  )
  select jsonb_object_agg(relation_name, hash) into hashes from relation_hashes;
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
$function$;

REVOKE ALL ON FUNCTION private.employee_retained_mailbox_content(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: no-grant (internal)
