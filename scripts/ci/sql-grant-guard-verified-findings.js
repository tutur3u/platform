// Source-bound security-review findings; separate from historical debt.
// Fill this basename when the separate hardening PR exists; absent means fail closed.
const HARDENING_MIGRATION_FILENAME = 'REPLACE_WITH_HARDENING_MIGRATION.sql';
const requiredMigration =
  'apps/database/supabase/migrations/' + HARDENING_MIGRATION_FILENAME;
module.exports = [
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
    rule: 'function-acl',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: 'e6275239fcb655664f36a3e6bb1a3f067edc9e28e7121777a63eddfbcd8d514a',
    reason:
      'SECURITY DEFINER trigger function with empty pinned search_path; same-file REVOKE ALL FROM public, anon, authenticated at :51; only the no-grant marker is missing',
  },
  {
    path: 'apps/database/supabase/migrations/20261029100400_guard_time_tracking_reference_workspaces.sql',
    line: 65,
    rule: 'function-acl',
    fileDigest:
      'cf3c893b82a77d33a28230d97f53aab81e2de7d6695fb1298aa1669a6c6efe80',
    digest: '8a44a1e690b749db522ebef75a3764f613275b7ad7f9ae229b04826f35dcf3da',
    reason:
      'SECURITY DEFINER trigger function with empty pinned search_path; same-file REVOKE ALL FROM public, anon, authenticated at :107; only the no-grant marker is missing',
  },
  {
    path: 'apps/database/rollbacks/20261029100400_guard_time_tracking_reference_workspaces.rollback.sql',
    line: 17,
    rule: 'definer-search-path',
    fileDigest:
      'a5c615801d5c541014a30d222a6d7fe1b1198d184cd366e50c03e635ddba1f93',
    digest: 'c3787f7d988821b86186f03488b3af6a2e9eaae7dcdc437dab7fc71478fdaed5',
    reason:
      'rollback restores the prior path; superseded by the definer search_path hardening migration; never apply the 100400 rollback after it',
  },
  {
    path: 'apps/database/rollbacks/20261029100400_guard_time_tracking_reference_workspaces.rollback.sql',
    line: 46,
    rule: 'definer-search-path',
    fileDigest:
      'a5c615801d5c541014a30d222a6d7fe1b1198d184cd366e50c03e635ddba1f93',
    digest: '77e4bcfcf985af8eea906b2a69b8ed79b6ba0d6772fc2bea37de43ad80a6fec1',
    reason:
      'rollback restores the prior path; superseded by the definer search_path hardening migration; never apply the 100400 rollback after it',
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
    reason: `definer search_path superseded by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
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
    reason: `definer search_path superseded by ${HARDENING_MIGRATION_FILENAME}; never apply without it`,
  },
];
