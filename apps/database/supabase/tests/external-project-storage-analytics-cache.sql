BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.users(id) VALUES ('73007000-0000-4000-8000-000000000002');
INSERT INTO public.workspaces(id, name, personal, creator_id) VALUES ('73007000-0000-4000-8000-000000000001', 'Storage analytics cache test', false, '73007000-0000-4000-8000-000000000002');
INSERT INTO storage.buckets(id, name) VALUES ('workspaces', 'workspaces') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects(bucket_id, name, metadata) VALUES
('workspaces', '73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/a.png', '{"size":100}'),
('workspaces', '73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/b.png', '{"size":200}'),
('workspaces', '73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/.emptyFolderPlaceholder', '{"size":10}'),
('workspaces', '73007000-0000-4000-8000-000000000001/external-projects/other/art/c.png', '{"size":900}');
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'totalSize')::bigint, 300::bigint, 'totals exclude placeholders and other adapters');
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'fileCount')::bigint, 2::bigint, 'counts only files');
CREATE TEMP TABLE first_refresh AS SELECT computed_at FROM private.external_project_storage_analytics_cache WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse';
SELECT public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse');
SELECT is((SELECT computed_at FROM private.external_project_storage_analytics_cache WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse'), (SELECT computed_at FROM first_refresh), 'repeated reads reuse the persisted calculation');
UPDATE storage.objects SET metadata='{"size":400}' WHERE name='73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/a.png';
SELECT ok((SELECT payload IS NULL FROM private.external_project_storage_analytics_cache WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse'), 'overwrite invalidates the cache in the file transaction');
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'totalSize')::bigint, 600::bigint, 'overwrite refreshes totals');
-- Exercise the Storage API's database deletion path only in this rolled-back fixture.
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE name='73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/b.png';
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'fileCount')::bigint, 1::bigint, 'deletion refreshes count');
UPDATE storage.objects SET name='73007000-0000-4000-8000-000000000001/external-projects/other/art/a.png' WHERE name='73007000-0000-4000-8000-000000000001/external-projects/exocorpse/art/a.png';
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'totalSize')::bigint, 0::bigint, 'moving a file out of the adapter refreshes totals');
INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('workspaces', '73007000-0000-4000-8000-000000000001/external-projects/exocorpse/new.png', '{"size":50}');
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'totalSize')::bigint, 50::bigint, 'direct uploads invalidate cached totals');
UPDATE private.external_project_storage_analytics_cache SET computed_at=now()-interval '6 minutes', payload='{"totalSize":999}' WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse';
SELECT is((public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')->>'totalSize')::bigint, 50::bigint, 'expired snapshots are recalculated');
-- Legacy non-UUID prefixes must not make the AFTER trigger cast fail or evict UUID caches.
CREATE TEMP TABLE before_legacy_mutation AS SELECT computed_at FROM private.external_project_storage_analytics_cache WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse';
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('workspaces', 'legacy-cache-test/external-projects/exocorpse/a.png', '{"size":1}')$$, 'legacy non-UUID insertion does not fail invalidation');
SELECT lives_ok($$DELETE FROM storage.objects WHERE bucket_id='workspaces' AND name='legacy-cache-test/external-projects/exocorpse/a.png'$$, 'legacy non-UUID deletion does not fail invalidation');
SELECT is((SELECT computed_at FROM private.external_project_storage_analytics_cache WHERE ws_id='73007000-0000-4000-8000-000000000001' AND adapter='exocorpse'), (SELECT computed_at FROM before_legacy_mutation), 'legacy prefix mutations preserve unrelated UUID cache');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_external_project_storage_analytics(uuid,text)', 'EXECUTE'), 'authenticated clients cannot bypass project access checks');
SELECT ok(NOT has_table_privilege('anon', 'private.external_project_storage_analytics_cache', 'SELECT'), 'cache is private');
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok($$SELECT public.get_external_project_storage_analytics('73007000-0000-4000-8000-000000000001', 'exocorpse')$$, '42501', 'Service role required', 'RPC also enforces its service-role boundary');
SELECT * FROM finish();
ROLLBACK;
