begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

select ok(
  to_regclass('public.notification_email_config') is null,
  'notification_email_config is no longer in the public schema'
);

select ok(
  to_regclass('public.task_reminder_sent') is null,
  'task_reminder_sent is no longer in the public schema'
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

select * from finish();

rollback;
