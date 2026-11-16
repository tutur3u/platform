BEGIN;
SELECT plan(3);
INSERT INTO private.mobile_deployment_environments (id, environment)
VALUES ('b0000000-0000-0000-0000-000000000001', 'development');
INSERT INTO private.mobile_deployment_versions
(id, environment_id, version, status, data_key_ciphertext, inheritance_initialized)
VALUES ('b0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000001',1,'draft','draft-key',true);
SELECT lives_ok($$INSERT INTO private.mobile_deployment_file_artifacts
 (version_id,kind,storage_provider,storage_path,filename,content_type,ciphertext_sha256,plaintext_sha256,plaintext_size,ciphertext_size)
 VALUES ('b0000000-0000-0000-0000-000000000011','apple_mac_installer_certificate_p12','r2','draft/installer','installer.p12','application/x-pkcs12','cipherhash','plainhash',4,10)$$,
 'vault accepts the Mac installer certificate kind');
SELECT lives_ok($$INSERT INTO private.mobile_deployment_file_artifacts
 (version_id,kind,storage_provider,storage_path,filename,content_type,ciphertext_sha256,plaintext_sha256,plaintext_size,ciphertext_size)
 VALUES ('b0000000-0000-0000-0000-000000000011','apple_mac_app_store_provisioning_profile','r2','draft/mac-profile','mac.provisionprofile','application/octet-stream','cipherhash','plainhash',4,10)$$,
 'vault accepts the Mac App Store provisioning profile kind');
SELECT throws_ok($$INSERT INTO private.mobile_deployment_file_artifacts
 (version_id,kind,storage_provider,storage_path,filename,content_type,ciphertext_sha256,plaintext_sha256,plaintext_size,ciphertext_size)
 VALUES ('b0000000-0000-0000-0000-000000000011','apple_unknown_artifact','r2','draft/unknown','unknown.bin','application/octet-stream','cipherhash','plainhash',4,10)$$,
 '23514', NULL, 'vault rejects an unknown file kind');
SELECT * FROM finish();
ROLLBACK;
