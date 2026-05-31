begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

create temporary table topic_announcement_private_tables(table_name text primary key)
on commit drop;

insert into topic_announcement_private_tables(table_name)
values
  ('topic_announcement_contacts'),
  ('topic_announcement_contact_verifications'),
  ('topic_announcement_batches'),
  ('topic_announcements'),
  ('topic_announcement_recipients'),
  ('topic_announcement_attachments'),
  ('topic_announcement_templates');

select ok(
  to_regclass(format('public.%I', table_name)) is null,
  format('public.%I is removed after private schema migration', table_name)
)
from topic_announcement_private_tables
order by table_name;

select ok(
  to_regclass(format('private.%I', table_name)) is not null,
  format('private.%I exists after private schema migration', table_name)
)
from topic_announcement_private_tables
order by table_name;

select ok(
  has_table_privilege(
    'service_role',
    format('private.%I', table_name),
    privilege_name
  ),
  format(
    'service_role can %s private.%I',
    lower(privilege_name),
    table_name
  )
)
from topic_announcement_private_tables
cross join (
  values
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE')
) as privileges(privilege_name)
order by table_name, privilege_name;

select ok(
  not exists (
    select 1
    from topic_announcement_private_tables topic_table
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    cross join (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE')
    ) as privileges(privilege_name)
    where has_table_privilege(
      roles.role_name,
      format('private.%I', topic_table.table_name),
      privileges.privilege_name
    )
  ),
  'anon and authenticated have no direct CRUD privileges on private topic announcement tables'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        select table_name
        from topic_announcement_private_tables
      )
      and (
        'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  ),
  0,
  'private topic announcement tables have no anon or authenticated RLS policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        select table_name
        from topic_announcement_private_tables
      )
      and 'service_role' = any(roles)
  ),
  7,
  'private topic announcement tables keep one service-role RLS policy each'
);

select ok(
  to_regprocedure(
    'public.topic_announcement_contact_has_linked_verified_email(uuid)'
  ) is null,
  'public linked-email helper is removed'
);

select ok(
  to_regprocedure(
    'private.topic_announcement_contact_has_linked_verified_email(uuid)'
  ) is not null,
  'private linked-email helper exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.topic_announcement_contact_has_linked_verified_email(uuid)',
    'EXECUTE'
  ),
  'service_role can execute the private linked-email helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.topic_announcement_contact_has_linked_verified_email(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the private linked-email helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.topic_announcement_contact_has_linked_verified_email(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the private linked-email helper'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('enforce_topic_announcement_contact_scope()'),
        ('enforce_topic_announcement_verification_scope()'),
        ('enforce_topic_announcement_scope()'),
        ('enforce_topic_announcement_recipient_scope()'),
        ('enforce_topic_announcement_attachment_scope()')
    ) as funcs(signature)
    where to_regprocedure(format('private.%s', funcs.signature)) is null
      or to_regprocedure(format('public.%s', funcs.signature)) is not null
  ),
  'topic announcement trigger helpers live only in private schema'
);

select * from finish();

rollback;
