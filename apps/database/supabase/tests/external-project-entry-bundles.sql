begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select has_table(
  'public',
  'workspace_external_project_relation_definitions',
  'relation definitions exist'
);
select has_table(
  'public',
  'workspace_external_project_relation_definition_targets',
  'relation definition targets exist'
);
select has_column(
  'public',
  'workspace_external_project_entry_relations',
  'relation_definition_id',
  'entry relations reference their definition'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_external_project_entry_relations_definition_fkey'
      and conrelid = 'public.workspace_external_project_entry_relations'::regclass
      and contype = 'f'
  ),
  'entry relations have a workspace-safe relation definition foreign key'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_external_project_entries_ws_collection_fkey'
      and conrelid = 'public.workspace_external_project_entries'::regclass
      and contype = 'f'
  ),
  'entries have a workspace-safe collection foreign key'
);
select has_function(
  'public',
  'upsert_workspace_external_project_entry_bundle',
  array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb', 'uuid', 'timestamp with time zone'],
  'entry bundle RPC exists'
);
select has_function(
  'public',
  'replace_workspace_external_project_relation_definition_targets',
  array['uuid', 'uuid', 'uuid[]', 'uuid'],
  'relation target replacement RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.upsert_workspace_external_project_entry_bundle(uuid,uuid,jsonb,jsonb,jsonb,uuid,timestamp with time zone)',
    'execute'
  ),
  'authenticated clients can invoke the permission-checked bundle RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_workspace_external_project_entry_bundle(uuid,uuid,jsonb,jsonb,jsonb,uuid,timestamp with time zone)',
    'execute'
  ),
  'service role can invoke the bundle RPC'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.workspace_external_project_relation_definitions'::regclass
  ),
  'relation definitions use RLS'
);
select has_trigger(
  'public',
  'workspace_external_project_blocks',
  'workspace_external_project_blocks_touch_entry',
  'block mutations advance the parent entry edit token'
);
select has_trigger(
  'public',
  'workspace_external_project_entry_relations',
  'workspace_external_project_entry_relations_touch_entry',
  'relation mutations advance the parent entry edit token'
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values (
  '50000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'cms-bundle@example.com', now(), now(), now()
)
on conflict (id) do nothing;

insert into public.users (id, display_name)
values ('50000000-0000-0000-0000-000000000001', 'CMS Bundle Test')
on conflict (id) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '50000000-0000-0000-0000-000000000001',
  true
);

insert into public.workspaces (id, name, personal, creator_id)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Bundle test one', false, '50000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Bundle test two', false, '50000000-0000-0000-0000-000000000001'
  );

insert into public.workspace_external_project_collections (
  id, ws_id, slug, title, collection_type
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'characters', 'Characters', 'character'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'worlds', 'Worlds', 'world'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    'worlds', 'Worlds', 'world'
  );

insert into public.workspace_external_project_entries (
  id, ws_id, collection_id, slug, title, status
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'earth', 'Earth', 'published'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'mars', 'Mars', 'draft'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    'other', 'Other workspace', 'published'
  );

insert into public.workspace_external_project_relation_definitions (
  id, ws_id, source_collection_id, key, label, cardinality, is_required
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'world', 'World', 'one', true
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'allies', 'Allies', 'many', false
  );

insert into public.workspace_external_project_relation_definition_targets (
  ws_id, relation_definition_id, target_collection_id
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002'
  );

select throws_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
    '{"collectionId":"20000000-0000-0000-0000-000000000003","slug":"cross-collection","title":"Cross collection"}'::jsonb,
    '[]'::jsonb, '[]'::jsonb
  )$$,
  '23503',
  'invalid entry collection',
  'cross-workspace entry collections are rejected'
);
select throws_ok(
  $$select public.replace_workspace_external_project_relation_definition_targets(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    array['20000000-0000-0000-0000-000000000003'::uuid],
    '50000000-0000-0000-0000-000000000001'
  )$$,
  '23503',
  'invalid relation target collection',
  'cross-workspace relation target replacement is rejected'
);
select is(
  (
    select count(*)::integer
    from public.workspace_external_project_relation_definition_targets
    where relation_definition_id = '40000000-0000-0000-0000-000000000001'
  ),
  1,
  'failed target replacement preserves existing targets'
);

select lives_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
    '{"collectionId":"20000000-0000-0000-0000-000000000001","slug":"hero","title":"Hero","status":"published"}'::jsonb,
    '[{"blockType":"markdown","content":{"markdown":"Hello"},"sortOrder":0}]'::jsonb,
    '[{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000001"}]'::jsonb
  )$$,
  'a complete entry bundle is created atomically'
);
select throws_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
    '{"collectionId":"20000000-0000-0000-0000-000000000001","slug":"spoofed","title":"Spoofed"}'::jsonb,
    '[]'::jsonb, '[]'::jsonb
  )$$,
  '42501',
  'actor does not match authenticated user',
  'authenticated callers cannot spoof a bundle actor'
);
select is(
  (
    select count(*)::integer
    from public.workspace_external_project_entry_relations relation
    join public.workspace_external_project_entries entry
      on entry.id = relation.from_entry_id
    where entry.slug = 'hero'
  ),
  1,
  'bundle creates outgoing relations'
);
select is(
  (
    select count(*)::integer
    from public.workspace_external_project_blocks block
    join public.workspace_external_project_entries entry on entry.id = block.entry_id
    where entry.slug = 'hero'
  ),
  1,
  'bundle creates blocks'
);
select throws_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
    '{"collectionId":"20000000-0000-0000-0000-000000000001","slug":"missing","title":"Missing relation"}'::jsonb,
    '[]'::jsonb, '[]'::jsonb
  )$$,
  '23502',
  'required relation is missing',
  'required relations are enforced'
);
select throws_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
    '{"collectionId":"20000000-0000-0000-0000-000000000001","slug":"too-many","title":"Too many"}'::jsonb,
    '[]'::jsonb,
    '[{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000001"},{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000002"}]'::jsonb
  )$$,
  '23514',
  'relation cardinality exceeded',
  'single relation cardinality is enforced'
);
select throws_ok(
  $$select public.upsert_workspace_external_project_entry_bundle(
    '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
    '{"collectionId":"20000000-0000-0000-0000-000000000001","slug":"cross-workspace","title":"Cross workspace"}'::jsonb,
    '[]'::jsonb,
    '[{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000003"}]'::jsonb
  )$$,
  '23503',
  'invalid relation target',
  'cross-workspace relation targets are rejected'
);
select throws_ok(
  format(
    $$select public.upsert_workspace_external_project_entry_bundle(
      '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
      '{"title":"Stale title"}'::jsonb, '[]'::jsonb,
      '[{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000001"}]'::jsonb,
      %L::uuid, '2000-01-01T00:00:00Z'::timestamptz
    )$$,
    (select id from public.workspace_external_project_entries where slug = 'hero')
  ),
  '40001',
  'entry update conflict',
  'stale bundle updates return an optimistic concurrency conflict'
);
select is(
  (
    select title
    from public.workspace_external_project_entries
    where slug = 'hero'
  ),
  'Hero',
  'failed bundle updates roll back every write'
);
select lives_ok(
  format(
    $$select public.upsert_workspace_external_project_entry_bundle(
      '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
      '{"title":"Hero updated"}'::jsonb,
      '[{"blockType":"markdown","content":{"markdown":"Second"},"sortOrder":1},{"blockType":"markdown","content":{"markdown":"First"},"sortOrder":0}]'::jsonb,
      '[{"definitionId":"40000000-0000-0000-0000-000000000001","toEntryId":"30000000-0000-0000-0000-000000000001"}]'::jsonb,
      %L::uuid, %L::timestamptz
    )$$,
    (select id from public.workspace_external_project_entries where slug = 'hero'),
    (select updated_at from public.workspace_external_project_entries where slug = 'hero')
  ),
  'a current bundle update replaces blocks and relations'
);
select is(
  (select title from public.workspace_external_project_entries where slug = 'hero'),
  'Hero updated',
  'current bundle updates persist'
);

select * from finish();
rollback;
