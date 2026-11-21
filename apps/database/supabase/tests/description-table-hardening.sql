begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(34);

-- The approved public text and access contract is documented in
-- apps/docs/platform/architecture/public-text-limits.mdx. Each list below is
-- the exact current set of approved exceptions: a new gap fails as an extra
-- row and a closed gap fails as a missing row, so the lists only shrink.

create temporary table contract_text_columns as
select c.table_name::text as table_name, c.column_name::text as column_name
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
  and t.table_name = c.table_name
where c.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
  and c.table_name <> 'ai_gateway_models'
  and c.data_type in ('text', 'character varying', 'character');

create temporary table contract_json_columns as
select c.table_name::text as table_name, c.column_name::text as column_name
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
  and t.table_name = c.table_name
where c.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
  and c.data_type in ('json', 'jsonb');

create temporary table contract_trigger_tables as
select cls.relname::text as table_name,
  trg.tgfoid::regprocedure::text as function_name
from pg_trigger trg
join pg_class cls
  on cls.oid = trg.tgrelid
join pg_namespace ns
  on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and trg.tgname = 'enforce_strict_text_field_limits'
  and not trg.tgisinternal;

-- Text-heavy tables are served through server APIs unless they are listed in
-- contract_client_access_tables.
create temporary table contract_protected_tables as
select distinct table_name
from contract_text_columns
where table_name not in (
    'transaction_categories',
    'workspace_external_project_assets',
    'workspace_external_project_collections',
    'workspace_habit_trackers',
    'workspace_user_groups'
  )
  and (
    column_name in (
      'description', 'content', 'message', 'prompt', 'body', 'html', 'text',
      'input', 'output', 'data'
    )
    or column_name ~ '_(content|message|prompt|body|text|input|output)$'
  );

-- Tables created after the strict-text resync without the generic trigger.
-- Their writes are bounded by table-specific CHECKs and their feature APIs.
create temporary table contract_trigger_exempt_tables (table_name text primary key);
insert into contract_trigger_exempt_tables (table_name) values
  ('abuse_activity_signals'),
  ('abuse_reputation_subjects'),
  ('abuse_step_up_challenges'),
  ('abuse_trust_overrides'),
  ('course_module_quiz_submissions'),
  ('course_test_attempt_answers'),
  ('course_tests'),
  ('fee_lock_events'),
  ('fee_lock_lines'),
  ('fee_locks'),
  ('fee_notice_templates'),
  ('hive_members'),
  ('hive_npc_memories'),
  ('hive_npc_runs'),
  ('hive_npcs'),
  ('hive_research_session_events'),
  ('hive_research_sessions'),
  ('hive_servers'),
  ('hive_workflow_runs'),
  ('hive_workflows'),
  ('hive_world_events'),
  ('meet_ai_chunks'),
  ('meet_ai_memories'),
  ('meet_ai_sessions'),
  ('product_stock_changes'),
  ('qr_login_challenges'),
  ('rate_limit_appeals'),
  ('task_board_public_links'),
  ('task_board_shares'),
  ('task_capacity_rules'),
  ('task_leaderboard_members'),
  ('task_leaderboard_teams'),
  ('task_leaderboards'),
  ('task_plan_items'),
  ('task_plan_shares'),
  ('task_plans'),
  ('task_profile_progress_settings'),
  ('task_progress_achievements'),
  ('task_progress_entries'),
  ('task_progress_goals'),
  ('task_progress_metrics'),
  ('task_progress_user_achievements'),
  ('task_templates'),
  ('user_workspace_configs'),
  ('workspace_domains'),
  ('workspace_email_invite_roles'),
  ('workspace_external_project_bindings'),
  ('workspace_external_project_entry_placements'),
  ('workspace_external_project_entry_taxonomy_assignments'),
  ('workspace_external_project_field_definitions'),
  ('workspace_external_project_page_versions'),
  ('workspace_external_project_relation_definitions'),
  ('workspace_habit_tracker_entry_receipts'),
  ('workspace_meet_settings'),
  ('workspace_ownership_transfers'),
  ('workspace_user_profile_links');

-- Text columns on trigger-protected tables without the named strict CHECKs.
-- users.handle and handles.value keep the administrator rename exception in
-- private.enforce_employee_profile_text_limits(); ai_chat_messages.content
-- uses ai_chat_messages_content_length_check and _bytes_check. The trigger
-- enforces the strict limits for every other listed column.
create temporary table contract_text_check_exempt_columns (
  table_name text,
  column_name text,
  primary key (table_name, column_name)
);
insert into contract_text_check_exempt_columns (table_name, column_name) values
  ('ai_chat_messages', 'content'),
  ('calendar_auth_tokens', 'deactivated_reason'),
  ('calendar_connections', 'access_role'),
  ('handles', 'value'),
  ('meet_together_plans', 'timezone'),
  ('onboarding_progress', 'guidance_mode'),
  ('onboarding_progress', 'persona'),
  ('onboarding_progress', 'replay_app'),
  ('shortened_links', 'meet_link_kind'),
  ('task_projects', 'ticket_key'),
  ('transaction_categories', 'description'),
  ('user_private_details', 'first_day_of_week'),
  ('user_private_details', 'time_format'),
  ('user_private_details', 'timezone'),
  ('users', 'banner_url'),
  ('users', 'handle'),
  ('workspace_calendar_events', 'sync_error'),
  ('workspace_calendar_events', 'sync_status'),
  ('workspace_cron_executions', 'endpoint_url'),
  ('workspace_cron_executions', 'error'),
  ('workspace_cron_executions', 'source'),
  ('workspace_cron_jobs', 'endpoint_url'),
  ('workspace_cron_jobs', 'external_app_id'),
  ('workspace_cron_jobs', 'external_job_key'),
  ('workspace_cron_jobs', 'http_method'),
  ('workspace_cron_jobs', 'last_status'),
  ('workspace_cron_jobs', 'locked_by'),
  ('workspace_cron_jobs', 'schedule_timezone'),
  ('workspace_habit_trackers', 'creation_key'),
  ('workspace_quizzes', 'type');

-- JSON columns outside the trigger-exempt tables without the named payload
-- CHECK. ai_chat_messages.metadata is exempt from payload limits; the
-- trigger bounds the other trigger-table columns; fee_lock_revisions and
-- hive_world_states hold JSON only and carry no text trigger.
create temporary table contract_json_check_exempt_columns (
  table_name text,
  column_name text,
  primary key (table_name, column_name)
);
insert into contract_json_check_exempt_columns (table_name, column_name) values
  ('ai_chat_messages', 'metadata'),
  ('fee_lock_revisions', 'snapshot'),
  ('hive_world_states', 'world_data'),
  ('workspace_course_modules', 'vocabulary'),
  ('workspace_cron_jobs', 'headers_config'),
  ('workspace_quizzes', 'answer'),
  ('workspace_quizzes', 'content');

-- Text-heavy tables with intentional client access: their permissive
-- policies are scoped to the row owner, workspace membership, a workspace
-- permission or a Hive role, and the privileges are what authenticated holds.
-- notifications and workspace_calendar_events keep policies without grants.
create temporary table contract_client_access_tables (
  table_name text primary key,
  privileges text[] not null
);
insert into contract_client_access_tables (table_name, privileges) values
  ('course_tests', array['select']),
  ('hive_npc_memories', array['select']),
  ('hive_npcs', array['select']),
  ('hive_research_sessions', array['delete', 'insert', 'select', 'update']),
  ('hive_servers', array['delete', 'insert', 'select', 'update']),
  ('hive_workflows', array['delete', 'insert', 'select', 'update']),
  ('meet_ai_memories', array['select']),
  ('notifications', array[]::text[]),
  ('rate_limit_appeals', array['insert', 'select']),
  ('task_leaderboards', array['delete', 'insert', 'select', 'update']),
  ('task_progress_achievements', array['delete', 'insert', 'select', 'update']),
  ('task_progress_goals', array['delete', 'insert', 'select', 'update']),
  ('task_progress_metrics', array['delete', 'insert', 'select', 'update']),
  ('task_templates', array['delete', 'insert', 'select', 'update']),
  ('workspace_calendar_events', array[]::text[]),
  (
    'workspace_external_project_field_definitions',
    array['delete', 'insert', 'select', 'update']
  );

-- The exact permissive policies on text-heavy tables. A new or renamed
-- policy, or a changed command, fails until it is reviewed and listed here.
create temporary table contract_client_policies (
  table_name text,
  policy_name text,
  command text,
  primary key (table_name, policy_name)
);
insert into contract_client_policies (table_name, policy_name, command) values
  ('course_tests', 'course_tests_select_workspace_member', 'SELECT'),
  ('hive_npc_memories', 'Hive members can read NPC memories', 'SELECT'),
  ('hive_npcs', 'Hive members can read NPCs', 'SELECT'),
  ('hive_research_sessions', 'Hive admins manage research sessions', 'ALL'),
  ('hive_research_sessions', 'Hive members can read research sessions', 'SELECT'),
  ('hive_servers', 'Hive admins manage servers', 'ALL'),
  ('hive_servers', 'Hive members can read enabled servers', 'SELECT'),
  ('hive_workflows', 'Hive admins manage workflows', 'ALL'),
  ('hive_workflows', 'Hive members can read workflows', 'SELECT'),
  ('meet_ai_memories', 'meet_ai_memories_owner', 'SELECT'),
  ('notifications', 'notifications_delete_policy', 'DELETE'),
  ('notifications', 'notifications_select_policy', 'SELECT'),
  ('notifications', 'notifications_update_policy', 'UPDATE'),
  ('rate_limit_appeals', 'Users can create their own rate-limit appeals', 'INSERT'),
  ('rate_limit_appeals', 'Users can read their own rate-limit appeals', 'SELECT'),
  ('task_leaderboards', 'task_leaderboards_member_select', 'SELECT'),
  ('task_leaderboards', 'task_leaderboards_creator_delete', 'DELETE'),
  ('task_leaderboards', 'task_leaderboards_creator_insert', 'INSERT'),
  ('task_leaderboards', 'task_leaderboards_creator_update', 'UPDATE'),
  ('task_progress_achievements', 'task_progress_achievements_member_select', 'SELECT'),
  ('task_progress_goals', 'task_progress_goals_member_select', 'SELECT'),
  ('task_progress_goals', 'task_progress_goals_owner_delete', 'DELETE'),
  ('task_progress_goals', 'task_progress_goals_owner_insert', 'INSERT'),
  ('task_progress_goals', 'task_progress_goals_owner_update', 'UPDATE'),
  ('task_progress_metrics', 'task_progress_metrics_member_select', 'SELECT'),
  ('task_progress_metrics', 'task_progress_metrics_creator_delete', 'DELETE'),
  ('task_progress_metrics', 'task_progress_metrics_creator_insert', 'INSERT'),
  ('task_progress_metrics', 'task_progress_metrics_creator_update', 'UPDATE'),
  ('task_templates', 'task_templates_delete_owner', 'DELETE'),
  ('task_templates', 'task_templates_insert_member', 'INSERT'),
  ('task_templates', 'task_templates_select_accessible', 'SELECT'),
  ('task_templates', 'task_templates_update_owner', 'UPDATE'),
  ('workspace_calendar_events', 'Calendar managers can delete workspace events', 'DELETE'),
  ('workspace_calendar_events', 'Calendar managers can insert workspace events', 'INSERT'),
  ('workspace_calendar_events', 'Calendar managers can select workspace events', 'SELECT'),
  ('workspace_calendar_events', 'Calendar managers can update workspace events', 'UPDATE'),
  ('workspace_external_project_field_definitions', 'Workspace external project managers can mutate field definition', 'ALL'),
  ('workspace_external_project_field_definitions', 'Workspace external project publishers can read field definition', 'SELECT');

-- Constraints that match the legacy 10,000-character, 40,000-byte or 2 MiB
-- patterns and are the approved limit for their column: the strict limit for
-- calendar descriptions and crawled HTML, the database-owned AI chat content
-- limit, the task plan note and task template description limits, and the
-- external project page-version cap.
create temporary table contract_legacy_pattern_constraints (
  table_name text,
  constraint_name text,
  primary key (table_name, constraint_name)
);
insert into contract_legacy_pattern_constraints (table_name, constraint_name) values
  ('ai_chat_messages', 'ai_chat_messages_content_bytes_check'),
  ('ai_chat_messages', 'ai_chat_messages_content_length_check'),
  ('crawled_urls', 'html_strict_bytes_check'),
  ('crawled_urls', 'html_strict_length_check'),
  ('task_plan_items', 'task_plan_items_notes_check'),
  ('task_templates', 'description_strict_bytes_check'),
  ('task_templates', 'description_strict_length_check'),
  ('workspace_calendar_events', 'description_strict_bytes_check'),
  ('workspace_calendar_events', 'description_strict_length_check'),
  (
    'workspace_external_project_page_versions',
    'workspace_external_project_page_versions_data_check'
  );

select set_eq(
  $$
    select distinct tc.table_name
    from contract_text_columns tc
    where not exists (
      select 1 from contract_trigger_tables trg where trg.table_name = tc.table_name
    )
  $$,
  $$ select table_name from contract_trigger_exempt_tables $$,
  'public text tables lack the strict text trigger only where exempted'
);

select is_empty(
  $$
    select table_name, function_name
    from contract_trigger_tables
    where function_name <> 'enforce_strict_text_field_limits()'
      and not (
        table_name in ('users', 'handles')
        and function_name = 'private.enforce_employee_profile_text_limits()'
      )
  $$,
  'strict text triggers run the generic or employee profile enforcement'
);

select set_eq(
  $$
    select p.tablename::text, p.policyname::text, p.cmd
    from pg_policies p
    join contract_protected_tables pt
      on pt.table_name = p.tablename
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
  $$,
  $$ select table_name, policy_name, command from contract_client_policies $$,
  'protected text-heavy tables carry only the approved permissive policies'
);

select set_eq(
  $$ select distinct table_name from contract_client_policies $$,
  $$ select table_name from contract_client_access_tables $$,
  'every client-access table is listed with its approved policies'
);

select is_empty(
  $$
    select p.tablename, p.policyname, p.roles
    from pg_policies p
    join contract_protected_tables pt
      on pt.table_name = p.tablename
    where p.schemaname = 'public'
      and (
        not p.roles <@ array['authenticated']::name[]
        or (
          p.permissive = 'PERMISSIVE'
          and (p.qual = 'true' or p.with_check = 'true')
        )
      )
  $$,
  'protected text-heavy table policies target authenticated users and never admit every row'
);

select ok(
  not exists (
    select 1
    from pg_class cls
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    join contract_protected_tables pt
      on pt.table_name = cls.relname
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and not cls.relrowsecurity
  ),
  'protected text-heavy tables keep RLS enabled'
);

select is_empty(
  $$
    select pt.table_name, privilege_name
    from contract_protected_tables pt
    cross join unnest(array['select', 'insert', 'update', 'delete']) as privilege_name
    where has_table_privilege('anon', format('public.%I', pt.table_name), privilege_name)
      or (
        privilege_name <> 'delete'
        and has_any_column_privilege(
          'anon', format('public.%I', pt.table_name), privilege_name
        )
      )
  $$,
  'protected text-heavy tables grant no CRUD privileges to anon'
);

select set_eq(
  $$
    select pt.table_name, privilege_name
    from contract_protected_tables pt
    cross join unnest(array['select', 'insert', 'update', 'delete']) as privilege_name
    where has_table_privilege(
      'authenticated', format('public.%I', pt.table_name), privilege_name
    )
  $$,
  $$
    select table_name, unnest(privileges)
    from contract_client_access_tables
  $$,
  'protected text-heavy tables grant authenticated CRUD only where client access is approved'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'ai_gateway_models'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_char_limit(c.table_name, c.column_name) <= 0
  ),
  'every public text-like column resolves to a positive character limit'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'ai_gateway_models'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_byte_limit(c.table_name, c.column_name) <= 0
  ),
  'every public text-like column resolves to a positive octet limit'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'ai_gateway_models'
      and c.data_type in ('text', 'character varying', 'character')
      and strict_text_field_byte_limit(c.table_name, c.column_name)
        < strict_text_field_char_limit(c.table_name, c.column_name)
  ),
  'every public text-like column keeps the byte ceiling at or above the character ceiling'
);

select ok(
  not exists (
    select 1
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('json', 'jsonb')
      and strict_payload_field_byte_limit(c.table_name, c.column_name) <= 0
  ),
  'every public json/jsonb column resolves to a positive payload byte limit'
);

select set_eq(
  $$
    select tc.table_name, tc.column_name
    from contract_text_columns tc
    where tc.table_name not in (select table_name from contract_trigger_exempt_tables)
      and not exists (
        select 1
        from pg_constraint con
        where con.conrelid = format('public.%I', tc.table_name)::regclass
          and con.contype = 'c'
          and con.conname = format('%s_strict_length_check', tc.column_name)
      )
  $$,
  $$ select table_name, column_name from contract_text_check_exempt_columns $$,
  'public text columns lack a strict char-length check only where exempted'
);

select set_eq(
  $$
    select tc.table_name, tc.column_name
    from contract_text_columns tc
    where tc.table_name not in (select table_name from contract_trigger_exempt_tables)
      and not exists (
        select 1
        from pg_constraint con
        where con.conrelid = format('public.%I', tc.table_name)::regclass
          and con.contype = 'c'
          and con.conname = format('%s_strict_bytes_check', tc.column_name)
      )
  $$,
  $$ select table_name, column_name from contract_text_check_exempt_columns $$,
  'public text columns lack a strict byte-length check only where exempted'
);

select set_eq(
  $$
    select jc.table_name, jc.column_name
    from contract_json_columns jc
    where jc.table_name not in (select table_name from contract_trigger_exempt_tables)
      and not exists (
        select 1
        from pg_constraint con
        where con.conrelid = format('public.%I', jc.table_name)::regclass
          and con.contype = 'c'
          and con.conname = format('%s_strict_payload_size_check', jc.column_name)
      )
  $$,
  $$ select table_name, column_name from contract_json_check_exempt_columns $$,
  'public json/jsonb columns lack a strict payload-size check only where exempted'
);

select set_eq(
  $$
    select cls.relname::text, con.conname::text
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ~ 'char_length\([^)]*\) <= 10000\M'
        or pg_get_constraintdef(con.oid) ~ 'octet_length\([^)]*\) <= 40000\M'
        or pg_get_constraintdef(con.oid) like '%2097152%'
      )
  $$,
  $$ select table_name, constraint_name from contract_legacy_pattern_constraints $$,
  'legacy-sized public constraints exist only where they are the approved limit'
);

select is(
  strict_text_field_char_limit('workspaces', 'name'),
  63,
  'workspace names are capped below 64 characters'
);

select is(
  strict_text_field_char_limit('users', 'bio'),
  160,
  'user bios use the stricter short-form limit'
);

select is(
  strict_text_field_char_limit('tasks', 'name'),
  1024,
  'task titles allow up to 1,024 characters'
);

select is(
  strict_text_field_char_limit('tasks', 'description'),
  100000,
  'task descriptions preserve the 100,000 character allowance'
);

select is(
  strict_text_field_char_limit('workspace_calendar_events', 'description'),
  10000,
  'workspace calendar event descriptions allow provider-sized payloads'
);

select is(
  strict_text_field_char_limit('workspace_calendar_events', 'title'),
  255,
  'workspace calendar event titles allow provider-sized payloads'
);

select is(
  strict_text_field_char_limit('workspace_chat_messages', 'content'),
  512,
  'payload fields default to the lower 512-character ceiling'
);

select is(
  strict_text_field_char_limit('sent_emails', 'content'),
  1048576,
  'sent email HTML content keeps the large character ceiling'
);

select is(
  strict_text_field_byte_limit('sent_emails', 'content'),
  4194304,
  'sent email HTML content keeps the large byte ceiling'
);

select is(
  strict_text_field_char_limit('email_audit', 'html_content'),
  1048576,
  'email audit HTML content keeps the large character ceiling'
);

select is(
  strict_text_field_byte_limit('email_audit', 'html_content'),
  4194304,
  'email audit HTML content keeps the large byte ceiling'
);

select is(
  strict_text_field_char_limit('finance_budgets', 'period'),
  1000,
  'period fields allow provider-sized labels'
);

select ok(
  not exists (
    select 1
    from pg_constraint con
    join pg_class cls
      on cls.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'ai_gateway_models'
      and con.contype = 'c'
      and (
        con.conname like '%\_strict\_length\_check' escape '\'
        or con.conname like '%\_strict\_bytes\_check' escape '\'
        or pg_get_constraintdef(con.oid) like '%char_length(%'
      )
  ),
  'ai gateway model text columns are not text-length constrained'
);

select is(
  strict_payload_field_byte_limit('workspace_whiteboards', 'snapshot'),
  26214400,
  'whiteboard snapshots allow up to 25 MB for large canvas content'
);

create temporary table pgtap_text_limit_probe (
  title text,
  description text,
  content text,
  path text,
  data jsonb
);

create trigger enforce_strict_text_field_limits
before insert or update on pgtap_text_limit_probe
for each row
execute function public.enforce_strict_text_field_limits();

select throws_ok(
  $$insert into pgtap_text_limit_probe (description) values (repeat('a', 513))$$,
  '22001',
  'TEXT_FIELD_LENGTH_EXCEEDED: pgtap_text_limit_probe.description exceeds 512 characters',
  'generic descriptions reject payloads longer than 512 chars'
);

select throws_ok(
  $$insert into pgtap_text_limit_probe (path) values (repeat('🚀', 600))$$,
  '22001',
  'TEXT_FIELD_BYTES_EXCEEDED: pgtap_text_limit_probe.path exceeds 2048 bytes',
  'octet-based payload limits reject multibyte overflows'
);

select throws_ok(
  $$insert into pgtap_text_limit_probe (data)
    values (jsonb_build_object('blob', repeat('a', 20000)))$$,
  '22001',
  'PAYLOAD_FIELD_BYTES_EXCEEDED: pgtap_text_limit_probe.data exceeds 16384 bytes',
  'json payload fields reject oversized blobs'
);

select lives_ok(
  $$insert into pgtap_text_limit_probe (title, description, content, data)
    values (
      repeat('a', 128),
      repeat('a', 512),
      repeat('a', 512),
      jsonb_build_object('blob', repeat('a', 1000))
    )$$,
  'boundary-length text and payload values still insert'
);

select * from finish();

rollback;
