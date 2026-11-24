// Source-bound findings for the workspace secrets step 1 migrations
// (apps/docs/platform/architecture/workspace-secrets-encryption.mdx). Each is a
// pattern the guard cannot see: revokes run as the new function owner, DO-block
// assertions, ownership-only ALTERs and the accepted Vault decrypt grant.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261124150100_workspace_secrets_credential_rpcs.sql',
    line: 172,
    rule: 'function-acl',
    fileDigest:
      '0fdf29faac13c1b55d43adf93d002b28ca5ad374d92470b201da3a56877cb9c9',
    digest: 'dcc424163b41a30d4bf4e730bf1dd0de0f5bd8fbc020fda4641792d24556e1bc',
    reason:
      'Trigger function revoked from PUBLIC, anon, authenticated and service_role at 186-187 with no grant: trigger functions are not EXECUTE-checked when they fire. The end-of-migration check fails the migration if anon, authenticated or service_role can execute it.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150100_workspace_secrets_credential_rpcs.sql',
    line: 302,
    rule: 'dynamic-sql-review',
    fileDigest:
      '0fdf29faac13c1b55d43adf93d002b28ca5ad374d92470b201da3a56877cb9c9',
    digest: 'fd92e54548b276010a3fa4a79bff0027b8e0172691021f4cdaf9186e61c8a0fb',
    reason:
      'End-of-migration assertion: reads has_function_privilege() and raises; format() only builds the error message. No dynamic SQL is executed.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 57,
    rule: 'dynamic-sql-review',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '1e021c812243600a6f6dafedb5476fe7dfb2dd3ef03a170becc1a2b36068b999',
    reason:
      'Grants EXECUTE on vault._crypto_aead_det_decrypt to the NOLOGIN workspace_secrets_definer only; the target regprocedure comes from pg_proc filtered by schema and name, never from input, and is dynamic only because its signature belongs to the Vault version. Accepted Vault residual in the step 1 design.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 57,
    rule: 'dynamic-sql-review',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '1e021c812243600a6f6dafedb5476fe7dfb2dd3ef03a170becc1a2b36068b999',
    reason:
      'Grants EXECUTE on vault._crypto_aead_det_decrypt to the NOLOGIN workspace_secrets_definer only; the target regprocedure comes from pg_proc filtered by schema and name, never from input, and is dynamic only because its signature belongs to the Vault version. Accepted Vault residual in the step 1 design.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 18,
    rule: 'dynamic-sql-review',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '113ca82c1d20a1ca1467b104264be0cc0f851c5f364f60327025cc3eb6b55003',
    reason:
      'Raises below PostgreSQL 16 and runs a static CREATE ROLE workspace_secrets_definer NOLOGIN NOINHERIT when the role is missing. No dynamic SQL.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 36,
    rule: 'dynamic-sql-review',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '97b18469526d6b826b5bad7b542418b516836cbb96a22b7152746945f337a330',
    reason:
      'Read-only assertion that workspace_secrets_definer has neither SUPERUSER nor REPLICATION; raises otherwise. No dynamic SQL.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 51,
    rule: 'rollback-safety',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'a17cc7673141a0fcd669dc1b68583ee4088b8fdd045f338155bc91c2da426fe6',
    reason:
      'workspace_secrets_definer is NOLOGIN, NOINHERIT and NOBYPASSRLS; granting it to the migration user WITH INHERIT FALSE, SET TRUE lets the migration transfer config-function ownership to it. No API role is a member (asserted at the end of the migration and in pgTAP). Same pattern as 20261121163000_secrets_vault_storage.sql:19.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 94,
    rule: 'function-acl',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'bbf3f743ebd4ce8cf20bca58c134d824c85585161c8d6c42ac9e90c9b9c3203e',
    reason:
      'Private definer function; after ALTER OWNER its owner revokes ALL from PUBLIC, anon, authenticated and service_role (SET LOCAL ROLE block, 291-318) and grants only the definer role. The end-of-migration check and pgTAP assert no API role can execute it.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 123,
    rule: 'function-acl',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'c08fe838a36b2577bd2662076787c3b1c6ae86fcfa9fba4466d08a29f7b7c03b',
    reason:
      'Private definer function; after ALTER OWNER its owner revokes ALL from PUBLIC, anon, authenticated and service_role (291-318) and grants only the definer role and the migration user (step 3 Postgres callers). The end-of-migration check and pgTAP assert no API role can execute it.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 141,
    rule: 'function-acl',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '9fc0dcef48dd00cb8602e758368d402314cc9de6bece910962d956a0dd390037',
    reason:
      'Private definer function; after ALTER OWNER its owner revokes ALL from PUBLIC, anon, authenticated and service_role (291-318) and grants only the migration user. The end-of-migration check and pgTAP assert no API role can execute it.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 256,
    rule: 'function-acl',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '755f5165892f84a24a27d93f0ade78f80a2545ccb89b0db683dbfcdbe13bfdd5',
    reason:
      'Trigger function; after ALTER OWNER its owner revokes ALL from PUBLIC, anon, authenticated and service_role (291-318) with no grant: trigger functions are not EXECUTE-checked when they fire. The end-of-migration check asserts no API role can execute it.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 279,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'c5875d60942ac771997338206d3191cb856b8c1a72fd291dc0cbc8008cdae8a6',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 280,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '83a04761b17b8017ed2f86eddc4773778dd9b22036fc457296c36a09a60ef389',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 281,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '97c199c4ad7f615a19e85263a3376765d798627f32d81047c1c2c053f01ac1ab',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 282,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '7284407dc2f051e1164d66b2084c28d98213e81f6aa8a74db4c90cf19ce1f28a',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 283,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'b850db2852bbb9c258f1082d2aece66aeeb98e951923f3a1fbb203b9c67b13a8',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 284,
    rule: 'definer-search-path',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: '0367fbd782faa7f126026a993989d45ef6fa63fabb0b23e20af9292beec32e4a',
    reason:
      'ALTER FUNCTION ... OWNER TO workspace_secrets_definer changes ownership only. The CREATE definition in this file pins SECURITY DEFINER with search_path = pg_catalog, pg_temp.',
  },
  {
    path: 'apps/database/supabase/migrations/20261124150200_workspace_secrets_config_vault.sql',
    line: 322,
    rule: 'dynamic-sql-review',
    fileDigest:
      '5d27cfaf2d9fce91d4ad43b532fffe0d48b2731428d8dc7b06e745fb5c5965c2',
    digest: 'ba7eaecf376c961fd68ad7fcf851bb5f33d510873bc016335c654b54f2fc04e1',
    reason:
      'End-of-migration assertion: reads has_function_privilege() and pg_has_role() and raises; format() only builds the error message. No dynamic SQL is executed.',
  },
];
