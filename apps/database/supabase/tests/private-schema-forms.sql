begin;

create extension if not exists pgtap with schema extensions;

select plan(88);

create temporary table form_private_tables(table_name text primary key)
on commit drop;

insert into form_private_tables(table_name)
values
  ('form_logic_rules'),
  ('form_question_options'),
  ('form_questions'),
  ('form_response_answers'),
  ('form_responses'),
  ('form_sections'),
  ('form_sessions'),
  ('form_share_links'),
  ('forms');

create temporary table form_private_functions(signature text primary key)
on commit drop;

insert into form_private_functions(signature)
values
  ('get_form_workspace_id(uuid)'),
  ('can_manage_form(uuid)'),
  ('can_view_form_analytics(uuid)'),
  ('form_id_from_section(uuid)'),
  ('form_id_from_question(uuid)'),
  ('form_id_from_share_link(uuid)'),
  ('form_id_from_response(uuid)'),
  ('touch_form_updated_at()'),
  ('get_form_matched_response_ids(uuid,text)'),
  ('get_form_response_page(uuid,text,integer,integer)'),
  ('get_form_response_rollups(uuid,text)'),
  ('get_form_analytics_overview(uuid)');

select ok(
  to_regclass(format('public.%I', table_name)) is null,
  format('public.%I is removed after private schema migration', table_name)
)
from form_private_tables
order by table_name;

select ok(
  to_regclass(format('private.%I', table_name)) is not null,
  format('private.%I exists after private schema migration', table_name)
)
from form_private_tables
order by table_name;

select ok(
  has_table_privilege(
    'service_role',
    format('private.%I', table_name),
    privilege_name
  ),
  format('service_role can %s private.%I', lower(privilege_name), table_name)
)
from form_private_tables
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
    from form_private_tables form_table
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
      format('private.%I', form_table.table_name),
      privileges.privilege_name
    )
  ),
  'anon and authenticated have no direct CRUD privileges on private forms tables'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        select table_name
        from form_private_tables
      )
      and (
        'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  ),
  0,
  'private forms tables have no anon or authenticated RLS policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        select table_name
        from form_private_tables
      )
      and 'service_role' = any(roles)
  ),
  9,
  'private forms tables keep one service-role RLS policy each'
);

select ok(
  not exists (
    select 1
    from form_private_functions
    where to_regprocedure(format('public.%s', signature)) is not null
  ),
  'public forms helper and analytics functions are removed'
);

select ok(
  to_regprocedure(format('private.%s', signature)) is not null,
  format('private.%s exists after private schema migration', signature)
)
from form_private_functions
order by signature;

select ok(
  has_function_privilege(
    'service_role',
    format('private.%s', signature),
    'EXECUTE'
  ),
  format('service_role can execute private.%s', signature)
)
from form_private_functions
order by signature;

select ok(
  not exists (
    select 1
    from form_private_functions form_function
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_function_privilege(
      roles.role_name,
      format('private.%s', form_function.signature),
      'EXECUTE'
    )
  ),
  'anon and authenticated cannot execute private forms functions'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger
    join pg_class relation
      on relation.oid = trigger.tgrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'forms'
      and trigger.tgname = 'forms_touch_updated_at'
      and not trigger.tgisinternal
  ),
  'private.forms keeps the updated_at trigger'
);

insert into private.forms (
  id,
  ws_id,
  creator_id,
  title,
  status,
  access_mode
)
values (
  '52000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'pgTAP private form',
  'published',
  'anonymous'
);

insert into private.form_sections (
  id,
  form_id,
  title,
  position
)
values (
  '52000000-0000-0000-0000-000000000101',
  '52000000-0000-0000-0000-000000000001',
  'pgTAP section',
  0
);

insert into private.form_questions (
  id,
  form_id,
  section_id,
  type,
  title,
  position
)
values (
  '52000000-0000-0000-0000-000000000201',
  '52000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000101',
  'single_choice',
  'pgTAP question',
  0
);

insert into private.form_question_options (
  id,
  question_id,
  label,
  value,
  position
)
values (
  '52000000-0000-0000-0000-000000000301',
  '52000000-0000-0000-0000-000000000201',
  'pgTAP option',
  'pgtap-option',
  0
);

insert into private.form_share_links (
  id,
  form_id,
  code,
  active,
  created_by_user_id
)
values (
  '52000000-0000-0000-0000-000000000401',
  '52000000-0000-0000-0000-000000000001',
  'PGTAPFORM001',
  true,
  '00000000-0000-0000-0000-000000000001'
);

insert into private.form_sessions (
  id,
  form_id,
  share_link_id,
  session_token,
  viewed_at,
  started_at,
  submitted_at,
  last_question_id,
  last_section_id
)
values (
  '52000000-0000-0000-0000-000000000501',
  '52000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000401',
  'pgtap-form-session',
  now() - interval '2 minutes',
  now() - interval '90 seconds',
  now() - interval '30 seconds',
  '52000000-0000-0000-0000-000000000201',
  '52000000-0000-0000-0000-000000000101'
);

insert into private.form_responses (
  id,
  form_id,
  share_link_id,
  session_id,
  respondent_email,
  duration_seconds
)
values (
  '52000000-0000-0000-0000-000000000601',
  '52000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000401',
  '52000000-0000-0000-0000-000000000501',
  'pgtap@example.com',
  60
);

insert into private.form_response_answers (
  id,
  response_id,
  question_id,
  question_title,
  question_type,
  answer_text
)
values (
  '52000000-0000-0000-0000-000000000701',
  '52000000-0000-0000-0000-000000000601',
  '52000000-0000-0000-0000-000000000201',
  'pgTAP question',
  'single_choice',
  'pgtap-option'
);

select is(
  (
    select count(*)::integer
    from private.get_form_matched_response_ids(
      '52000000-0000-0000-0000-000000000001',
      'pgtap-option'
    )
  ),
  1,
  'private matched-response RPC searches private answer rows'
);

select is(
  (
    select count(*)::integer
    from private.get_form_response_page(
      '52000000-0000-0000-0000-000000000001',
      null,
      10,
      1
    )
  ),
  1,
  'private response-page RPC reads private response rows'
);

select is(
  (
    private.get_form_response_rollups(
      '52000000-0000-0000-0000-000000000001',
      null
    )->>'total'
  )::integer,
  1,
  'private response-rollups RPC reads private form rows'
);

select is(
  (
    private.get_form_analytics_overview(
      '52000000-0000-0000-0000-000000000001'
    )->>'totalSubmissions'
  )::integer,
  1,
  'private analytics overview RPC reads private form rows'
);

select * from finish();

rollback;
