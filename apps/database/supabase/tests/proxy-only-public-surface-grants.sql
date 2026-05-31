begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

create temporary table proxy_only_public_tables(table_name text primary key)
on commit drop;

insert into proxy_only_public_tables(table_name)
values
  ('form_questions'),
  ('form_response_answers'),
  ('form_sections'),
  ('forms'),
  ('nova_challenge_criteria'),
  ('nova_challenges'),
  ('nova_problem_test_cases'),
  ('nova_problems'),
  ('nova_submission_test_cases'),
  ('nova_teams'),
  ('topic_announcement_batches'),
  ('topic_announcement_contact_verifications'),
  ('topic_announcement_contacts'),
  ('topic_announcement_recipients'),
  ('topic_announcements'),
  ('time_tracking_request_activity'),
  ('time_tracking_request_comments'),
  ('time_tracking_requests'),
  ('user_group_post_checks'),
  ('user_group_post_logs'),
  ('user_group_posts'),
  ('user_linked_promotions'),
  ('workspace_credit_packs'),
  ('workspace_promotions'),
  ('workspace_subscription_products'),
  ('workspace_wallets');

select ok(
  not exists (
    select 1
    from proxy_only_public_tables pt
    join pg_class cls
      on cls.relname = pt.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege(
        roles.role_name,
        format('public.%I', pt.table_name),
        privileges.privilege_name
      )
  ),
  'proxy-only public relations grant no direct CRUD privileges to anon or authenticated'
);

select ok(
  not exists (
    select 1
    from proxy_only_public_tables pt
    join pg_class cls
      on cls.relname = pt.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p', 'v', 'm')
      and not has_table_privilege(
        'service_role',
        format('public.%I', pt.table_name),
        privileges.privilege_name
      )
  ),
  'service role keeps CRUD privileges for proxy-owned API routes'
);

select ok(
  not exists (
    select 1
    from proxy_only_public_tables pt
    join pg_class cls
      on cls.relname = pt.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and not cls.relrowsecurity
  ),
  'proxy-only public base tables keep RLS enabled while awaiting private-schema ports'
);

select ok(
  not exists (
    select 1
    from pg_default_acl default_acl
    join pg_roles owner_role
      on owner_role.oid = default_acl.defaclrole
    join pg_namespace default_schema
      on default_schema.oid = default_acl.defaclnamespace
    cross join aclexplode(default_acl.defaclacl) exploded_acl
    left join pg_roles grantee_role
      on grantee_role.oid = exploded_acl.grantee
    where owner_role.rolname = 'postgres'
      and default_schema.nspname = 'public'
      and default_acl.defaclobjtype = 'r'
      and (
        exploded_acl.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'postgres-owned future public tables require explicit grants'
);

select ok(
  not exists (
    select 1
    from pg_default_acl default_acl
    join pg_roles owner_role
      on owner_role.oid = default_acl.defaclrole
    join pg_namespace default_schema
      on default_schema.oid = default_acl.defaclnamespace
    cross join aclexplode(default_acl.defaclacl) exploded_acl
    left join pg_roles grantee_role
      on grantee_role.oid = exploded_acl.grantee
    where owner_role.rolname = 'postgres'
      and default_schema.nspname = 'public'
      and default_acl.defaclobjtype = 'S'
      and (
        exploded_acl.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'postgres-owned future public sequences require explicit grants'
);

select ok(
  not exists (
    select 1
    from pg_default_acl default_acl
    join pg_roles owner_role
      on owner_role.oid = default_acl.defaclrole
    join pg_namespace default_schema
      on default_schema.oid = default_acl.defaclnamespace
    cross join aclexplode(default_acl.defaclacl) exploded_acl
    left join pg_roles grantee_role
      on grantee_role.oid = exploded_acl.grantee
    where owner_role.rolname = 'postgres'
      and default_schema.nspname = 'public'
      and default_acl.defaclobjtype = 'f'
      and (
        exploded_acl.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'postgres-owned future public functions require explicit execute grants'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon still cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated still cannot use the private schema'
);

select * from finish();

rollback;
