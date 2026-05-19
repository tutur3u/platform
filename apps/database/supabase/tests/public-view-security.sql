begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(3);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and (
        has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'select')
        or has_table_privilege(
          'authenticated',
          format('%I.%I', n.nspname, c.relname),
          'select'
        )
      )
      and not (
        coalesce(c.reloptions, array[]::text[])
        && array['security_invoker=true', 'security_invoker=on']
      )
  ),
  'client-facing public views run with security_invoker'
);

select ok(
  not has_table_privilege('anon', 'public.audit_logs', 'select')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'select'),
  'public.audit_logs is not directly exposed to client roles'
);

select ok(
  not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.cmd in ('SELECT', 'ALL')
      and p.roles && array['public'::name, 'anon'::name, 'authenticated'::name]
      and replace(coalesce(p.qual, ''), ' ', '') in ('true', '(true)')
      and p.tablename not in (
        'ai_credit_feature_access',
        'ai_credit_plan_allocations',
        'calendar_event_colors',
        'currency_exchange_rates',
        'vietnamese_holidays'
      )
  ),
  'unconditional client-facing select policies are limited to reference tables'
);

select * from finish();

rollback;
