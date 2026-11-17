begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

\set owner 'c1700000-0000-4000-8000-000000000001'
\set editor 'c1700000-0000-4000-8000-000000000002'
\set member 'c1700000-0000-4000-8000-000000000003'
\set outsider 'c1700000-0000-4000-8000-000000000004'
\set first_ws 'c1700000-0000-4000-8000-000000000011'
\set second_ws 'c1700000-0000-4000-8000-000000000012'
\set first_item 'c1700000-0000-4000-8000-000000000021'
\set second_item 'c1700000-0000-4000-8000-000000000022'
\set extra_item 'c1700000-0000-4000-8000-000000000023'

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  (:'owner', 'cite-owner@example.com', now(), '{}', '{}'),
  (:'editor', 'cite-editor@example.com', now(), '{}', '{}'),
  (:'member', 'cite-member@example.com', now(), '{}', '{}'),
  (:'outsider', 'cite-outsider@example.com', now(), '{}', '{}');

insert into public.users (id) values (:'owner'), (:'editor'), (:'member'), (:'outsider')
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  (:'first_ws', 'Citation workspace A', false, :'owner'),
  (:'second_ws', 'Citation workspace B', false, :'editor');

insert into public.workspace_members (ws_id, user_id, type) values
  (:'first_ws', :'owner', 'MEMBER'),
  (:'first_ws', :'editor', 'MEMBER'),
  (:'first_ws', :'member', 'MEMBER'),
  (:'second_ws', :'editor', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
values (:'first_ws', 'admin', 'MEMBER', false),
       (:'first_ws', 'manage_documents', 'MEMBER', false)
on conflict (ws_id, permission, member_type) do update set enabled = false;

insert into public.workspace_roles (id, ws_id, name)
values ('c1700000-0000-4000-8000-000000000031', :'first_ws', 'Citation editors');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values (:'first_ws', 'c1700000-0000-4000-8000-000000000031', 'manage_documents', true);
insert into public.workspace_role_members (role_id, user_id)
values ('c1700000-0000-4000-8000-000000000031', :'editor');

select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_table_privilege('authenticated', 'private.citation_library_items', 'SELECT')
    and not has_table_privilege('anon', 'private.citation_library_items', 'INSERT')
    and not has_table_privilege('service_role', 'private.citation_library_items', 'UPDATE'),
  'Cite keeps private table access behind scoped RPCs'
);
select ok(
  not has_function_privilege('authenticated',
    'private.insert_citation_library_item(uuid,uuid,uuid,jsonb,text,text[])', 'EXECUTE')
    and not has_function_privilege('anon',
      'private.list_citation_library_items(uuid,uuid,integer,integer,text)', 'EXECUTE'),
  'client roles cannot send a spoofed actor to the private RPCs'
);

set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

select is(
  (select owner_user_id from private.insert_citation_library_item(
    :'first_ws', :'editor', :'first_item', '{"title":"River_% chart"}', repeat('a', 64), array['draft']
  )), :'editor'::uuid,
  'the initial item records the authorized actor'
);
select is(
  (select version from private.lookup_citation_library_items(
    :'first_ws', :'editor', array[:'first_item'::uuid]
  )), 1, 'the initial item starts at version one'
);
select is(
  (select count(*) from private.insert_citation_library_item(
    :'second_ws', :'editor', :'second_item', '{"title":"River AX chart"}', repeat('a', 64), '{}'
  )), 1::bigint, 'a fingerprint can occur in a different workspace'
);
select throws_ok(
  format('select private.insert_citation_library_item(%L,%L,%L,%L,repeat(''a'',64),%L)',
    :'first_ws', :'editor', :'extra_item', '{}', '{}'),
  '23505', null, 'a duplicate fingerprint in the same workspace is rejected'
);
select throws_ok(
  format('select private.insert_citation_library_item(%L,%L,%L,jsonb_build_object(''title'', repeat(''x'', 60000)),repeat(''b'',64),%L)',
    :'first_ws', :'editor', :'extra_item', '{}'),
  '23514', null, 'the database caps stored work bytes'
);
select throws_ok(
  format('select private.insert_citation_library_item(%L,%L,%L,%L,repeat(''b'',64),array_fill(repeat(''界'', 100), array[30]))',
    :'first_ws', :'editor', :'extra_item', '{}'),
  '23514', null, 'the database caps tags by aggregate byte length'
);

select throws_ok(
  format('select private.list_citation_library_items(%L,%L,50,0,%L)', :'first_ws', :'member', ''),
  '42501', 'Citation library access denied', 'a MEMBER without manage_documents cannot list'
);
select throws_ok(
  format('select private.delete_citation_library_item(%L,%L,%L,1)', :'first_ws', :'member', :'first_item'),
  '42501', 'Citation library access denied', 'a MEMBER without manage_documents cannot delete'
);
select throws_ok(
  format('select private.list_citation_library_items(%L,%L,50,0,%L)', :'first_ws', :'outsider', ''),
  '42501', 'Citation library access denied', 'a non-member cannot list'
);
select throws_ok(
  format('select private.insert_citation_library_item(%L,%L,%L,%L,repeat(''b'',64),%L)',
    :'second_ws', :'owner', :'extra_item', '{}', '{}'),
  '42501', 'Citation library access denied', 'a foreign workspace cannot be written'
);

-- The editor is authorized in both workspaces, so these assertions test the
-- item boundary independently of the caller's access to the supplied workspace.
select is(
  (select count(*) from private.lookup_citation_library_items(
    :'second_ws', :'editor', array[:'first_item'::uuid]
  )), 0::bigint, 'the lookup never returns a foreign item'
);
select is(
  (select count(*) from private.update_citation_library_item(
    :'second_ws', :'editor', :'first_item', 1, '{}', repeat('a', 64), '{}'
  )), 0::bigint, 'the update never modifies a foreign item'
);
select is(
  private.delete_citation_library_item(:'second_ws', :'editor', :'first_item', 1),
  false, 'the delete never removes a foreign item'
);

select is(
  (select id from private.list_citation_library_items(:'first_ws', :'editor', 100, 0, 'RIVER_%')),
  :'first_item'::uuid, 'literal, case-insensitive search finds the item'
);
select is(
  (select count(*) from private.list_citation_library_items(:'second_ws', :'editor', 100, 0, 'RIVER_%')),
  0::bigint, 'search metacharacters do not act as wildcards'
);
select is(
  (select id from private.list_citation_library_items(:'first_ws', :'editor', 100, 0, 'DRAFT')),
  :'first_item'::uuid, 'search matches tags'
);

select is(
  (select version from private.update_citation_library_item(
    :'first_ws', :'owner', :'first_item', 1, '{"title":"Updated"}', repeat('c', 64), '{}'
  )), 2, 'a permitted collaborator updates a shared item and advances the version'
);
select is(
  (select owner_user_id from private.lookup_citation_library_items(
    :'first_ws', :'owner', p_fingerprint => repeat('c', 64)
  )), :'editor'::uuid, 'the update preserves the original owner'
);
select is(
  (select count(*) from private.update_citation_library_item(
    :'first_ws', :'editor', :'first_item', 1, '{"title":"Stale"}', repeat('a', 64), '{}'
  )), 0::bigint, 'a stale update matches no item'
);
select is(
  private.delete_citation_library_item(:'first_ws', :'editor', :'first_item', 1),
  false, 'a stale delete matches no item'
);
select is(
  (select work ->> 'title' from private.lookup_citation_library_items(
    :'first_ws', :'editor', array[:'first_item'::uuid]
  )), 'Updated', 'the winning version survives stale writes'
);
-- Exercise RLS with transaction-local table grants, after checking the
-- deployed ACL above. The test rollback discards these grants.
reset role;
grant usage on schema private to authenticated;
grant select, insert, delete on private.citation_library_items to authenticated;
grant update (tags) on private.citation_library_items to authenticated;
grant execute on function private.citation_library_tags_valid(text[]),
  private.citation_library_search_text(jsonb, text[]) to authenticated;

set local role authenticated;
select throws_ok(
  format('select private.insert_citation_library_item(%L,%L,%L,%L,repeat(''b'',64),%L)',
    :'first_ws', :'editor', :'extra_item', '{}', '{}'),
  '42501', null, 'authenticated callers cannot pass an actor to the insert RPC'
);
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', :'member')::text, true);
select is(
  (select count(*) from private.citation_library_items where id = :'first_item'),
  0::bigint, 'RLS hides items from a member lacking permission'
);
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', :'outsider')::text, true);
select is(
  (select count(*) from private.citation_library_items where id = :'first_item'),
  0::bigint, 'RLS hides items from a non-member'
);
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', :'owner')::text, true);
select is(
  (select count(*) from private.citation_library_items where id = :'first_item'),
  1::bigint, 'RLS admits the permitted member'
);
select throws_ok(
  format('insert into private.citation_library_items (id,ws_id,owner_user_id,work,fingerprint) values (%L,%L,%L,%L,repeat(''b'',64))',
    :'extra_item', :'first_ws', :'editor', '{}'),
  '42501', null, 'RLS rejects spoofed ownership even for a permitted member'
);
insert into private.citation_library_items (id,ws_id,work,fingerprint)
values (:'extra_item', :'first_ws', '{}', repeat('b', 64));
select is(
  (select owner_user_id from private.citation_library_items where id = :'extra_item'),
  :'owner'::uuid, 'the table ownership default takes the authenticated caller'
);
select is(
  (select count(*) from private.citation_library_items where id = :'second_item'),
  0::bigint, 'RLS hides a foreign workspace item'
);
with attempted as (
  update private.citation_library_items set tags = array['foreign']
  where id = :'second_item' returning id
)
select is((select count(*) from attempted), 0::bigint, 'RLS rejects foreign updates');
with attempted as (
  delete from private.citation_library_items where id = :'second_item' returning id
)
select is((select count(*) from attempted), 0::bigint, 'RLS rejects foreign deletes');
select throws_ok(
  format('insert into private.citation_library_items (id,ws_id,work,fingerprint) values (%L,%L,%L,repeat(''b'',64))',
    :'extra_item', :'second_ws', '{}'),
  '42501', null, 'RLS denies inserts into a foreign workspace'
);

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  private.delete_citation_library_item(:'second_ws', :'editor', :'second_item', 1),
  true, 'a delete at the matching version removes the item'
);

reset role;
set local request.jwt.claims to '{}';
delete from auth.users where id = :'editor';
select is(
  (select owner_user_id from private.citation_library_items where id = :'first_item'),
  null::uuid, 'deleting the actor clears the owner link'
);
select is(
  (select count(*) from private.citation_library_items where id = :'first_item'),
  1::bigint, 'deleting the actor preserves the shared item'
);

select is(
  (select count(*) from public.ai_credit_feature_access as generation
   cross join (values ('cite_fix_ref'), ('cite_convert_style'), ('cite_suggest_sources'), ('cite_claim_check')) as feature(name)
   join public.ai_credit_feature_access citation
     on citation.feature = feature.name and citation.tier = generation.tier
   where generation.feature = 'generate'
     and citation.enabled = generation.enabled
     and citation.max_requests_per_day is not distinct from generation.max_requests_per_day),
  16::bigint, 'all four Cite features follow generation entitlement across the four seeded tiers'
);

select * from finish();
rollback;
