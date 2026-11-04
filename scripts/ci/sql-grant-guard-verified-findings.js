// Source-bound security-review findings; separate from historical debt.
// Hardening migration from the separate pin-definer-search-path PR; absent means fail closed.
const HARDENING_MIGRATION_FILENAME =
  '20261030030000_pin_time_tracking_definer_search_path.sql';
const requiredMigration = `apps/database/supabase/migrations/${HARDENING_MIGRATION_FILENAME}`;
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261030112010_workspace_delete_fk_cascade_guard.sql',
    line: 2,
    rule: 'dynamic-sql-review',
    fileDigest:
      '47ee75196fd67e301bd939552bcd2f40ba062008648f3377c03b41dc0c184928',
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
  {
    path: 'apps/database/rollbacks/20261030113003_workspace_storage_limit_execute.rollback.sql',
    line: 2,
    rule: 'rollback-safety',
    fileDigest:
      'b9c954fe54378e9d6699ec0a7183c0773545abb6aef26a3dfd32ec08e25d1b4a',
    digest: 'b9c954fe54378e9d6699ec0a7183c0773545abb6aef26a3dfd32ec08e25d1b4a',
    reason:
      'Paired restore of the pre-migration anon EXECUTE ACL for the storage limit RPC. Forward access is authenticated/service-role only.',
  },
  {
    path: 'apps/database/rollbacks/20261030130000_bind_external_project_helpers_to_caller.rollback.sql',
    line: 7,
    rule: 'definer-search-path',
    fileDigest:
      '5cdcf58caaa908c5bfb1df38f7e62deb1c73180038b7e2db597bf6028f9d7365',
    digest: '3d7f6646401dbcbd3ea593414f5a82c89a35e29fa8bd5dff75e066cfcf1e7414',
    class: 'rollback',
    reason:
      'rollback of 20261030130000_bind_external_project_helpers_to_caller.sql; restores the body from 20260401190000_external_project_studio.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130000_bind_external_project_helpers_to_caller.rollback.sql',
    line: 39,
    rule: 'definer-search-path',
    fileDigest:
      '5cdcf58caaa908c5bfb1df38f7e62deb1c73180038b7e2db597bf6028f9d7365',
    digest: '8aa0eef31023c95e16bd490f2b3b0319e2a1ef79ba8c04d9a2531c1bdec77740',
    class: 'rollback',
    reason:
      'rollback of 20261030130000_bind_external_project_helpers_to_caller.sql; restores the body from 20260401190000_external_project_studio.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130000_bind_external_project_helpers_to_caller.rollback.sql',
    line: 71,
    rule: 'definer-search-path',
    fileDigest:
      '5cdcf58caaa908c5bfb1df38f7e62deb1c73180038b7e2db597bf6028f9d7365',
    digest: '9d3cecf4d62dcef4b34b4fc8e4f0fe418ad5c3d48979422c52f70bcd85a802a3',
    class: 'rollback',
    reason:
      'rollback of 20261030130000_bind_external_project_helpers_to_caller.sql; restores the body from 20260401190000_external_project_studio.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 7,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '0baba19b16c6b59197c60a65660be4c177f4f2632e556de9cde0af9434a302fe',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20250813082227_add_personal_workspace.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 23,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '5122e5aa9fc45b91b68d3f3735fe532187af137bd8481f6ccb293c3be804871d',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20240501095759_remote_schema.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 37,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '694dd656e0deb227dbeee81055c05797f00e10e271660ad506d9f5e7114e60c8',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20251003144301_create_realtime_chat_tables.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 52,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: 'adf23aef3bf9db3a91ec6f1bc62862367876f9ef9ca20a80978b223b4f968146',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20260510143500_add_hive_research_engine.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 67,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: 'aca011783228513723e23422661d7e0720bf81a2659fec88855753d6d150d5b0',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20260510143500_add_hive_research_engine.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 83,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '63ff18c739773ad1094b4bf8b69db10f9550885fbe36ff938f9acba853e4f6af',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20260210110000_auto_create_personal_workspaces.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 105,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '6a4c37899826e8620fd15d28e723c6277f2529bc7db3a73734ff08e0da8ef71e',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20251017171252_remove_workspace_creation_limits.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 119,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '949208dfe28c3193ae91c2a11f57de5210c9cf39279e38ccdfed2a1199b549cd',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20250813082227_add_personal_workspace.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 133,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: 'bb0f95e4527b94567be546e0c3a0b91733107de9114c9b5a9e93d95f1d96c60f',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20260622090000_add_shareable_task_plans.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 153,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: '9d9e966153e72d68e9b343ecc25d450965a232749adf5677be2b1699a5bc56d9',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20261024023000_harden_definer_function_grants.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030130100_bind_remaining_membership_helpers.rollback.sql',
    line: 155,
    rule: 'definer-search-path',
    fileDigest:
      '10ec9ce8f422432294cca4c667afc443266b2fdcf5c73cf6ec88de8a7dbe2f24',
    digest: 'f7a6e8bd27010862e4f6568ddad668b77941c337467cce8b5693ae463019c852',
    class: 'rollback',
    reason:
      'rollback of 20261030130100_bind_remaining_membership_helpers.sql; restores the body from 20261024023000_harden_definer_function_grants.sql; apply only with the matching forward fix ready',
  },
  {
    path: 'apps/database/rollbacks/20261030131100_apply_creator_grant_checks_to_name_based_role_paths.rollback.sql',
    line: 7,
    rule: 'definer-search-path',
    fileDigest:
      '78f06be2ac2a970d7fc71e118b3ac1fe5ab5a9eaf4eef494f1b1349d5842c945',
    digest: '8ccffc52e881bb23b4089733caa64e2c7f4544b154590362491002e19e38ee76',
    class: 'rollback',
    reason:
      'rollback of 20261030131100_apply_creator_grant_checks_to_name_based_role_paths.sql; restores the body from 20260722111411_inventory_pos_operator_roles.sql; apply only with the matching forward fix ready',
  },
];
