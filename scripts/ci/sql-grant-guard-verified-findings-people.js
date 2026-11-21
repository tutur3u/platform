// Source-bound findings for the people registry foundation migrations.
// Their DO blocks applied the intended ACLs; 20261121151500 and 20261121151501
// restate them as static statements. The guard reports a DO block twice on one
// line (statement and routine body), so those records appear twice.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261121140000_people_registry_schema.sql',
    line: 349,
    rule: 'dynamic-sql-review',
    fileDigest:
      'cf600510347289c7ee452ac916850d7b0efbc057bf497e90d7461b6b85d07369',
    digest: 'b82dda1e54a52813b6d9800d4f8a819d9e5805cafb2606535d51bb9eaa661671',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block iterates a literal array of registry table names and formats them with %I into ALTER TABLE ENABLE ROW LEVEL SECURITY, REVOKE ALL from PUBLIC, anon, authenticated and service_role, GRANT to people_registry_definer and CREATE POLICY ... TO people_registry_definer. No caller input reaches it and no client or service role gains a privilege.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140000_people_registry_schema.sql',
    line: 349,
    rule: 'dynamic-sql-review',
    fileDigest:
      'cf600510347289c7ee452ac916850d7b0efbc057bf497e90d7461b6b85d07369',
    digest: 'b82dda1e54a52813b6d9800d4f8a819d9e5805cafb2606535d51bb9eaa661671',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block iterates a literal array of registry table names and formats them with %I into ALTER TABLE ENABLE ROW LEVEL SECURITY, REVOKE ALL from PUBLIC, anon, authenticated and service_role, GRANT to people_registry_definer and CREATE POLICY ... TO people_registry_definer. No caller input reaches it and no client or service role gains a privilege.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140000_people_registry_schema.sql',
    line: 10,
    rule: 'rollback-safety',
    fileDigest:
      'cf600510347289c7ee452ac916850d7b0efbc057bf497e90d7461b6b85d07369',
    digest: 'ff5f0ac05f93b8ba1132380b98427fee96a5eb80a23cfb36da7b9afda0e4ce7b',
    reason:
      'people_registry_definer is NOLOGIN, NOINHERIT and NOBYPASSRLS; granting it to postgres lets migrations transfer routine ownership to it. No API role is a member.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 112,
    rule: 'definer-public',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'c53c88e031b072138e0d6432ff2eaa063cdcc02c0e824f4c8ca26da3c8420791',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 154,
    rule: 'definer-public',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'ff719298b8b058201ab16ff97a694e7138e6cb4fa8b1e90fe6497092dd6bb19e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 181,
    rule: 'definer-public',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'f4c8bdbab6c691d89294fbb68c4623bbfe1dea8594c3d64cf15f4dc3b63a72d7',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 214,
    rule: 'definer-public',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'c19559f5d3ae827876681d472e955fe60da7af3af943c4a2a8767962826c4137',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 259,
    rule: 'definer-public',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '4695900f4e1030d5ff6e8844882478fb02d2879add73a92bc7418fb8753ff00e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 284,
    rule: 'dynamic-sql-review',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '17902abae568067595a084d3bb37419dea2cb176d080ea93bdb547a74456cdef',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 284,
    rule: 'dynamic-sql-review',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '17902abae568067595a084d3bb37419dea2cb176d080ea93bdb547a74456cdef',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 36,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'c3beb0718b77c75e5b5a926a243958d4bc442e56182895e828175da3b0f26f24',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 50,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'f285ff3d19fb1071a64dde2344e4fa4fb1a755e9a51332bcabd67a6b56a5a888',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 69,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '3136c6d5242c1866e84e7537b5e26d63643fb8f12f2686cc4e8bd72e98855735',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 82,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '94d17c02d0eb0e3249a9db7f352eef67c010743bc66df80e33e90e0c29772733',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 112,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'c53c88e031b072138e0d6432ff2eaa063cdcc02c0e824f4c8ca26da3c8420791',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 154,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'ff719298b8b058201ab16ff97a694e7138e6cb4fa8b1e90fe6497092dd6bb19e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 181,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'f4c8bdbab6c691d89294fbb68c4623bbfe1dea8594c3d64cf15f4dc3b63a72d7',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 214,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: 'c19559f5d3ae827876681d472e955fe60da7af3af943c4a2a8767962826c4137',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140002_people_registry_authority.sql',
    line: 259,
    rule: 'function-acl',
    fileDigest:
      'd48e30b3dc64e4a92c395d9b9bc1b99a649b50cffb6acd292e9a2475203b1ebe',
    digest: '4695900f4e1030d5ff6e8844882478fb02d2879add73a92bc7418fb8753ff00e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 75,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '60ea89d59e78837f96fb23ff7dad77ee10eef84d7c283cf8e319b15f51cd99e1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 99,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'e81c5f7d36b4bc012c9f986978d42264642f0d7f6506eab4455270969560c7fd',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 126,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '699c05511cfbfb0d0d7811fcb7f057f8486af477624a3d3069ea18ebc8eaef7a',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 180,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'ce42828d6659cd438ee7b77bc69b19b553dcc3ffe7ead307c4711009dd27da73',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 237,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '2b3762269949cb2be8f303303444adbe80c7d519a1071db7566dd6782910fa41',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 292,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'f3a06cd866221c1debb061cc24748e784efea5388355c8f7ad8a1b6ca757866c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 354,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '7fb703368c78fab04fd8aed68af3275c89f127b53ef5001d6b25b6b1b6ed470c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 414,
    rule: 'definer-public',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '0076fd04c22f1491a7d5e94dd62a428cce0d2c63bc62808e518cf2371d738aed',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 454,
    rule: 'dynamic-sql-review',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '245abb0e0632c55f85cecebde887e17fd3395bda63c7fe04389a225e2b75e613',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 454,
    rule: 'dynamic-sql-review',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '245abb0e0632c55f85cecebde887e17fd3395bda63c7fe04389a225e2b75e613',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 9,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '734c96f74115254f76c60029c5d8c1eca74b57ad9b8aa1488f3cfd054aba50bc',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 41,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '08a3e8170d9b1eac3572f0ba10e46826e2021baf4591751386703cae197ea64d',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 62,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '89ee058bebbe964215d9ef7e7d0ca668311ccd6a48529d2c95be00e1cbb968b3',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 75,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '60ea89d59e78837f96fb23ff7dad77ee10eef84d7c283cf8e319b15f51cd99e1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 99,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'e81c5f7d36b4bc012c9f986978d42264642f0d7f6506eab4455270969560c7fd',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 126,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '699c05511cfbfb0d0d7811fcb7f057f8486af477624a3d3069ea18ebc8eaef7a',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 180,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'ce42828d6659cd438ee7b77bc69b19b553dcc3ffe7ead307c4711009dd27da73',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 237,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '2b3762269949cb2be8f303303444adbe80c7d519a1071db7566dd6782910fa41',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 292,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: 'f3a06cd866221c1debb061cc24748e784efea5388355c8f7ad8a1b6ca757866c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 354,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '7fb703368c78fab04fd8aed68af3275c89f127b53ef5001d6b25b6b1b6ed470c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140003_people_registry_records.sql',
    line: 414,
    rule: 'function-acl',
    fileDigest:
      'd98c35f7c6d7d7ad9598a76c6efdb08b62c1a12015f606591254c59f4e7f97c4',
    digest: '0076fd04c22f1491a7d5e94dd62a428cce0d2c63bc62808e518cf2371d738aed',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151501_restate_people_registry_record_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 10,
    rule: 'definer-public',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: 'adad747d1100e9562cefc07c40e17a71360acc965396891fb26942abde403139',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 50,
    rule: 'definer-public',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: 'a5c861993017f9abc5cbd25db8fab6c13b31072b7cdba8372396fae597cd7e8f',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 82,
    rule: 'definer-public',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '89dccec6cb97b6b65483b55490d093a35732abed797c498abf4a4562e26ac6d1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 101,
    rule: 'definer-public',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '90cb83f18c991bdc1b29c2508675225a802df8c33e9c1ad24c74d34f423b5ab0',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 138,
    rule: 'definer-public',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '7716d3a7829d13f4b9e4ff73e2eb5de4b0ecfa63e52a8630c95e8046120b653c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes EXECUTE from PUBLIC, anon, authenticated and service_role by exact signature; the follow-up restates the definition and revokes statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 208,
    rule: 'dynamic-sql-review',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '7847e2d5973cb10ada682c3332f02e8c395c900db898d0209e0a4819991c0e6b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 208,
    rule: 'dynamic-sql-review',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '7847e2d5973cb10ada682c3332f02e8c395c900db898d0209e0a4819991c0e6b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The DO block formats only fixed signature and table names from a literal array into ALTER OWNER, REVOKE, GRANT and CREATE POLICY statements; no input reaches it. The follow-up restates the routine ACLs statically.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 10,
    rule: 'function-acl',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: 'adad747d1100e9562cefc07c40e17a71360acc965396891fb26942abde403139',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 50,
    rule: 'function-acl',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: 'a5c861993017f9abc5cbd25db8fab6c13b31072b7cdba8372396fae597cd7e8f',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 82,
    rule: 'function-acl',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '89dccec6cb97b6b65483b55490d093a35732abed797c498abf4a4562e26ac6d1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 101,
    rule: 'function-acl',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '90cb83f18c991bdc1b29c2508675225a802df8c33e9c1ad24c74d34f423b5ab0',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140004_people_registry_lifecycle.sql',
    line: 138,
    rule: 'function-acl',
    fileDigest:
      '959147bc5f502ddcf6625604ff7b0368c76c1afbf83b5a8948ef535eb7aecee4',
    digest: '7716d3a7829d13f4b9e4ff73e2eb5de4b0ecfa63e52a8630c95e8046120b653c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151500_restate_people_registry_acls.sql',
    reason:
      'The defining DO block revokes all client ACLs and grants only service_role (or none for internal helpers); the follow-up restates the same end state as static per-signature statements.',
  },
];
