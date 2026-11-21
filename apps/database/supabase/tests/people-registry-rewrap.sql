begin;
select plan(13);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('ae000000-0000-4000-8000-000000000001', 'rewrap-owner@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, creator_id, personal)
  values ('ae100000-0000-4000-8000-000000000001', 'Rewrap tenant', 'ae000000-0000-4000-8000-000000000001', false);
create temporary table rewrap_blobs as select
  '\x02aaaaaaaa'::bytea || gen_random_bytes(60) as old_blob,
  '\x02bbbbbbbb'::bytea || gen_random_bytes(60) as new_blob;
select private.people_registry_enable('ae100000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001',
  jsonb_build_object('sender_lookup', encode((select old_blob from rewrap_blobs), 'base64'),
    'conversation_lookup', encode((select old_blob from rewrap_blobs), 'base64'),
    'suppression', encode((select old_blob from rewrap_blobs), 'base64'),
    'display', encode((select old_blob from rewrap_blobs), 'base64'),
    'audit', encode((select old_blob from rewrap_blobs), 'base64')));

select ok(not has_function_privilege('authenticated', 'private.people_rewrap_key(uuid, private.people_key_purpose, smallint, bytea, bytea)', 'EXECUTE'),
  'clients cannot re-wrap keys');
select is(private.people_wrap_kid_usage('\xaaaaaaaa'), 5::bigint, 'every row starts under the old kid');
select is(private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'display', 1::smallint,
  (select old_blob from rewrap_blobs), (select new_blob from rewrap_blobs)), 'rewrapped', 'a matching row is re-wrapped');
select is(private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'display', 1::smallint,
  (select old_blob from rewrap_blobs), (select new_blob from rewrap_blobs)), 'changed', 'a repeat run changes nothing');
select is(private.people_wrap_kid_usage('\xaaaaaaaa'), 4::bigint, 'usage counts the remaining rows');
select throws_ok($$select private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), '\x01'::bytea || gen_random_bytes(64))$$, '22023', null,
  'only well-formed v2 blobs are written');
select throws_ok($$select private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), null)$$, '22023', null, 'a null new blob is refused');
select throws_ok($$select private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), (select old_blob from rewrap_blobs))$$, '22023', null, 'an unchanged blob is refused');
select throws_ok($$select private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), '\x02aaaaaaaa'::bytea || gen_random_bytes(60))$$, '22023', null,
  'a same-kid re-wrap is refused');
select is(private.people_rewrap_key('ae100000-0000-4000-8000-00000000ffff', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), (select new_blob from rewrap_blobs)), 'missing', 'a missing registry is reported');
select is((select reason_code from private.people_audit_events
  where ws_id = 'ae100000-0000-4000-8000-000000000001' and action = 'key.rewrap.display'),
  'kid_bbbbbbbb_from_aaaaaaaa_v1', 'a re-wrap leaves a names-only audit event');
update private.people_registry_control set stopped = true where ws_id = 'ae100000-0000-4000-8000-000000000001';
select is(private.people_rewrap_key('ae100000-0000-4000-8000-000000000001', 'audit', 1::smallint,
  (select old_blob from rewrap_blobs), (select new_blob from rewrap_blobs)), 'stopped', 'a stopped registry refuses re-wraps');
select is(private.people_wrap_kid_usage('\xaaaaaaaa'), 4::bigint, 'a stopped re-wrap leaves the row unchanged');

select * from finish();
rollback;
