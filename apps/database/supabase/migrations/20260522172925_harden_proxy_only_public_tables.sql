-- Harden the remaining public-schema surfaces that are intentionally routed
-- through apps/web APIs instead of direct Supabase Data API clients.
--
-- This is a transition guardrail for the private-schema migration: proxy-only
-- tables can continue to be ported table-by-table, but anon/authenticated
-- clients cannot use public table grants while that work is in progress.

do $$
declare
  proxy_only_tables text[] := array[
    'ai_gateway_models',
    'external_user_monthly_report_logs',
    'external_user_monthly_reports',
    'form_questions',
    'form_response_answers',
    'form_sections',
    'forms',
    'user_group_metric_categories',
    'mira_accessories',
    'mira_achievements',
    'notification_batches',
    'notification_delivery_log',
    'nova_challenge_criteria',
    'nova_challenges',
    'nova_problem_test_cases',
    'nova_problems',
    'nova_submission_test_cases',
    'nova_teams',
    'recording_transcripts',
    'topic_announcement_batches',
    'topic_announcement_contact_verifications',
    'topic_announcement_contacts',
    'topic_announcement_recipients',
    'topic_announcements',
    'time_tracking_request_activity',
    'time_tracking_request_comments',
    'time_tracking_requests',
    'user_group_post_checks',
    'user_group_post_logs',
    'user_group_posts',
    'user_linked_promotions',
    'workspace_calendars',
    'workspace_credit_packs',
    'workspace_debt_loans',
    'workspace_education_access_requests',
    'workspace_promotions',
    'workspace_scheduling_metadata',
    'workspace_subscription_products',
    'workspace_tutoring_sessions',
    'workspace_wallets'
  ];
  relation record;
begin
  for relation in
    select ns.nspname, cls.relname, cls.relkind
    from pg_class cls
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = any(proxy_only_tables)
      and cls.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format(
      'revoke all privileges on table %I.%I from public, anon, authenticated',
      relation.nspname,
      relation.relname
    );

    execute format(
      'grant all privileges on table %I.%I to service_role',
      relation.nspname,
      relation.relname
    );

    if relation.relkind in ('r', 'p') then
      execute format(
        'alter table %I.%I enable row level security',
        relation.nspname,
        relation.relname
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  owner_role name;
begin
  for owner_role in
    select distinct rolname
    from pg_roles
    where (
        rolname = current_user
        or rolname in (
          'postgres',
          'supabase_admin',
          'supabase_auth_admin',
          'supabase_etl_admin',
          'supabase_functions_admin',
          'supabase_realtime_admin',
          'supabase_storage_admin'
        )
      )
      and pg_has_role(rolname, 'member')
  loop
    execute format(
      'alter default privileges for role %I in schema public
        revoke all privileges on tables
        from public, anon, authenticated, service_role',
      owner_role
    );

    execute format(
      'alter default privileges for role %I in schema public
        revoke all privileges on sequences
        from public, anon, authenticated, service_role',
      owner_role
    );

    execute format(
      'alter default privileges for role %I in schema public
        revoke all privileges on functions
        from public, anon, authenticated, service_role',
      owner_role
    );
  end loop;
end;
$$;
