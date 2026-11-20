// Source-bound findings for the Meet attendance erasure migrations. Each
// applied file is bound to its exact bytes and fixed forward by a later
// migration that restates the complete owner-run definition and ACL.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
    line: 87,
    rule: 'function-acl',
    fileDigest:
      '60f8891173e587485338dd51764834839b2620f47de412d81cb5c692027e4183',
    digest: '7bb5bbacef8d1bfcac050b7fc7e0aa60889b6aad54025cc91b77f1c1060b6f47',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'SECURITY DEFINER helper private.store_meet_attendance_erasure_rooms(text,text,jsonb) with a pinned search_path; REVOKE ALL from PUBLIC, anon, authenticated and service_role follows. Called only by the plan trigger. The internal no-grant marker is added by the fix-forward, which recreates it with the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
    line: 185,
    rule: 'function-acl',
    fileDigest:
      '60f8891173e587485338dd51764834839b2620f47de412d81cb5c692027e4183',
    digest: '49c0d19ac9bb7c3814a060bd264001fa645a03a16727cb40e3d15464de58e90e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'SECURITY DEFINER trigger function private.sync_meet_attendance_erasure_rooms() with a pinned search_path; REVOKE ALL from PUBLIC, anon, authenticated and service_role follows and it is attached only as a trigger. The fix-forward recreates it with the trigger no-grant marker',
  },
  {
    path: 'apps/database/supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
    line: 340,
    rule: 'function-acl',
    fileDigest:
      '60f8891173e587485338dd51764834839b2620f47de412d81cb5c692027e4183',
    digest: 'ec30e0164fa269a3e0c7da6eb9ee501e14f385871e7dd0e0a94e9f6cac6931ae',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120095300_meet_attendance_drop_account_trigger.sql',
    reason:
      'SECURITY DEFINER trigger function private.confirm_meet_attendance_account_erasure() and its auth.users trigger are dropped by the fix-forward, so account deletion never depends on attendance storage',
  },
  {
    path: 'apps/database/supabase/migrations/20261120095800_meet_attendance_erasure_hardening.sql',
    line: 144,
    rule: 'definer-search-path',
    fileDigest:
      '2de90ee42cdb92f503d73b28a4b024e46a6ac9cf193f3a434010e7ef566fb68a',
    digest: '17319c4534412c43a454ae62b2446df813bafef813e73469fb45ec3bbc633fd9',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'ALTER sets SECURITY DEFINER on private.claim_meet_attendance_erasure_rooms(integer,integer), already created with search_path pg_catalog, pg_temp; the fix-forward recreates it with the complete owner-run definition',
  },
  {
    path: 'apps/database/supabase/migrations/20261120095800_meet_attendance_erasure_hardening.sql',
    line: 144,
    rule: 'function-acl',
    fileDigest:
      '2de90ee42cdb92f503d73b28a4b024e46a6ac9cf193f3a434010e7ef566fb68a',
    digest: '17319c4534412c43a454ae62b2446df813bafef813e73469fb45ec3bbc633fd9',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'ALTER sets SECURITY DEFINER on private.claim_meet_attendance_erasure_rooms(integer,integer); REVOKE ALL from PUBLIC, anon, authenticated and the service_role grant follow in the same file, and the fix-forward recreates it with the complete ACL block',
  },
  {
    path: 'apps/database/supabase/migrations/20261120095800_meet_attendance_erasure_hardening.sql',
    line: 146,
    rule: 'definer-search-path',
    fileDigest:
      '2de90ee42cdb92f503d73b28a4b024e46a6ac9cf193f3a434010e7ef566fb68a',
    digest: '1bc256b3ceb991cf6a46e425fe876df7200e2cfcbc862b8acd4f4f3b88c445d0',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'ALTER sets SECURITY DEFINER on private.ack_meet_attendance_erasure_room(text,text,text,bigint,text[]), already created with search_path pg_catalog, pg_temp; the fix-forward recreates it with the complete owner-run definition',
  },
  {
    path: 'apps/database/supabase/migrations/20261120095800_meet_attendance_erasure_hardening.sql',
    line: 146,
    rule: 'function-acl',
    fileDigest:
      '2de90ee42cdb92f503d73b28a4b024e46a6ac9cf193f3a434010e7ef566fb68a',
    digest: '1bc256b3ceb991cf6a46e425fe876df7200e2cfcbc862b8acd4f4f3b88c445d0',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql',
    reason:
      'ALTER sets SECURITY DEFINER on private.ack_meet_attendance_erasure_room(text,text,text,bigint,text[]); REVOKE ALL from PUBLIC, anon, authenticated and the service_role grant follow in the same file, and the fix-forward recreates it with the complete ACL block',
  },
];
