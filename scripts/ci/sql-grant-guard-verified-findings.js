// Source-bound security-review findings; separate from historical debt.
// Hardening migration from the separate pin-definer-search-path PR; absent means fail closed.
const HARDENING_MIGRATION_FILENAME =
  '20261030030000_pin_time_tracking_definer_search_path.sql';
const requiredMigration = `apps/database/supabase/migrations/${HARDENING_MIGRATION_FILENAME}`;
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261030110010_workspace_delete_fk_cascade_guard.sql',
    line: 2,
    rule: 'dynamic-sql-review',
    fileDigest:
      'f9427eee7b5bb00b26db83422416b42dd877278d5955fe86d6ba6898c8094535',
    digest: 'd7b8f0b916c414e4be19dc041d1eb64a93e06146ca9ee51f2a069ef3456250cd',
    reason:
      'Reviewed static DO block: pg_catalog index validity lookup and exception only; no EXECUTE, routine creation, grants or caller-controlled SQL. Preserve unchanged migration bytes for PR6977 retiming.',
  },
  {
    path: 'apps/database/supabase/migrations/20261029100310_tighten_legacy_meet_rls.sql',
    line: 56,
    rule: 'function-acl',
    fileDigest:
      '438e27f59fdc6c087c2cf1b55d743f1cb518513369dfcb9b1c43fdcf73a8c91c',
    digest: '7a065fb9182cc1d9c7a53b645ce76889c91b5e127bdbf24ef5c4fd9978b7f857',
    reason:
      'SECURITY INVOKER trigger function; REVOKE ALL FROM public, anon, authenticated at :68; only the no-grant marker is missing',
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 19,
    rule: 'definer-search-path',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: 'e6275239fcb655664f36a3e6bb1a3f067edc9e28e7121777a63eddfbcd8d514a',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 19,
    rule: 'function-acl',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: 'e6275239fcb655664f36a3e6bb1a3f067edc9e28e7121777a63eddfbcd8d514a',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 65,
    rule: 'definer-search-path',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: '8a44a1e690b749db522ebef75a3764f613275b7ad7f9ae229b04826f35dcf3da',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 65,
    rule: 'function-acl',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: '8a44a1e690b749db522ebef75a3764f613275b7ad7f9ae229b04826f35dcf3da',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 122,
    rule: 'definer-search-path',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: '88859475f00c6ddc3ee21edd0a84790ea63599d81bf6c949431bc094e70c4659',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 155,
    rule: 'definer-search-path',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: 'cc52d1e9365dcc065040165bd71a16f0b9eb6d9bad21a9dcf7956f64f01f21cd',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/rollbacks/20261029100400_guard_time_tracking_reference_workspaces.rollback.sql',
    line: 17,
    rule: 'definer-search-path',
    fileDigest:
      'a5c615801d5c541014a30d222a6d7fe1b1198d184cd366e50c03e635ddba1f93',
    digest: 'c3787f7d988821b86186f03488b3af6a2e9eaae7dcdc437dab7fc71478fdaed5',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/rollbacks/20261029100400_guard_time_tracking_reference_workspaces.rollback.sql',
    line: 46,
    rule: 'definer-search-path',
    fileDigest:
      'a5c615801d5c541014a30d222a6d7fe1b1198d184cd366e50c03e635ddba1f93',
    digest: '77e4bcfcf985af8eea906b2a69b8ed79b6ba0d6772fc2bea37de43ad80a6fec1',
    class: 'fixed-forward',
    requiredMigration,
    reason: `fixed forward by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
  {
    path: 'apps/database/supabase/migrations/20261030030000_pin_time_tracking_definer_search_path.sql',
    line: 99,
    rule: 'definer-search-path',
    fileDigest:
      'f9e2e13fd29a0a9533f13fdb8e6b5c4a921840d655901d0c22b999a42c842c84',
    digest: 'a7f5df54e0ff81187b560356f97bd83f270558f73ad0c8e9c98494592c830199',
    reason:
      'ALTER … SET search_path = pg_catalog, pg_temp; security-reviewed in #7281 be1dda26',
  },
  {
    path: 'apps/database/supabase/migrations/20261030030000_pin_time_tracking_definer_search_path.sql',
    line: 108,
    rule: 'definer-search-path',
    fileDigest:
      'f9e2e13fd29a0a9533f13fdb8e6b5c4a921840d655901d0c22b999a42c842c84',
    digest: 'f20204b7d28d9651846e00287dce292eb5da191e6d881bcbf56cba58f1c624e4',
    reason:
      'ALTER … SET search_path = pg_catalog, pg_temp; security-reviewed in #7281 be1dda26',
  },
  {
    path: 'apps/database/supabase/migrations/20261030030000_pin_time_tracking_definer_search_path.sql',
    line: 111,
    rule: 'definer-search-path',
    fileDigest:
      'f9e2e13fd29a0a9533f13fdb8e6b5c4a921840d655901d0c22b999a42c842c84',
    digest: '4995feb93f411e176f6ef6d0f760f807a3b9dc0f003cc5760605fac3555e4c18',
    reason:
      'ALTER … SET search_path = pg_catalog, pg_temp; security-reviewed in #7281 be1dda26',
  },
];
