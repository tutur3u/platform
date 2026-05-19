begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  not exists (
    select 1
    from (
      values
        ('email_bounce_complaints'),
        ('ai_credit_reservations')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'moved server-owned tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('email_bounce_complaints'),
        ('ai_credit_reservations')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'moved server-owned tables exist in the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('ai_chat_members'),
        ('nova_challenge_manager_emails'),
        ('poll_guest_permissions'),
        ('poll_user_permissions')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'unconsumed cleanup tables were dropped from public'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('ai_chat_members'),
        ('nova_challenge_manager_emails'),
        ('poll_guest_permissions'),
        ('poll_user_permissions')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is not null
  ),
  'unconsumed cleanup tables were not moved to private'
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
        ('email_bounce_complaints'),
        ('ai_credit_reservations')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
  ),
  'anon cannot select moved private tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('email_bounce_complaints'),
        ('ai_credit_reservations')
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
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate moved private tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('email_bounce_complaints'),
        ('ai_credit_reservations')
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
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate moved private tables'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.email_bounce_complaints'::regclass),
  'private email bounce complaints have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.ai_credit_reservations'::regclass),
  'private AI credit reservations have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'email_bounce_complaints'
      and policyname = 'Service role can manage private email bounce complaints'
  ),
  'private email bounce complaints have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'ai_credit_reservations'
      and policyname = 'Service role can manage private AI credit reservations'
  ),
  'private AI credit reservations have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'email_bounce_complaints_original_email_id_fkey'
      and conrelid = 'private.email_bounce_complaints'::regclass
      and confrelid = 'public.email_audit'::regclass
  ),
  'email bounce complaints still reference public email audit'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'ai_credit_reservations_balance_id_fkey'
      and conrelid = 'private.ai_credit_reservations'::regclass
      and confrelid = 'public.workspace_ai_credit_balances'::regclass
  ),
  'AI credit reservations still reference public balances'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public.check_email_bounce_status(text,integer)'::regprocedure,
      'public.get_bounce_complaint_stats(timestamptz)'::regprocedure,
      'public.record_email_bounce(text,text,text,uuid,jsonb)'::regprocedure,
      'public.record_email_complaint(text,text,text,uuid,jsonb)'::regprocedure
    )
      and pg_get_functiondef(oid) like '%public.email_bounce_complaints%'
  ),
  'email bounce RPCs no longer reference the public table'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid in (
      'public._release_expired_ai_credit_reservations(uuid)'::regprocedure,
      'public.reserve_fixed_ai_credits(uuid,uuid,numeric,text,text,jsonb,integer)'::regprocedure,
      'public.commit_fixed_ai_credit_reservation(uuid,jsonb)'::regprocedure,
      'public.release_fixed_ai_credit_reservation(uuid,jsonb)'::regprocedure
    )
      and pg_get_functiondef(oid) like '%public.ai_credit_reservations%'
  ),
  'AI reservation RPCs no longer reference the public table'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid in (
      'public.check_email_bounce_status(text,integer)'::regprocedure,
      'public.get_bounce_complaint_stats(timestamptz)'::regprocedure,
      'public.record_email_bounce(text,text,text,uuid,jsonb)'::regprocedure,
      'public.record_email_complaint(text,text,text,uuid,jsonb)'::regprocedure,
      'public._release_expired_ai_credit_reservations(uuid)'::regprocedure,
      'public.reserve_fixed_ai_credits(uuid,uuid,numeric,text,text,jsonb,integer)'::regprocedure,
      'public.commit_fixed_ai_credit_reservation(uuid,jsonb)'::regprocedure,
      'public.release_fixed_ai_credit_reservation(uuid,jsonb)'::regprocedure
    )
    having count(*) filter (
      where pg_get_functiondef(oid) like '%private.%'
    ) = 8
  ),
  'server RPCs reference private schema tables'
);

select * from finish();

rollback;
