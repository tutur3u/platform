-- Contract for 20261024023000_harden_definer_function_grants.sql: legacy
-- definer helpers are not callable by client roles, policy helpers are not
-- callable by anon, Mira XP writes are bound to the actor, task list access
-- requires workspace membership, list-less tasks belong to their creator
-- (20261024024000), and search_path pins hold.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(90);

create temp table definer_service_only(fn regprocedure) on commit drop;
insert into definer_service_only values
  ('public.admin_get_ai_credit_entity_detail(uuid,uuid)'),
  ('public.get_platform_ai_credit_overview()'),
  ('public.get_invoice_creators(uuid)'),
  ('public.get_transaction_creators(uuid)'),
  ('public.archive_old_notifications(integer)'),
  ('public.atomic_sync_token_operation(uuid,text,text,text)'),
  ('public.record_mira_interaction(uuid)'),
  ('public.get_or_create_mira_pet(uuid)'),
  ('public.set_default_break_type(uuid,uuid)'),
  ('public.upsert_realtime_log_aggregations(jsonb)'),
  ('public.get_task_details(uuid)'),
  ('public.get_task_children(uuid)'),
  ('public.get_task_parents(uuid)'),
  ('public.get_blocking_tasks(uuid)'),
  ('public.get_blocked_tasks(uuid)'),
  ('public.get_related_tasks(uuid)'),
  ('public.get_ai_execution_summary_v2(uuid,timestamptz,timestamptz,jsonb,numeric)'),
  ('public.get_ai_execution_daily_stats_v2(uuid,timestamptz,timestamptz,jsonb)'),
  ('public.get_ai_execution_model_stats_v2(uuid,timestamptz,timestamptz,jsonb)'),
  ('public.get_ai_execution_monthly_cost_v2(uuid,integer,integer,jsonb,numeric)'),
  ('public.get_ai_execution_summary(uuid,timestamptz,timestamptz,jsonb,numeric)'),
  ('public.get_ai_execution_monthly_cost(uuid,integer,integer,jsonb,numeric)'),
  ('public.get_email_audit_stats(uuid,timestamptz)'),
  ('public.get_email_audit_stats_global(timestamptz)'),
  ('public.get_email_stats(uuid,timestamptz,timestamptz)'),
  ('public.create_system_announcement(text,text,public.notification_priority,text,timestamptz,jsonb)'),
  ('public.create_user_notification(uuid,text,text,text,public.notification_priority,text,jsonb)'),
  ('public.cleanup_expired_notifications()'),
  ('public.cleanup_expired_live_sessions()'),
  ('public.cleanup_old_api_key_usage_logs()'),
  ('public.cleanup_old_typing_indicators()'),
  ('public.should_send_notification(uuid,text,text,public.notification_scope,uuid)'),
  ('public.get_workspace_user_id(uuid,uuid)'),
  ('public.get_task_workspace_id(uuid)'),
  ('public.get_task_share_permission_from_link(text)'),
  ('public.get_active_ip_block(text)'),
  ('public.get_ip_block_level(text)'),
  ('public.get_user_whitelist_status(uuid)'),
  ('public.is_user_whitelisted(uuid)'),
  ('public.is_user_suspended(uuid)'),
  ('public.is_list_accessible(uuid)'),
  ('public.is_user_task_in_board(uuid,uuid)'),
  ('public.is_project_member(uuid)'),
  ('public.get_challenge_stats(uuid,uuid)');
create temp table definer_authenticated(fn regprocedure) on commit drop;
insert into definer_authenticated values
  ('public.is_task_sharing_enabled(uuid)'),
  ('public.user_is_in_channel(uuid,uuid)'),
  ('public.is_member_invited(uuid,uuid)'),
  ('public.is_task_board_member(uuid,uuid)'),
  ('public.award_mira_xp(uuid,integer,text)'),
  ('public.complete_mira_focus_session(uuid,text)');

-- Grants across the whole set (1-5).
select is((select count(*)::int from (select fn from definer_service_only union all select fn from definer_authenticated) f
  join pg_proc p on p.oid = f.fn
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where a.grantee = 0 and a.privilege_type = 'EXECUTE'), 0, 'no hardened function is executable by PUBLIC');
select is((select count(*)::int from (select fn from definer_service_only union all select fn from definer_authenticated) f
  where has_function_privilege('anon', f.fn, 'EXECUTE')), 0, 'anon executes none of the hardened functions');
select is((select count(*)::int from definer_service_only where has_function_privilege('authenticated', fn, 'EXECUTE')), 0, 'authenticated executes none of the internal helpers');
select is((select count(*)::int from definer_authenticated where has_function_privilege('authenticated', fn, 'EXECUTE')), 6, 'authenticated keeps policy helpers and actor-checked Mira functions');
select is((select count(*)::int from (select fn from definer_service_only union all select fn from definer_authenticated) f
  where has_function_privilege('service_role', f.fn, 'EXECUTE')), 50, 'service_role executes every hardened function');

-- Representative per-function grants (6-23).
select ok(not has_function_privilege('anon', 'public.admin_get_ai_credit_entity_detail(uuid,uuid)', 'EXECUTE'), 'anon: credit entity detail');
select ok(not has_function_privilege('authenticated', 'public.admin_get_ai_credit_entity_detail(uuid,uuid)', 'EXECUTE'), 'authenticated: credit entity detail');
select ok(not has_function_privilege('authenticated', 'public.get_platform_ai_credit_overview()', 'EXECUTE'), 'authenticated: platform credit overview');
select ok(not has_function_privilege('authenticated', 'public.get_invoice_creators(uuid)', 'EXECUTE'), 'authenticated: invoice creators');
select ok(not has_function_privilege('authenticated', 'public.get_transaction_creators(uuid)', 'EXECUTE'), 'authenticated: transaction creators');
select ok(not has_function_privilege('authenticated', 'public.archive_old_notifications(integer)', 'EXECUTE'), 'authenticated: notification archive');
select ok(not has_function_privilege('authenticated', 'public.atomic_sync_token_operation(uuid,text,text,text)', 'EXECUTE'), 'authenticated: calendar sync token');
select ok(not has_function_privilege('authenticated', 'public.upsert_realtime_log_aggregations(jsonb)', 'EXECUTE'), 'authenticated: realtime log aggregation');
select ok(not has_function_privilege('authenticated', 'public.get_task_details(uuid)', 'EXECUTE'), 'authenticated: task details');
select ok(not has_function_privilege('authenticated', 'public.get_challenge_stats(uuid,uuid)', 'EXECUTE'), 'authenticated: challenge stats');
select ok(has_function_privilege('service_role', 'public.get_platform_ai_credit_overview()', 'EXECUTE'), 'service_role: platform credit overview');
select ok(has_function_privilege('service_role', 'public.atomic_sync_token_operation(uuid,text,text,text)', 'EXECUTE'), 'service_role: calendar sync token');
select ok(not has_function_privilege('anon', 'public.is_task_board_member(uuid,uuid)', 'EXECUTE'), 'anon: task board membership helper');
select ok(has_function_privilege('authenticated', 'public.is_task_board_member(uuid,uuid)', 'EXECUTE'), 'authenticated: task board membership helper');
select ok(not has_function_privilege('anon', 'public.user_is_in_channel(uuid,uuid)', 'EXECUTE'), 'anon: chat channel helper');
select ok(has_function_privilege('authenticated', 'public.user_is_in_channel(uuid,uuid)', 'EXECUTE'), 'authenticated: chat channel helper');
select ok(not has_function_privilege('anon', 'public.award_mira_xp(uuid,integer,text)', 'EXECUTE'), 'anon: award XP');
select ok(has_function_privilege('authenticated', 'public.award_mira_xp(uuid,integer,text)', 'EXECUTE'), 'authenticated: award XP');

-- Policy and search_path pins (24-33).
select is((select roles::text from pg_policies where schemaname = 'public' and tablename = 'workspace_chat_messages'
  and policyname = 'Participants can view messages in their channels'), '{authenticated}', 'chat message read policy applies to authenticated only');
select is((select proconfig::text from pg_proc where oid = 'public.award_mira_xp(uuid,integer,text)'::regprocedure), '{"search_path=pg_catalog, pg_temp"}', 'award XP pinned catalog and temp');
select is((select proconfig::text from pg_proc where oid = 'public.complete_mira_focus_session(uuid,text)'::regprocedure), '{"search_path=pg_catalog, pg_temp"}', 'focus completion pinned catalog and temp');
select is((select proconfig::text from pg_proc where oid = 'public.is_task_board_member(uuid,uuid)'::regprocedure), '{"search_path=pg_catalog, pg_temp"}', 'board membership pinned catalog and temp');
select is((select proconfig::text from pg_proc where oid = 'public.get_task_details(uuid)'::regprocedure), '{"search_path=pg_catalog, pg_temp"}', 'task details pinned at catalog and temp at function level');
select ok((select position('set local' in lower(prosrc)) = 0 from pg_proc where oid = 'public.get_task_details(uuid)'::regprocedure), 'task details no longer changes the caller transaction search_path');
select is((select proconfig::text from pg_proc where oid = 'public.get_platform_ai_credit_overview()'::regprocedure), '{"search_path=pg_catalog, pg_temp"}', 'credit overview pinned catalog and temp');
select is((select proconfig::text from pg_proc where oid = 'public.set_default_break_type(uuid,uuid)'::regprocedure), '{"search_path=public, pg_temp"}', 'break type helper uses a trusted path with pg_temp last');
select is((select proconfig::text from pg_proc where oid = 'public.get_challenge_stats(uuid,uuid)'::regprocedure), '{"search_path=private, public, pg_temp"}', 'challenge stats resolves private Nova tables');
select is((select proconfig::text from pg_proc where oid = 'public.get_transaction_creators(uuid)'::regprocedure), '{"search_path=private, public, pg_temp"}', 'existing transaction creator pin preserved');

-- Disposable actors: member A, non-member B.
insert into public.users(id) values ('00000000-0000-4000-8000-00000000a201'), ('00000000-0000-4000-8000-00000000a202');
insert into public.workspaces(id, name, personal, creator_id)
values ('00000000-0000-4000-8000-00000000a211', 'Definer grant contract', false, '00000000-0000-4000-8000-00000000a201');
insert into public.workspace_members(ws_id, user_id)
values ('00000000-0000-4000-8000-00000000a211', '00000000-0000-4000-8000-00000000a201') on conflict do nothing;
delete from public.workspace_members
where ws_id = '00000000-0000-4000-8000-00000000a211' and user_id = '00000000-0000-4000-8000-00000000a202';
insert into public.workspace_boards(id, ws_id, name)
values ('00000000-0000-4000-8000-00000000a221', '00000000-0000-4000-8000-00000000a211', 'Contract board');
insert into public.task_lists(id, board_id, name)
values ('00000000-0000-4000-8000-00000000a231', '00000000-0000-4000-8000-00000000a221', 'Contract list');
insert into public.mira_focus_sessions(id, user_id, started_at, planned_duration) values
  ('00000000-0000-4000-8000-00000000a241', '00000000-0000-4000-8000-00000000a201', now() - interval '10 minutes', 5),
  ('00000000-0000-4000-8000-00000000a242', '00000000-0000-4000-8000-00000000a202', now() - interval '10 minutes', 5);

-- Task list membership (34-41).
select ok(public.is_task_board_member('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-00000000a221'), 'helper admits a workspace member');
select ok(not public.is_task_board_member('00000000-0000-4000-8000-00000000a202', '00000000-0000-4000-8000-00000000a221'), 'helper rejects a non-member');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a202"}', true);
select is((select count(*)::int from public.task_lists where id = '00000000-0000-4000-8000-00000000a231'), 0, 'non-member cannot read the task list');
select throws_ok($$insert into public.task_lists(id, board_id, name) values ('00000000-0000-4000-8000-00000000a232', '00000000-0000-4000-8000-00000000a221', 'Intruder')$$,
  '42501', null, 'non-member cannot create a list on the board');
select ok(not public.is_task_board_member((select auth.uid()), '00000000-0000-4000-8000-00000000a221'), 'policy helper denies the signed-in non-member');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a201"}', true);
select is((select count(*)::int from public.task_lists where id = '00000000-0000-4000-8000-00000000a231'), 1, 'member reads the task list');
select lives_ok($$insert into public.task_lists(id, board_id, name) values ('00000000-0000-4000-8000-00000000a233', '00000000-0000-4000-8000-00000000a221', 'Member list')$$,
  'member creates a list on the board');
select is((select count(*)::int from public.task_lists where id in ('00000000-0000-4000-8000-00000000a231', '00000000-0000-4000-8000-00000000a233')), 2, 'member sees both board lists');

-- List-less tasks belong to their creator (42-51).
reset role;
insert into public.tasks(id, name, creator_id)
values ('00000000-0000-4000-8000-00000000a251', 'Contract task', '00000000-0000-4000-8000-00000000a201');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a202"}', true);
select is((select count(*)::int from public.tasks where id = '00000000-0000-4000-8000-00000000a251'), 0, 'non-creator cannot read a list-less task');
select throws_ok($$insert into public.tasks(id, name, creator_id) values ('00000000-0000-4000-8000-00000000a252', 'Forged', '00000000-0000-4000-8000-00000000a201')$$,
  '42501', null, 'non-creator cannot insert a list-less task as another user');
select lives_ok($$insert into public.tasks(id, name, creator_id) values ('00000000-0000-4000-8000-00000000a253', 'Own task', '00000000-0000-4000-8000-00000000a202')$$,
  'user can insert a list-less task as self');
select lives_ok($$update public.tasks set name = 'Hijacked' where id = '00000000-0000-4000-8000-00000000a251'$$, 'non-creator update runs');
select lives_ok($$delete from public.tasks where id = '00000000-0000-4000-8000-00000000a251'$$, 'non-creator delete runs');
reset role;
select is((select name from public.tasks where id = '00000000-0000-4000-8000-00000000a251'), 'Contract task', 'non-creator update changed nothing');
select is((select count(*)::int from public.tasks where id = '00000000-0000-4000-8000-00000000a251'), 1, 'non-creator delete removed nothing');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a201"}', true);
select is((select count(*)::int from public.tasks where id = '00000000-0000-4000-8000-00000000a251'), 1, 'creator reads own list-less task');
select lives_ok($$update public.tasks set name = 'Creator edit' where id = '00000000-0000-4000-8000-00000000a251'$$, 'creator updates own list-less task');
select is((select name from public.tasks where id = '00000000-0000-4000-8000-00000000a251'), 'Creator edit', 'creator update applied');

-- Mira actor checks (52-58). Authenticated as A.
select throws_ok($$select public.award_mira_xp('00000000-0000-4000-8000-00000000a202', 5, 'contract')$$,
  '42501', 'Not allowed to award XP to another user', 'user A cannot award XP to user B');
select is((public.award_mira_xp('00000000-0000-4000-8000-00000000a201', 5, 'contract')).user_id, '00000000-0000-4000-8000-00000000a201'::uuid, 'user A can award XP to self');
select throws_ok($$select public.complete_mira_focus_session('00000000-0000-4000-8000-00000000a242')$$,
  'P0001', 'Focus session not found', 'user A cannot complete user B''s focus session');
select is((public.complete_mira_focus_session('00000000-0000-4000-8000-00000000a241')).user_id, '00000000-0000-4000-8000-00000000a201'::uuid, 'user A completes own session and its XP chain runs');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((public.award_mira_xp('00000000-0000-4000-8000-00000000a202', 5, 'contract')).user_id, '00000000-0000-4000-8000-00000000a202'::uuid, 'service_role can award XP to any user');
select is((public.complete_mira_focus_session('00000000-0000-4000-8000-00000000a242')).user_id, '00000000-0000-4000-8000-00000000a202'::uuid, 'service_role can complete any session');
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok($$select public.award_mira_xp('00000000-0000-4000-8000-00000000a202', 1, 'contract')$$, 'no-JWT server context can award XP');

-- Pinned bodies still resolve their objects when called by the server (59-90).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select public.get_platform_ai_credit_overview()$$, 'call: platform credit overview');
select lives_ok($$select public.admin_get_ai_credit_entity_detail('00000000-0000-4000-8000-00000000a211', null)$$, 'call: workspace credit detail');
select lives_ok($$select public.admin_get_ai_credit_entity_detail(null, '00000000-0000-4000-8000-00000000a201')$$, 'call: user credit detail');
select lives_ok($$select * from public.get_invoice_creators('00000000-0000-4000-8000-00000000a211')$$, 'call: invoice creators');
select lives_ok($$select public.archive_old_notifications(90)$$, 'call: archive notifications');
select is((select success from public.atomic_sync_token_operation('00000000-0000-4000-8000-00000000a211', 'contract', 'get', null)), true, 'call: calendar sync token');
select lives_ok($$select public.record_mira_interaction('00000000-0000-4000-8000-00000000a201')$$, 'call: record Mira interaction');
select lives_ok($$select * from public.set_default_break_type('00000000-0000-4000-8000-00000000a211', '00000000-0000-4000-8000-00000000a2ff')$$, 'call: default break type');
select lives_ok($$select public.upsert_realtime_log_aggregations('[]'::jsonb)$$, 'call: realtime log aggregation');
select lives_ok($$select * from public.get_task_details('00000000-0000-4000-8000-00000000a2ff')$$, 'call: task details');
select lives_ok($$select * from public.get_task_children('00000000-0000-4000-8000-00000000a2ff')
  union all select * from public.get_task_parents('00000000-0000-4000-8000-00000000a2ff')$$, 'call: task hierarchy');
select lives_ok($$select * from public.get_blocking_tasks('00000000-0000-4000-8000-00000000a2ff')
  union all select * from public.get_blocked_tasks('00000000-0000-4000-8000-00000000a2ff')
  union all select * from public.get_related_tasks('00000000-0000-4000-8000-00000000a2ff')$$, 'call: task relationships');
select lives_ok($$select * from public.get_ai_execution_summary_v2('00000000-0000-4000-8000-00000000a211', null, null, null, 26000)$$, 'call: AI summary v2');
select lives_ok($$select * from public.get_ai_execution_daily_stats_v2('00000000-0000-4000-8000-00000000a211', now() - interval '1 day', now(), null)$$, 'call: AI daily stats v2');
select lives_ok($$select * from public.get_ai_execution_model_stats_v2('00000000-0000-4000-8000-00000000a211', null, null, null)$$, 'call: AI model stats v2');
select lives_ok($$select * from public.get_ai_execution_monthly_cost_v2('00000000-0000-4000-8000-00000000a211', 2026, 1, null, 26000)$$, 'call: AI monthly cost v2');
select lives_ok($$select * from public.get_ai_execution_summary('00000000-0000-4000-8000-00000000a211', null, null, null, 26000)$$, 'call: AI summary');
select lives_ok($$select * from public.get_ai_execution_monthly_cost('00000000-0000-4000-8000-00000000a211', 2026, 1, null, 26000)$$, 'call: AI monthly cost');
select lives_ok($$select * from public.get_email_audit_stats('00000000-0000-4000-8000-00000000a211', now() - interval '1 day')
  union all select * from public.get_email_audit_stats_global(now() - interval '1 day')$$, 'call: email audit stats');
select lives_ok($$select * from public.get_email_stats('00000000-0000-4000-8000-00000000a211', null, null)$$, 'call: email stats');
select lives_ok($$select public.cleanup_expired_notifications(), public.cleanup_expired_live_sessions(),
  public.cleanup_old_api_key_usage_logs(), public.cleanup_old_typing_indicators()$$, 'call: cleanup jobs');
select is(public.should_send_notification('00000000-0000-4000-8000-00000000a201', 'task_assigned', 'email', 'workspace', '00000000-0000-4000-8000-00000000a211'), true, 'call: notification preference default');
select lives_ok($$select public.get_workspace_user_id('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-00000000a211')$$, 'call: workspace user link');
select lives_ok($$select public.get_task_workspace_id('00000000-0000-4000-8000-00000000a2ff'), public.is_task_sharing_enabled('00000000-0000-4000-8000-00000000a2ff'),
  public.get_task_share_permission_from_link('contract-missing')$$, 'call: task sharing helpers');
select lives_ok($$select * from public.get_active_ip_block('203.0.113.7')$$, 'call: active IP block');
select lives_ok($$select public.get_ip_block_level('203.0.113.7')$$, 'call: IP block level');
select lives_ok($$select * from public.get_user_whitelist_status('00000000-0000-4000-8000-00000000a201')$$, 'call: whitelist status');
select lives_ok($$select public.is_user_whitelisted('00000000-0000-4000-8000-00000000a201'), public.is_user_suspended('00000000-0000-4000-8000-00000000a201')$$, 'call: account flags');
select lives_ok($$select public.user_is_in_channel('00000000-0000-4000-8000-00000000a2ff', '00000000-0000-4000-8000-00000000a201'),
  public.is_member_invited('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-00000000a211')$$, 'call: chat and invite helpers');
select lives_ok($$select public.is_list_accessible('00000000-0000-4000-8000-00000000a231'),
  public.is_user_task_in_board('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-00000000a2ff')$$, 'call: legacy task helpers');
select lives_ok($$select * from public.get_challenge_stats('00000000-0000-4000-8000-00000000a2ff', '00000000-0000-4000-8000-00000000a201')$$, 'call: challenge stats');
select lives_ok($$select public.get_or_create_mira_pet('00000000-0000-4000-8000-00000000a202')$$, 'call: Mira pet');
reset role;

select * from finish();
rollback;
