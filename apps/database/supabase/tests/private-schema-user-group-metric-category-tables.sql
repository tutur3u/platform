begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(35);

select ok(
  to_regclass('public.user_group_metric_categories') is null,
  'user group metric categories are no longer in the public schema'
);

select ok(
  to_regclass('public.user_group_metric_category_links') is null,
  'user group metric category links are no longer in the public schema'
);

select ok(
  to_regclass('private.user_group_metric_categories') is not null,
  'user group metric categories exist in the private schema'
);

select ok(
  to_regclass('private.user_group_metric_category_links') is not null,
  'user group metric category links exist in the private schema'
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
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    cross join (
      values
        ('user_group_metric_categories'),
        ('user_group_metric_category_links')
    ) as tables(table_name)
    where has_table_privilege(
      'anon',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private metric category tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    cross join (
      values
        ('user_group_metric_categories'),
        ('user_group_metric_category_links')
    ) as tables(table_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private metric category tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    cross join (
      values
        ('user_group_metric_categories'),
        ('user_group_metric_category_links')
    ) as tables(table_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private metric category tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.user_group_metric_categories'::regclass
  ),
  'private user group metric categories have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.user_group_metric_category_links'::regclass
  ),
  'private user group metric category links have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_group_metric_categories'
      and policyname = 'Service role can manage private metric categories'
  ),
  'private user group metric categories have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_group_metric_category_links'
      and policyname = 'Service role can manage private metric category links'
  ),
  'private user group metric category links have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'user_group_metric_categories',
        'user_group_metric_category_links'
      )
      and policyname = 'Enable all access for organization members'
  ),
  'old organization-member metric category policies were removed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'user_group_metric_categories_ws_id_fkey'
      and conrelid = 'private.user_group_metric_categories'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private metric categories still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'user_group_metric_category_links_category_id_fkey'
      and conrelid = 'private.user_group_metric_category_links'::regclass
      and confrelid = 'private.user_group_metric_categories'::regclass
  ),
  'private metric category links reference private categories'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'user_group_metric_category_links_metric_id_fkey'
      and conrelid = 'private.user_group_metric_category_links'::regclass
      and confrelid = 'public.user_group_metrics'::regclass
  ),
  'private metric category links still reference public metrics'
);

select ok(
  to_regclass('private.user_group_metric_categories_pkey') is not null,
  'metric category primary-key index moved with the private table'
);

select ok(
  to_regclass('private.user_group_metric_category_links_pkey') is not null,
  'metric category link primary-key index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.user_group_metric_categories'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'private metric categories keep the strict text trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.user_group_metric_categories'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'private metric categories keep audit tracking'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.user_group_metric_category_links'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'private metric category links keep audit tracking'
);

select ok(
  to_regprocedure('public.get_user_group_metric_categories_count(uuid)') is null,
  'old public metric category count function was removed'
);

select ok(
  to_regprocedure('private.get_user_group_metric_categories_count(uuid)') is not null,
  'private metric category count function exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_user_group_metric_categories_count(uuid)',
    'execute'
  ),
  'authenticated cannot execute private metric category count function'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_user_group_metric_categories_count(uuid)',
    'execute'
  ),
  'service role can execute private metric category count function'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.ensure_user_group_metric_category_ids(uuid, uuid[])'::regprocedure),
        ('private.admin_create_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)'::regprocedure),
        ('private.admin_update_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)'::regprocedure)
    ) as functions(signature)
    where has_function_privilege('authenticated', functions.signature, 'execute')
  ),
  'authenticated cannot execute private metric category helper RPCs'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.ensure_user_group_metric_category_ids(uuid, uuid[])'::regprocedure),
        ('private.admin_create_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)'::regprocedure),
        ('private.admin_update_user_group_metric_with_audit_actor(uuid, uuid, jsonb, uuid[], uuid)'::regprocedure)
    ) as functions(signature)
    where not has_function_privilege('service_role', functions.signature, 'execute')
  ),
  'service role can execute private metric category helper RPCs'
);

set local role service_role;

insert into public.workspace_user_groups (
  id,
  name,
  ws_id
) values (
  '10000000-0000-0000-0000-000000000201',
  'pgTAP private metric category group',
  '00000000-0000-0000-0000-000000000000'
);

insert into private.user_group_metric_categories (
  id,
  ws_id,
  name,
  description
) values (
  '10000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP metric category',
  'private metric category test'
);

do $$
begin
  perform private.admin_create_user_group_metric_with_audit_actor(
    p_ws_id := '00000000-0000-0000-0000-000000000000',
    p_group_id := '10000000-0000-0000-0000-000000000201',
    p_payload := '{"name":"pgTAP metric","unit":"points","factor":1,"is_weighted":true}'::jsonb,
    p_category_ids := array['10000000-0000-0000-0000-000000000202']::uuid[],
    p_actor_auth_uid := '00000000-0000-0000-0000-000000000001'
  );
end
$$;

reset role;

select pass(
  'service role can create a metric linked to a private category through the private RPC'
);

select ok(
  exists (
    select 1
    from private.user_group_metric_category_links link
    join public.user_group_metrics metric
      on metric.id = link.metric_id
    where link.category_id = '10000000-0000-0000-0000-000000000202'
      and metric.name = 'pgTAP metric'
  ),
  'private metric category link was created by the private RPC'
);

select ok(
  private.get_user_group_metric_categories_count(
    '00000000-0000-0000-0000-000000000000'
  ) >= 1,
  'private metric category count function reads private categories'
);

select ok(
  exists (
    select 1
    from audit.record_version
    where table_schema = 'private'
      and table_name = 'user_group_metric_categories'
      and record->>'id' = '10000000-0000-0000-0000-000000000202'
  ),
  'private metric category changes are audited with private schema'
);

select ok(
  exists (
    select 1
    from private.user_group_activity_feed(
      '00000000-0000-0000-0000-000000000000',
      now() - interval '1 hour',
      now() + interval '1 hour'
    ) activity
    where activity.table_name = 'user_group_metric_categories'
      and activity.resource_type = 'metric_category'
      and activity.resource_id = '10000000-0000-0000-0000-000000000202'
  ),
  'user group activity feed includes private metric category audit rows'
);

set local role service_role;

do $$
begin
  perform private.admin_update_user_group_metric_with_audit_actor(
    p_ws_id := '00000000-0000-0000-0000-000000000000',
    p_metric_id := (
      select id
      from public.user_group_metrics
      where name = 'pgTAP metric'
      limit 1
    ),
    p_payload := '{}'::jsonb,
    p_category_ids := array[]::uuid[],
    p_actor_auth_uid := '00000000-0000-0000-0000-000000000001'
  );
end
$$;

reset role;

select pass(
  'service role can update metric category links through the private RPC'
);

select ok(
  not exists (
    select 1
    from private.user_group_metric_category_links
    where category_id = '10000000-0000-0000-0000-000000000202'
  ),
  'private metric category links can be cleared by the private RPC'
);

select * from finish();

rollback;
