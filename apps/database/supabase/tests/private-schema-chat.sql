begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(52);

select ok(
  to_regclass('private.chat_conversations') is not null,
  'chat conversations live in the private schema'
);

select ok(
  to_regclass('private.chat_conversation_members') is not null,
  'chat conversation members live in the private schema'
);

select ok(
  to_regclass('private.chat_messages') is not null,
  'chat messages live in the private schema'
);

select ok(
  to_regclass('private.chat_message_attachments') is not null,
  'chat message attachments live in the private schema'
);

select ok(
  to_regclass('private.chat_message_reactions') is not null,
  'chat message reactions live in the private schema'
);

select ok(
  to_regclass('private.chat_conversation_ai_settings') is not null,
  'chat AI settings live in the private schema'
);

select has_column(
  'private',
  'chat_conversation_ai_settings',
  'thinking_mode',
  'chat AI settings include thinking mode'
);

select has_column(
  'private',
  'chat_conversation_ai_settings',
  'credit_source',
  'chat AI settings include credit source'
);

select has_column(
  'private',
  'chat_conversation_ai_settings',
  'credit_ws_id',
  'chat AI settings include credit workspace id'
);

select ok(
  to_regclass('private.chat_audit_events') is not null,
  'chat audit events live in the private schema'
);

select ok(
  to_regclass('public.chat_conversations') is null,
  'chat conversations are not exposed as a public table'
);

select ok(
  to_regclass('public.chat_messages') is null,
  'chat messages are not exposed as a public table'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  has_schema_privilege('service_role', 'private', 'usage'),
  'service role can use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('chat_conversations'),
        ('chat_conversation_members'),
        ('chat_messages'),
        ('chat_message_attachments'),
        ('chat_message_reactions'),
        ('chat_conversation_ai_settings'),
        ('chat_audit_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'anon has no chat table privileges'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('chat_conversations'),
        ('chat_conversation_members'),
        ('chat_messages'),
        ('chat_message_attachments'),
        ('chat_message_reactions'),
        ('chat_conversation_ai_settings'),
        ('chat_audit_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated has no chat table privileges'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('chat_conversations'),
        ('chat_conversation_members'),
        ('chat_messages'),
        ('chat_message_attachments'),
        ('chat_message_reactions'),
        ('chat_conversation_ai_settings'),
        ('chat_audit_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can manage private chat tables'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'private'
      and tablename like 'chat_%'
  ),
  'private chat tables are not published directly to Supabase Realtime'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_list_conversations(uuid, uuid)',
    'execute'
  ),
  'authenticated cannot execute chat_list_conversations directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_create_conversation(uuid, uuid, jsonb)',
    'execute'
  ),
  'authenticated cannot execute chat_create_conversation directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text)',
    'execute'
  ),
  'authenticated cannot execute chat_send_message directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_edit_message(uuid, uuid, uuid, uuid, text)',
    'execute'
  ),
  'authenticated cannot execute chat_edit_message directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_delete_message(uuid, uuid, uuid, uuid)',
    'execute'
  ),
  'authenticated cannot execute chat_delete_message directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_prepare_attachment(uuid, uuid, uuid, text, bigint)',
    'execute'
  ),
  'authenticated cannot execute chat_prepare_attachment directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_get_attachment(uuid, uuid, uuid, uuid)',
    'execute'
  ),
  'authenticated cannot execute chat_get_attachment directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb)',
    'execute'
  ),
  'authenticated cannot execute chat_persist_ai_message directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_list_conversations(uuid, uuid)',
    'execute'
  ),
  'service role can execute chat_list_conversations'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_get_conversation(uuid, uuid, uuid)',
    'execute'
  ),
  'service role can execute chat_get_conversation'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_create_conversation(uuid, uuid, jsonb)',
    'execute'
  ),
  'service role can execute chat_create_conversation'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_list_messages(uuid, uuid, uuid, integer, timestamptz)',
    'execute'
  ),
  'service role can execute chat_list_messages'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_send_message(uuid, uuid, uuid, text, uuid, jsonb, text)',
    'execute'
  ),
  'service role can execute chat_send_message'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_edit_message(uuid, uuid, uuid, uuid, text)',
    'execute'
  ),
  'service role can execute chat_edit_message'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_delete_message(uuid, uuid, uuid, uuid)',
    'execute'
  ),
  'service role can execute chat_delete_message'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_set_read_state(uuid, uuid, uuid, uuid)',
    'execute'
  ),
  'service role can execute chat_set_read_state'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_toggle_reaction(uuid, uuid, uuid, uuid, text)',
    'execute'
  ),
  'service role can execute chat_toggle_reaction'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_search_directory(uuid, uuid, text, integer)',
    'execute'
  ),
  'service role can execute chat_search_directory'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_search_messages(uuid, uuid, text, integer)',
    'execute'
  ),
  'service role can execute chat_search_messages'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_prepare_attachment(uuid, uuid, uuid, text, bigint)',
    'execute'
  ),
  'service role can execute chat_prepare_attachment'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_finalize_attachment(uuid, uuid, uuid, jsonb)',
    'execute'
  ),
  'service role can execute chat_finalize_attachment'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_get_attachment(uuid, uuid, uuid, uuid)',
    'execute'
  ),
  'service role can execute chat_get_attachment'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb)',
    'execute'
  ),
  'service role can execute chat_persist_ai_message'
);

select ok(
  pg_get_functiondef(
    'private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb)'::regprocedure
  ) not like '%chat_send_message%'
    and pg_get_functiondef(
      'private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb)'::regprocedure
    ) not like '%manage_chat%'
    and pg_get_functiondef(
      'private.chat_persist_ai_message(uuid, uuid, uuid, text, jsonb)'::regprocedure
    ) like '%type = ''ai''%',
  'chat_persist_ai_message is the service-owned native AI assistant persist path'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'chat_conversations'
  ) = false,
  'chat_conversations keeps deny-by-default RLS with no permissive policies'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'chat_messages'
  ) = false,
  'chat_messages keeps deny-by-default RLS with no permissive policies'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'chat_message_attachments'
  ) = false,
  'chat_message_attachments keeps deny-by-default RLS with no permissive policies'
);

select ok(
  exists (
    select 1
    from unnest(enum_range(null::public.workspace_role_permission)) as permission
    where permission::text = 'view_chat'
  ),
  'view_chat permission exists'
);

select ok(
  exists (
    select 1
    from unnest(enum_range(null::public.workspace_role_permission)) as permission
    where permission::text = 'create_chat'
  ),
  'create_chat permission exists'
);

select ok(
  exists (
    select 1
    from unnest(enum_range(null::public.workspace_role_permission)) as permission
    where permission::text = 'manage_chat'
  ),
  'manage_chat permission exists'
);

select ok(
  exists (
    select 1
    from unnest(enum_range(null::public.workspace_role_permission)) as permission
    where permission::text = 'moderate_chat'
  ),
  'moderate_chat permission exists'
);

select ok(
  exists (
    select 1
    from public.workspace_default_permissions
    where permission = 'view_chat'::public.workspace_role_permission
      and member_type = 'MEMBER'::public.workspace_member_type
      and enabled = true
  ),
  'member defaults include view_chat'
);

select ok(
  exists (
    select 1
    from public.workspace_default_permissions
    where permission = 'create_chat'::public.workspace_role_permission
      and member_type = 'MEMBER'::public.workspace_member_type
      and enabled = true
  ),
  'member defaults include create_chat'
);

select * from finish();

rollback;
