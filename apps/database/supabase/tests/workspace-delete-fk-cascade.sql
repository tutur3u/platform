begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.wdf_id(n integer) returns uuid language sql as $$
  select ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id) values (pg_temp.wdf_id(1));
insert into public.users(id) values (pg_temp.wdf_id(1)) on conflict do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.wdf_id(10), 'Populated deletion fixture', pg_temp.wdf_id(1), false),
  (pg_temp.wdf_id(11), 'Unrelated workspace', pg_temp.wdf_id(1), false),
  (pg_temp.wdf_id(12), 'Retained delivery fixture', pg_temp.wdf_id(1), false);

select is((select confdeltype::text from pg_constraint
  where conrelid = 'public.realtime_log_aggregations'::regclass
    and conname = 'realtime_log_aggregations_ws_id_fkey'), 'c',
  'workspace log buckets cascade');
select is((select confdeltype::text from pg_constraint
  where conrelid = 'public.workspace_documents'::regclass
    and conname = 'workspace_documents_ws_id_fkey'), 'c',
  'workspace documents cascade');
select is((select confupdtype::text from pg_constraint
  where conrelid = 'public.realtime_log_aggregations'::regclass
    and conname = 'realtime_log_aggregations_ws_id_fkey'), 'c',
  'log ON UPDATE CASCADE is preserved');
select is((select confupdtype::text from pg_constraint
  where conrelid = 'public.workspace_documents'::regclass
    and conname = 'workspace_documents_ws_id_fkey'), 'a',
  'document ON UPDATE NO ACTION is preserved');

insert into public.realtime_log_aggregations(ws_id, time_bucket, kind, total_count)
values (pg_temp.wdf_id(10), now(), 'workspace-delete-fixture', 7),
  (pg_temp.wdf_id(11), now(), 'workspace-delete-fixture', 3);
insert into public.workspace_documents(id, ws_id, name, content) values
  (pg_temp.wdf_id(20), pg_temp.wdf_id(10), 'Meeting document',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Populated fixture"}]}]}'),
  (pg_temp.wdf_id(21), pg_temp.wdf_id(10), 'Ordinary document', '{"type":"doc","content":[]}'),
  (pg_temp.wdf_id(22), pg_temp.wdf_id(11), 'Other workspace document', '{}'),
  (pg_temp.wdf_id(23), null, 'Unscoped document', '{}');
insert into public.workspace_meetings(id, ws_id, name, creator_id) values
  (pg_temp.wdf_id(30), pg_temp.wdf_id(10), 'Populated meeting', pg_temp.wdf_id(1));
insert into private.meeting_documents(meeting_id, document_id, yjs_state) values
  (pg_temp.wdf_id(30), pg_temp.wdf_id(20), '[1,2,3]');

-- Exercise privileged database deletion; this does not exercise the HTTP route.
set local role service_role;
select lives_ok($q$delete from public.workspaces where id = pg_temp.wdf_id(10)$q$,
  'deleting a workspace populated with logs, documents and meeting children succeeds');
reset role;
select is((select count(*) from public.workspaces where id = pg_temp.wdf_id(10)),
  0::bigint, 'workspace was actually deleted');
select is((select count(*) from public.realtime_log_aggregations where ws_id = pg_temp.wdf_id(10)),
  0::bigint, 'no workspace log orphans');
select is((select count(*) from public.workspace_documents where id in (pg_temp.wdf_id(20), pg_temp.wdf_id(21))),
  0::bigint, 'both document rows are removed');
select is((select count(*) from public.workspace_meetings where id = pg_temp.wdf_id(30)),
  0::bigint, 'meeting is removed');
select is((select count(*) from private.meeting_documents where document_id = pg_temp.wdf_id(20)),
  0::bigint, 'no transitive meeting-document orphan');
select is((select count(*) from public.workspaces where id = pg_temp.wdf_id(11)),
  1::bigint, 'other workspace survives');
select is((select count(*) from public.workspace_documents where id = pg_temp.wdf_id(22)),
  1::bigint, 'other workspace document survives');
select is((select count(*) from public.realtime_log_aggregations where ws_id = pg_temp.wdf_id(11)),
  1::bigint, 'other workspace logs survive');
select is((select count(*) from public.workspace_documents where id = pg_temp.wdf_id(23) and ws_id is null),
  1::bigint, 'unscoped document survives');
select is((select count(*) from auth.users where id = pg_temp.wdf_id(1)),
  1::bigint, 'workspace creator account survives');
select throws_ok($q$insert into public.workspace_documents(ws_id) values (pg_temp.wdf_id(10))$q$,
  '23503', null, 'NOT VALID or validated FK still rejects a new document orphan');
select throws_ok($q$insert into public.realtime_log_aggregations(ws_id, time_bucket, kind)
  values (pg_temp.wdf_id(10), now(), 'invalid')$q$,
  '23503', null, 'NOT VALID or validated FK still rejects a new log orphan');

-- Retention exceptions are intentional; D must not bypass them.
insert into private.topic_announcements(id, ws_id, title, topic, created_by) values
  (pg_temp.wdf_id(40), pg_temp.wdf_id(12), 'Retained notice', 'Topic', pg_temp.wdf_id(1));
insert into private.topic_announcement_delivery_attempts(id, announcement_id, ws_id, actor_id, snapshot)
values (pg_temp.wdf_id(41), pg_temp.wdf_id(40), pg_temp.wdf_id(12), pg_temp.wdf_id(1),
  '{"payload":{},"recipients":[],"attachments":[]}');
set local role service_role;
select throws_ok($q$delete from public.workspaces where id = pg_temp.wdf_id(12)$q$,
  '23503', null, 'retained delivery history still blocks workspace deletion');
reset role;
select is((select count(*) from private.topic_announcement_delivery_attempts where id = pg_temp.wdf_id(41)),
  1::bigint, 'failed deletion preserves immutable delivery receipt');
select is((select count(*) from public.workspaces where id = pg_temp.wdf_id(12)),
  1::bigint, 'retained-history workspace survives atomically');
select throws_ok($q$delete from private.topic_announcement_delivery_attempts where id = pg_temp.wdf_id(41)$q$,
  '55000', 'Delivery attempt history is immutable', 'receipt DELETE trigger remains intact');
select throws_ok($q$delete from public.workspaces where personal and creator_id = pg_temp.wdf_id(1)$q$,
  '23514', 'Personal workspaces cannot be deleted manually', 'personal-workspace guard remains intact');

select * from finish();
rollback;
