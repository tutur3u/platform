BEGIN;
SELECT plan(15);
INSERT INTO private.mobile_deployment_environments (id, environment)
VALUES ('a0000000-0000-0000-0000-000000000001', 'development');
INSERT INTO private.mobile_deployment_versions
(id, environment_id, version, status, data_key_ciphertext, inheritance_initialized)
VALUES
('a0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001',1,'active','source-key',true),
('a0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001',2,'draft','draft-key',true),
('a0000000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000001',3,'draft','pending-key',false);
UPDATE private.mobile_deployment_environments SET active_version_id = 'a0000000-0000-0000-0000-000000000011'
WHERE id = 'a0000000-0000-0000-0000-000000000001';
INSERT INTO private.mobile_deployment_secret_values
(version_id, kind, name, encrypted_value, plaintext_sha256, plaintext_last_four, value_size)
VALUES
('a0000000-0000-0000-0000-000000000011','scalar','KEEP','active-value','hash','alue',4),
('a0000000-0000-0000-0000-000000000012','scalar','KEEP','draft-override','hash','ride',4);
SELECT is((private.mobile_deployment_inheritance_snapshot('a0000000-0000-0000-0000-000000000012')->'source'->>'id'),
 'a0000000-0000-0000-0000-000000000011','snapshot uses active pointer');
SELECT private.mobile_deployment_exclude_inheritance('a0000000-0000-0000-0000-000000000012','scalar:REMOVED');
SELECT ok((SELECT 'scalar:REMOVED' = ANY(inheritance_excluded) FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000012'), 'missing key deletion is durable');
CREATE TEMP TABLE saved_revision AS SELECT inheritance_revision AS revision FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000012';
UPDATE private.mobile_deployment_secret_values SET encrypted_value='concurrent-override' WHERE version_id='a0000000-0000-0000-0000-000000000012';
SELECT throws_ok(format($$SELECT private.mobile_deployment_commit_inheritance('a0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000011',%s,NULL,'[]','[]')$$,(SELECT revision FROM saved_revision)),
 '40001','Vault changed during inheritance; refresh and retry','stale snapshot cannot commit after concurrent edit');
SELECT is((SELECT encrypted_value FROM private.mobile_deployment_secret_values WHERE version_id='a0000000-0000-0000-0000-000000000012'), 'concurrent-override', 'concurrent edit survives');
SELECT throws_ok(format($$SELECT private.mobile_deployment_commit_inheritance('a0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000011',%s,NULL,'[{"kind":"scalar","name":"ADDED","encrypted_value":"cipher","plaintext_sha256":"hash","plaintext_last_four":"test","value_size":4}]','[{"kind":"invalid"}]')$$,
 (SELECT inheritance_revision FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000012')),
 '23502', NULL, 'invalid file metadata rolls back entire commit');
SELECT is((SELECT count(*)::int FROM private.mobile_deployment_secret_values WHERE version_id='a0000000-0000-0000-0000-000000000012' AND name='ADDED'), 0, 'partial failure inserts no secret');
SELECT is((SELECT inherited_from_version_id::text FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000012'), NULL, 'partial failure does not mark completed');
SELECT private.mobile_deployment_commit_inheritance('a0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000011',
 (SELECT inheritance_revision FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000012'), NULL,
 '[{"kind":"scalar","name":"KEEP","encrypted_value":"old-overwrite","plaintext_sha256":"hash","plaintext_last_four":"test","value_size":4},
   {"kind":"scalar","name":"REMOVED","encrypted_value":"restored","plaintext_sha256":"hash","plaintext_last_four":"test","value_size":4},
   {"kind":"scalar","name":"ADDED","encrypted_value":"new-key-cipher","plaintext_sha256":"hash","plaintext_last_four":"test","value_size":4}]','[]');
SELECT is((SELECT encrypted_value FROM private.mobile_deployment_secret_values WHERE version_id='a0000000-0000-0000-0000-000000000012' AND name='KEEP'), 'concurrent-override', 'commit preserves existing override');
SELECT is((SELECT count(*)::int FROM private.mobile_deployment_secret_values WHERE version_id='a0000000-0000-0000-0000-000000000012' AND name='REMOVED'), 0, 'commit preserves tombstone');
SELECT is((SELECT encrypted_value FROM private.mobile_deployment_secret_values WHERE version_id='a0000000-0000-0000-0000-000000000012' AND name='ADDED'), 'new-key-cipher', 'commit copies prepared ciphertext');
SELECT throws_ok($$INSERT INTO private.mobile_deployment_secret_values(version_id,kind,name,encrypted_value,plaintext_sha256,plaintext_last_four,value_size)
 VALUES ('a0000000-0000-0000-0000-000000000013','scalar','NO','x','h','x',1)$$,
 'P0001','Vault draft initialization is incomplete','unfinished draft rejects ordinary resource writes');
SELECT private.mobile_deployment_commit_inheritance('a0000000-0000-0000-0000-000000000013','a0000000-0000-0000-0000-000000000011',0,NULL,'[]','[]');
SELECT ok((SELECT inheritance_initialized FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000013'), 'successful initialization permits draft use');
SELECT ok(NOT has_function_privilege('authenticated','private.mobile_deployment_inheritance_snapshot(uuid)','EXECUTE'), 'authenticated user cannot access encrypted snapshot RPC');
INSERT INTO private.mobile_deployment_file_artifacts
(version_id,kind,storage_provider,storage_path,filename,content_type,ciphertext_sha256,plaintext_sha256,plaintext_size,ciphertext_size)
VALUES ('a0000000-0000-0000-0000-000000000013','apple_app_store_provisioning_profile','r2','draft/profile','profile.mobileprovision','application/octet-stream','cipherhash','plainhash',4,10);
SELECT is((SELECT count(*)::int FROM private.mobile_deployment_file_artifacts WHERE version_id='a0000000-0000-0000-0000-000000000013'),1,'initialized draft accepts file uploads with revision trigger');
SELECT ok((SELECT inheritance_revision > 1 FROM private.mobile_deployment_versions WHERE id='a0000000-0000-0000-0000-000000000013'),'file upload advances optimistic revision');
SELECT * FROM finish();
ROLLBACK;
