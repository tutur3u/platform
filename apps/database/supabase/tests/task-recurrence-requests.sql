BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;
SELECT no_plan();
SELECT (statement_timestamp() + interval '1 day') AS expiry \gset

SELECT is(private.task_recurrence_local_start(DATE '2011-12-30','Pacific/Apia'),
  TIMESTAMPTZ '2011-12-30 10:00:00+00','an absent civil day maps to the first instant after the gap');
SELECT is(private.task_recurrence_wall_instant(TIMESTAMP '2026-11-01 01:30:00','America/New_York'),
  TIMESTAMPTZ '2026-11-01 05:30:00+00','the earlier instant wins a fall fold');
SELECT is(private.task_recurrence_wall_instant(TIMESTAMP '2026-03-08 02:30:00','America/New_York'),
  TIMESTAMPTZ '2026-03-08 07:30:00+00','a spring gap shifts the due wall time forward');


INSERT INTO auth.users (id,email) VALUES
  ('00000000-0000-4000-8000-0000000c1101','request-owner@example.test'),
  ('00000000-0000-4000-8000-0000000c1102','request-guest@example.test'),
  ('00000000-0000-4000-8000-0000000c1103','request-assignee@example.test');
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
INSERT INTO public.workspaces (id,name,creator_id,personal)
VALUES ('00000000-0000-4000-8000-0000000c1110','Recurrence requests','00000000-0000-4000-8000-0000000c1101',false);
INSERT INTO public.workspace_members (ws_id,user_id,type) VALUES
  ('00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1102','GUEST'),
  ('00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1103','MEMBER');
INSERT INTO public.workspace_boards (id,ws_id,name,creator_id)
VALUES ('00000000-0000-4000-8000-0000000c1120','00000000-0000-4000-8000-0000000c1110',
  'Recurrence requests','00000000-0000-4000-8000-0000000c1101');
INSERT INTO public.task_lists (id,board_id,name,status,creator_id) VALUES
  ('00000000-0000-4000-8000-0000000c1130','00000000-0000-4000-8000-0000000c1120','Recurring active','active',
    '00000000-0000-4000-8000-0000000c1101'),
  ('00000000-0000-4000-8000-0000000c1131','00000000-0000-4000-8000-0000000c1120','Recurring done','done',
    '00000000-0000-4000-8000-0000000c1101');
SELECT throws_ok($$SELECT private.task_recurrence_prepare_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130')$$,'PT404','TASK_RECURRENCE_UNAVAILABLE',
  'the request API is dormant by default');
RESET ROLE;
GRANT task_recurrence_operator TO postgres WITH SET TRUE;
SET LOCAL ROLE task_recurrence_operator;
SELECT private.task_recurrence_set_control(true,false,1);
SELECT private.task_recurrence_set_workspace('00000000-0000-4000-8000-0000000c1110',true,0);
RESET ROLE;

SELECT jsonb_build_object(
  'rule','{"version":1,"frequency":"daily","interval":1,"timeZone":"UTC","end":{"type":"count","count":2}}'::jsonb,
  'anchor_date','2026-11-25','start_offset_days',0,'due_time',NULL,
  'template','{"title":"Daily test","description":null,"priority":null,"estimate":null,"labels":[],"projects":[],"assignees":["00000000-0000-4000-8000-0000000c1103"]}'::jsonb
)::text AS spec,
'{"version":1,"date":"2026-11-25","next_date":"2026-11-26","anchor_at":"2026-11-25T00:00:00Z","next_at":"2026-11-26T00:00:00Z","start_at":"2026-11-25T23:59:59.999Z","end_at":"2026-11-25T23:59:59.999Z","skip":false}' AS plan
\gset

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT private.task_recurrence_prepare_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1102',
  '00000000-0000-4000-8000-0000000c1130')$$,'PT404','TASK_RECURRENCE_UNAVAILABLE','guest cannot prepare create');
SET LOCAL request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-4000-8000-0000000c1102"}';
SELECT throws_ok($$SELECT private.task_recurrence_prepare_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130')$$,'PT403','TASK_RECURRENCE_ACTOR','signed-in subject cannot forge actor');
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SELECT throws_ok(format($sql$SELECT private.task_recurrence_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130','00000000-0000-4000-8000-0000000c1150', now()-interval '1 second',
  2,1,%L::jsonb,%L::jsonb)$sql$, :'spec', :'plan'),
  'PT409','TASK_RECURRENCE_RECEIPT_EXPIRED','database rejects expired signed requests');
SELECT private.task_recurrence_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130','00000000-0000-4000-8000-0000000c1150', :'expiry'::timestamptz,
  2,1,:'spec'::jsonb,:'plan'::jsonb)::text AS created \gset
SELECT is(private.task_recurrence_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130','00000000-0000-4000-8000-0000000c1150', :'expiry'::timestamptz,
  2,1,:'spec'::jsonb,'{}'::jsonb), :'created'::jsonb, 'identical input replays independently of the derived plan');
SELECT throws_ok(format($sql$SELECT private.task_recurrence_create(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1130','00000000-0000-4000-8000-0000000c1150', %L::timestamptz,
  2,1,jsonb_set(%L::jsonb,'{template,title}','"Different"'::jsonb),'{}'::jsonb)$sql$, :'expiry', :'spec'),
  'PT409','TASK_RECURRENCE_REQUEST_CONFLICT','changed business input conflicts');
SELECT (:'created'::jsonb->>'task_id') AS task_id, (:'created'::jsonb->>'series_id') AS series_id \gset
RESET ROLE;

SELECT is((SELECT expires_at FROM private.task_recurrence_receipts), :'expiry'::timestamptz,
  'the database persists the verified expiry');
SELECT is((SELECT count(*) FROM private.task_recurrence_occurrences),1::bigint,'replay does not generate another task');
SELECT is((SELECT creator_id FROM public.tasks WHERE id = :'task_id'::uuid),
  '00000000-0000-4000-8000-0000000c1101'::uuid,'the series owner owns the generated task');
SELECT is((SELECT array_agg(user_id ORDER BY user_id) FROM public.task_watchers WHERE task_id = :'task_id'::uuid),
  ARRAY['00000000-0000-4000-8000-0000000c1103'::uuid],
  'generated tasks retain only the ordinary copied-assignee watch');
SELECT is((SELECT count(*) FROM public.task_assignees WHERE task_id = :'task_id'::uuid),1::bigint,
  'the eligible assignee is copied once');

SET LOCAL ROLE service_role;
SELECT is(jsonb_array_length(private.task_recurrence_read(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  ARRAY[:'task_id'::uuid],false)),1,'members can read recurrence summary');
SELECT throws_ok(format($sql$SELECT private.task_recurrence_begin_completion(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1102',
  %L::uuid,'00000000-0000-4000-8000-0000000c1131',1000000,'00000000-0000-4000-8000-0000000c1151',%L::timestamptz)$sql$,
  :'task_id', :'expiry'), 'PT404','TASK_RECURRENCE_UNAVAILABLE', 'guest request cannot capture or generate');
SELECT is(private.task_recurrence_begin_completion(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  :'task_id'::uuid,'00000000-0000-4000-8000-0000000c1131',1000000,'00000000-0000-4000-8000-0000000c1151',
  :'expiry'::timestamptz), '{"status":"completed","pending":true}'::jsonb, 'capture reserves a receipt and hides the proof');
UPDATE public.tasks SET list_id = '00000000-0000-4000-8000-0000000c1130'
WHERE id = :'task_id'::uuid;
SELECT private.task_recurrence_begin_completion(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  :'task_id'::uuid,'00000000-0000-4000-8000-0000000c1131',1000000,'00000000-0000-4000-8000-0000000c1152',
  :'expiry'::timestamptz
);
SELECT is(private.task_recurrence_prepare_completion(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',:'task_id'::uuid,
  '00000000-0000-4000-8000-0000000c1151'
), NULL::jsonb, 'an old receipt cannot borrow a proof after reopen and recompletion');
SELECT (private.task_recurrence_prepare_completion(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',:'task_id'::uuid,
  '00000000-0000-4000-8000-0000000c1152'
)->>'transition_id') AS proof \gset
SELECT jsonb_build_array(jsonb_build_object(
  'task_id',:'task_id','list_id','00000000-0000-4000-8000-0000000c1131','sort_key',1000000,
  'transition_id',:'proof','plan','{"version":1,"date":"2026-11-26","start_at":"2026-11-26T23:59:59.999Z","end_at":"2026-11-26T23:59:59.999Z","skip":false}'::jsonb
))::text AS items \gset
SELECT private.task_recurrence_complete(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1152',:'expiry'::timestamptz,:'items'::jsonb
)::text AS completed \gset
SELECT is(jsonb_array_length(:'completed'::jsonb->'task_ids'),1,'completion creates one early task');
SELECT is(private.task_recurrence_complete(
  '00000000-0000-4000-8000-0000000c1110','00000000-0000-4000-8000-0000000c1101',
  '00000000-0000-4000-8000-0000000c1152',:'expiry'::timestamptz,:'items'::jsonb
),:'completed'::jsonb,'completion replay is idempotent after the proof is consumed');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.task_recurrence_occurrences),2::bigint,'the series has only two COUNT occurrences');
SELECT is((SELECT state FROM private.task_recurrence_series),'ended','COUNT releases active series state');
SELECT is((SELECT count(*) FROM private.task_recurrence_active_slots),0::bigint,'terminal series releases its active slot');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT * FROM finish();
ROLLBACK;
