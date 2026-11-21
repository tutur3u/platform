SELECT gen_random_uuid() AS scheduler_fixture_owner \gset
INSERT INTO auth.users(id,email) VALUES
  (:'scheduler_fixture_owner', 'scheduler-owner-' || :'scheduler_fixture_owner' || '@example.test');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE scheduler_workspaces AS
SELECT ordinal, gen_random_uuid() AS ws, gen_random_uuid() AS board, gen_random_uuid() AS list
FROM generate_series(1,6) AS ordinal;
INSERT INTO public.workspaces(id,name,creator_id,personal)
SELECT ws,format('Scheduler fixture %s',ordinal),:'scheduler_fixture_owner',false FROM scheduler_workspaces;
INSERT INTO public.workspace_boards(id,ws_id,name,creator_id)
SELECT board,ws,'Recurring fixture board',:'scheduler_fixture_owner' FROM scheduler_workspaces;
INSERT INTO public.task_lists(id,board_id,name,status,creator_id)
SELECT list,board,'Recurring source','active',:'scheduler_fixture_owner' FROM scheduler_workspaces;
RESET ROLE;
GRANT SELECT ON scheduler_workspaces TO postgres;

UPDATE private.task_recurrence_control SET request_enabled = true, scheduler_enabled = true;
INSERT INTO private.task_recurrence_workspace(ws_id,enabled)
SELECT ws,ordinal < 6 FROM scheduler_workspaces;

CREATE TEMP TABLE scheduler_series_fixture AS
SELECT ws, board, list, ordinal, seq, gen_random_uuid() AS series_id
FROM scheduler_workspaces CROSS JOIN generate_series(1,33) AS seq;
INSERT INTO private.task_recurrence_series (id,ws_id,board_id,list_id,owner_id,rule,template,anchor_date,state,
  cursor_date,generate_at,consecutive_failures)
SELECT series_id,ws,board,list,:'scheduler_fixture_owner',
  '{"version":1,"frequency":"daily","interval":1,"timeZone":"UTC","end":{"type":"count","count":1}}'::jsonb,
  jsonb_build_object('title', CASE WHEN ordinal=1 AND seq=1 THEN 'scheduler fault fixture'
    ELSE format('Scheduled task %s %s',ordinal,seq) END,
    'labels','[]'::jsonb,'projects','[]'::jsonb,'assignees','[]'::jsonb),
  (to_timestamp(:'slot'::bigint) AT TIME ZONE 'UTC')::date,'active',
  (to_timestamp(:'slot'::bigint) AT TIME ZONE 'UTC')::date,
  CASE WHEN ordinal=1 AND seq=1 THEN to_timestamp(:'slot'::bigint) - interval '1 second'
    ELSE to_timestamp(:'slot'::bigint) END,
  CASE WHEN ordinal=1 AND seq=1 THEN 4 ELSE 0 END
FROM scheduler_series_fixture;
INSERT INTO private.task_recurrence_active_slots(series_id,ws_id,owner_id,ws_slot,owner_slot)
SELECT series_id,ws,:'scheduler_fixture_owner',seq,seq FROM scheduler_series_fixture;
