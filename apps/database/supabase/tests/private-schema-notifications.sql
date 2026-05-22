begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(38);

select ok(
  to_regclass('public.notification_email_config') is null,
  'notification_email_config is no longer in the public schema'
);

select ok(
  to_regclass('public.task_reminder_sent') is null,
  'task_reminder_sent is no longer in the public schema'
);

select ok(
  to_regclass('public.notification_batches') is null,
  'notification_batches is no longer in the public schema'
);

select ok(
  to_regclass('public.notification_delivery_log') is null,
  'notification_delivery_log is no longer in the public schema'
);

select ok(
  to_regclass('private.notification_email_config') is not null,
  'notification_email_config exists in the private schema'
);

select ok(
  to_regclass('private.task_reminder_sent') is not null,
  'task_reminder_sent exists in the private schema'
);

select ok(
  to_regclass('private.notification_batches') is not null,
  'notification_batches exists in the private schema'
);

select ok(
  to_regclass('private.notification_delivery_log') is not null,
  'notification_delivery_log exists in the private schema'
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
  not has_table_privilege('anon', 'private.notification_email_config', 'select'),
  'anon cannot select private notification email config'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.notification_email_config',
    'select'
  ),
  'authenticated cannot select private notification email config'
);

select ok(
  not has_table_privilege('authenticated', 'private.task_reminder_sent', 'select'),
  'authenticated cannot select private task reminder tracking'
);

select ok(
  not has_table_privilege('anon', 'private.notification_batches', 'select'),
  'anon cannot select private notification batches'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.notification_batches',
    'select'
  ),
  'authenticated cannot select private notification batches'
);

select ok(
  not has_table_privilege('anon', 'private.notification_delivery_log', 'select'),
  'anon cannot select private notification delivery log'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.notification_delivery_log',
    'select'
  ),
  'authenticated cannot select private notification delivery log'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('notification_batches'),
        ('notification_delivery_log')
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
  'service role can manage private notification batch internals'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'private'
      and tablename in ('notification_batches', 'notification_delivery_log')
  ),
  'private notification batch internals are not in the realtime publication'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_immediate_notification_email_configs(text[])',
    'execute'
  ),
  'anon cannot execute immediate email config RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_immediate_notification_email_configs(text[])',
    'execute'
  ),
  'authenticated cannot execute immediate email config RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.task_reminder_already_sent(uuid, uuid, text)',
    'execute'
  ),
  'authenticated cannot execute task reminder check RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_task_reminder_sent(uuid, uuid, text, uuid)',
    'execute'
  ),
  'authenticated cannot execute task reminder write RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_notification_email_config(text)',
    'execute'
  ),
  'authenticated cannot execute notification email config helper directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_notification(uuid, uuid, text, text, text, text, text, jsonb, text, uuid, uuid, public.notification_scope, public.notification_priority)',
    'execute'
  ),
  'anon cannot execute notification creation helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_notification(uuid, uuid, text, text, text, text, text, jsonb, text, uuid, uuid, public.notification_scope, public.notification_priority)',
    'execute'
  ),
  'authenticated cannot execute notification creation helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_or_create_notification_batch(uuid, uuid, text, integer, text, public.notification_delivery_mode)',
    'execute'
  ),
  'authenticated cannot execute notification batch helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.process_notification_batches()',
    'execute'
  ),
  'authenticated cannot execute deprecated batch processor directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.trigger_immediate_notification_send()',
    'execute'
  ),
  'authenticated cannot execute immediate notification trigger helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.update_notification_email_config_updated_at()',
    'execute'
  ),
  'authenticated cannot execute notification email config trigger helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_immediate_notification_email_configs(text[])',
    'execute'
  ),
  'service role can execute immediate email config RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.task_reminder_already_sent(uuid, uuid, text)',
    'execute'
  ),
  'service role can execute task reminder check RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_task_reminder_sent(uuid, uuid, text, uuid)',
    'execute'
  ),
  'service role can execute task reminder write RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_notification_email_config(text)',
    'execute'
  ),
  'service role can execute notification email config helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_notification(uuid, uuid, text, text, text, text, text, jsonb, text, uuid, uuid, public.notification_scope, public.notification_priority)',
    'execute'
  ),
  'service role can execute notification creation helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_or_create_notification_batch(uuid, uuid, text, integer, text, public.notification_delivery_mode)',
    'execute'
  ),
  'service role can execute notification batch helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.process_notification_batches()',
    'execute'
  ),
  'service role can execute deprecated batch processor helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.trigger_immediate_notification_send()',
    'execute'
  ),
  'service role can execute immediate notification trigger helper'
);

select * from finish();

rollback;
