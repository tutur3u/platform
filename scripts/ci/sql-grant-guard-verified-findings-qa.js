// Source-bound findings for the QA test user migrations. Each merged file is
// bound to its exact bytes; definers are fixed forward by a later migration
// that restates the complete owner-run definition and ACL.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 226,
    rule: 'definer-public',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: 'd4f04b4448db9905e93b28bd9b952337a5b448810826fb4c5c265bd1f82a2cb1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'CREATE OR REPLACE of the existing private.staff_identity_verified(uuid), whose EXECUTE was revoked from PUBLIC, anon, authenticated and service_role in 20261027151470 and is kept by the replacement. The fix-forward recreates it with search_path pg_catalog, pg_temp, the explicit REVOKE ALL and the internal no-grant marker',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 9,
    rule: 'dynamic-sql-review',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: 'ca9d6a666b31419778ad3f760d79ef136b73dc9d308c0ba67e5cc8802c1036e2',
    reason:
      'Reviewed static DO block: refuses the migration while any auth.users row already uses a reserved QA test address or a qa_ app_metadata key. Read-only auth.users query with no EXECUTE, routine creation, grants or caller-controlled SQL; preserve merged bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 114,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '2cced004bae31939558497c26a6bacf7cd2df40bd46105efd06049efde811214',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_marker_matches(jsonb,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 144,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '122bd6796d0947905ad21f32dd402442648c6a768b012916f2080cd87199660f',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.guard_qa_test_auth() with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 197,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '416f9aac8a4ba2b4ebb178676100896e51b3d4fe9feb35faee05954d8a4e509c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.guard_qa_test_privilege() with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 226,
    rule: 'function-acl',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: 'd4f04b4448db9905e93b28bd9b952337a5b448810826fb4c5c265bd1f82a2cb1',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'private.staff_identity_verified(uuid) is called only by postgres-owned definer staff gates and has no client or service grant. The fix-forward recreates it with the explicit REVOKE ALL and the internal no-grant marker',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 277,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '3ffe3691e233f7eebb175391f1d435333d6e080780731681c34de265e471119a',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_grant_tier(text,uuid,uuid,workspace_product_tier) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 303,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: 'dbdd4bf42e7fb8f8f33f196328cf90186b6bce232c9c1f68ae15d5fc6312685b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_reserve_users(uuid,text,text,integer,integer,boolean,text,boolean) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 380,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: 'c863891b83a908d959bf12bd3fffe81b6c345c541dc3c881d24ec315d2f0b8ba',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_activate_user(uuid,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 437,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '3a921940a2c926a87b7081aa6c1d868909844eeeab7634d06c0aaa49909fe8d2',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_record_session(uuid,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 464,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '95121612bc698416c4034cf9d2a4b0ba95e872b0da7abfd933b940c23b910a38',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_begin_delete(uuid,text,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 521,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '9159169ec27eb859085e42e8473e7931f042385f60ad669fd38c6b1021c14fc5',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_finish_delete(uuid,text,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 549,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '6ce34b39b135af568f7d4ff6dc8ff57713d37029607dee6026742311d33d7fe5',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_finish_workspace_delete(text,text,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 575,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '95ab9dac0bf3c597a18676daf271b6fac4927acee8c2b530c0b95a7f589c9471',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_list_expired(integer) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120194100_qa_test_users.sql',
    line: 599,
    rule: 'definer-search-path',
    fileDigest:
      'cc6be35ce063c03e2f425568439313627aabfa0e425b1489a190618525b3c106',
    digest: '6c127250740d4596d9ca11da789220c7aa059cc49a214a9b94a64eb053fc7c22',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_list_users(text,boolean) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120200000_restrict_staff_identity_verifier_execute.sql',
    line: 9,
    rule: 'function-acl',
    fileDigest:
      'ea345f798ce1984ab8251d640c59b26204b162bad49390fa320740ec111efd8a',
    digest: '654a4eeecc7b9a3ec42ac377aef39f6cac7cc3a65163ae7e0a04461507150a23',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'private.staff_identity_verified(uuid) is called only by postgres-owned definer staff gates and has no client or service grant. The fix-forward recreates it with the explicit REVOKE ALL and the internal no-grant marker',
  },
  {
    path: 'apps/database/supabase/migrations/20261120221500_qa_test_user_cleanup_fence.sql',
    line: 9,
    rule: 'definer-search-path',
    fileDigest:
      'e08ebc64b594958cb85f682e274f2e5d0a01609c1a9f3765f30deb413b11b4b0',
    digest: 'de08810f1cf938effd34b000c12e5e4ae9a5f2400f70be26c7a3ffd858738523',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120225500_pin_qa_test_user_definers.sql',
    reason:
      'SECURITY DEFINER QA test user routine private.qa_test_begin_delete(uuid,text,uuid) with search_path empty and only schema-qualified references; the ACL follows in the same file. The fix-forward recreates it with search_path pg_catalog, pg_temp and the complete ACL block',
  },
];
