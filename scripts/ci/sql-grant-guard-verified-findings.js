// Source-bound security-review findings; separate from historical debt.
// Hardening migration from the separate pin-definer-search-path PR; absent means fail closed.
const HARDENING_MIGRATION_FILENAME =
  '20261030030000_pin_time_tracking_definer_search_path.sql';
const requiredMigration = `apps/database/supabase/migrations/${HARDENING_MIGRATION_FILENAME}`;
module.exports = [
  ...require('./sql-grant-guard-verified-findings-meet'),
  ...require('./sql-grant-guard-verified-findings-qa'),
  ...require('./sql-grant-guard-verified-findings-push'),
  ...require('./sql-grant-guard-verified-findings-people'),
  ...require('./sql-grant-guard-verified-findings-fleet'),
  ...require('./sql-grant-guard-verified-findings-vault'),
  {
    path: 'apps/database/supabase/migrations/20261121091000_add_task_fleet_fields.sql',
    line: 45,
    rule: 'function-acl',
    fileDigest:
      '7e143c9839102cb17dcf898c344ea4a2ad7c1fb944c993c7a610895ed2de49b4',
    digest: 'bb8d6ff19a504965db1d829f6012fc58e152980870adaf739ef1f4a54f3e5e1b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121095911_restrict_task_fleet_function_execute.sql',
    reason:
      'The follow-up revokes direct EXECUTE from PUBLIC and all API roles. The task row trigger is the only caller.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121091000_add_task_fleet_fields.sql',
    line: 64,
    rule: 'function-acl',
    fileDigest:
      '7e143c9839102cb17dcf898c344ea4a2ad7c1fb944c993c7a610895ed2de49b4',
    digest: 'b3bfc992c001a89f7017c288f60face5fce677dbe7ea6a06da4243d503b467ac',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121095911_restrict_task_fleet_function_execute.sql',
    reason:
      'The follow-up revokes the default and client ACLs and explicitly restores authenticated and service-role EXECUTE on the SECURITY INVOKER RPC.',
  },
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
  {
    path: 'apps/database/supabase/migrations/20261109180000_guard_legacy_cross_app_token_uuid.sql',
    line: 1,
    rule: 'definer-public',
    fileDigest:
      '519ceb35caf61da65898895fb208cbf1e3b115a3d91263fdd9d671a331fbbc31',
    digest: '8e56a8c131891176f26c3a880d3090cbef8212269a5694ca0c38016a8d5b1ad4',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql',
    reason:
      'fixed forward by apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql; explicit exact-signature PUBLIC/anon revoke in reviewed same-body replacement; SOURCE https://github.com/tutur3u/platform/pull/7896#pullrequestreview-5821992165; preserve applied180000; never apply without the reviewed forward migration',
  },
  {
    path: 'apps/database/supabase/migrations/20261109180000_guard_legacy_cross_app_token_uuid.sql',
    line: 1,
    rule: 'function-acl',
    fileDigest:
      '519ceb35caf61da65898895fb208cbf1e3b115a3d91263fdd9d671a331fbbc31',
    digest: '8e56a8c131891176f26c3a880d3090cbef8212269a5694ca0c38016a8d5b1ad4',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql',
    reason:
      'fixed forward by apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql; explicit exact-signature revoke/regrant retaining only authenticated/service_role with the reviewed client signature; SOURCE https://github.com/tutur3u/platform/pull/7896#pullrequestreview-5821992165; preserve applied180000; never apply without the reviewed forward migration',
  },
  {
    path: 'apps/database/supabase/migrations/20261109180000_guard_legacy_cross_app_token_uuid.sql',
    line: 1,
    rule: 'definer-search-path',
    fileDigest:
      '519ceb35caf61da65898895fb208cbf1e3b115a3d91263fdd9d671a331fbbc31',
    digest: '8e56a8c131891176f26c3a880d3090cbef8212269a5694ca0c38016a8d5b1ad4',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql',
    reason:
      'fixed forward by apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql; pg_catalog first and pg_temp last, with all unchanged body references explicitly qualified; SOURCE https://github.com/tutur3u/platform/pull/7896#pullrequestreview-5821992165; preserve applied180000; never apply without the reviewed forward migration',
  },
  {
    path: 'apps/database/supabase/migrations/20261109190002_platform_feature_flag_state_audit.sql',
    line: 11,
    rule: 'function-acl',
    fileDigest:
      '81c472b99da8f8427d53747a1a2ef818daf650e9867df1e31d12fd0cae1a3e9c',
    digest: 'a77f18aa697b68ba39f7eae1696d7b3f3c8cb93a799b7afa1e406a49bf7bbd0f',
    reason:
      'SECURITY INVOKER immutable SQL helper private.platform_feature_flag_family(text); the REVOKE ALL at :77 removes PUBLIC, anon, authenticated and service_role and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve merged 20261109190002 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261109190002_platform_feature_flag_state_audit.sql',
    line: 155,
    rule: 'function-acl',
    fileDigest:
      '81c472b99da8f8427d53747a1a2ef818daf650e9867df1e31d12fd0cae1a3e9c',
    digest: 'f2e70209e358313df33a76ed285e0938e7e32d05555dd83f65a1fabb0704c536',
    reason:
      'SECURITY INVOKER trigger function private.platform_feature_flag_reject_direct_write(); the REVOKE ALL at :173 removes PUBLIC, anon, authenticated and service_role and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve merged 20261109190002 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261109190002_platform_feature_flag_state_audit.sql',
    line: 180,
    rule: 'function-acl',
    fileDigest:
      '81c472b99da8f8427d53747a1a2ef818daf650e9867df1e31d12fd0cae1a3e9c',
    digest: '3c0bd4bbadf02e0ce83605de0fd0625a622a1bb2b1bbaf00b17c649c28fc17aa',
    reason:
      'SECURITY INVOKER trigger function private.platform_feature_flag_reject_audit_change(); the REVOKE ALL at :190 removes PUBLIC, anon, authenticated and service_role and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve merged 20261109190002 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261109190002_platform_feature_flag_state_audit.sql',
    line: 197,
    rule: 'function-acl',
    fileDigest:
      '81c472b99da8f8427d53747a1a2ef818daf650e9867df1e31d12fd0cae1a3e9c',
    digest: '37a160686fff7d04b759be73b86e6f81db9e7b25d1647b0d0e901b3f6d1cac8e',
    reason:
      'SECURITY DEFINER internal helper with search_path pg_catalog, pg_temp, called only from the reviewed private mutate/read functions private.platform_feature_flag_require_permission(uuid,text); the REVOKE ALL at :221 removes PUBLIC, anon, authenticated and service_role and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve merged 20261109190002 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261117063000_mail_contacts_sender_blocks.sql',
    line: 123,
    rule: 'function-acl',
    fileDigest:
      '802d92c0d6227acd3def70fb5658af81c93237f6beaa3d436a705646597ddab2',
    digest: '7c506f9299a18d04830a93d73d60ae1a3a876a96815bf52962734bdf5a332949',
    reason:
      'SECURITY INVOKER trigger function public.guard_workspace_user_mail_blocked() with search_path empty, attached only by the BEFORE INSERT OR UPDATE OF mail_blocked trigger on public.workspace_users; the REVOKE ALL at :140 removes PUBLIC, anon and authenticated and no later statement grants it; a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve merged 20261117063000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118043000_bind_metered_settlement_to_reserved_balance.sql',
    line: 2,
    rule: 'function-acl',
    fileDigest:
      '4f23e346c57719e3dd8fe31a2bb47b0885f8ed07df5517e3c3eb10eb330d2469',
    digest: '1930aff48a68010934edeea72845f15e699f3df6adc64a620147327b63229e70',
    reason:
      'SECURITY INVOKER internal helper private.deduct_ai_credits_from_balance(uuid,uuid,text,integer,integer,integer,text,uuid,uuid,jsonb,uuid,integer,integer) with search_path pg_catalog, pg_temp, called only from the reviewed definers public.deduct_ai_credits and public.settle_metered_ai_credit_reservation in the same file; the REVOKE ALL at :158 removes PUBLIC, anon, authenticated and service_role and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve staging-applied 20261118043000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118043000_bind_metered_settlement_to_reserved_balance.sql',
    line: 207,
    rule: 'function-acl',
    fileDigest:
      '4f23e346c57719e3dd8fe31a2bb47b0885f8ed07df5517e3c3eb10eb330d2469',
    digest: 'cfdc479ba1f638a3bc54361108aeb6d497daee44a6c2240e234eff9c0e994e11',
    reason:
      'SECURITY DEFINER public.settle_metered_ai_credit_reservation(uuid,integer,integer,integer,jsonb) with search_path pg_catalog, pg_temp; the REVOKE EXECUTE at :397 removes PUBLIC, anon and authenticated (EXECUTE is the only routine privilege, so it is equivalent to REVOKE ALL) and the GRANT at :401 gives execute only to service_role; only the REVOKE ALL spelling is missing; preserve staging-applied 20261118043000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118121100_usage_admission_controls.sql',
    line: 18,
    rule: 'function-acl',
    fileDigest:
      'c7db0bf10074b0bfb4c16673d1cb76731e8d54f158f67b3624021c31589d362e',
    digest: 'a3e63b7fab060a6c6f8df6f2910303387d9fdc3b906dceb8f9f4dfca879ddb73',
    reason:
      'SECURITY INVOKER trigger function private.check_usage_admission() with search_path pg_catalog, pg_temp, attached only by the BEFORE INSERT usage_admission_fence trigger on private.usage_holds; the REVOKE ALL at :37 removes PUBLIC, anon, authenticated and service_role and no later statement grants it; a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve staging-applied 20261118121100 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118121500_usage_finance_postings.sql',
    line: 56,
    rule: 'function-acl',
    fileDigest:
      '1dcdce58a56f985cb45343cc02251cad4ce62d470c7770a8bdc25efd042b5c10',
    digest: '3cea3696825d4f82c1df1a03c26fac96c44b1e80af6174fb03946aaae31f5844',
    reason:
      'SECURITY DEFINER trigger function private.post_new_usage_invoice() with search_path pg_catalog, pg_temp, attached only by the AFTER INSERT post_new_usage_invoice trigger on private.external_provider_invoices for the root workspace; the REVOKE ALL at :62 removes PUBLIC, anon, authenticated and service_role and no later statement grants it; a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve staging-applied 20261118121500 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118191500_create_citation_library.sql',
    line: 1,
    rule: 'function-acl',
    fileDigest:
      '3fa8714ac7a354bc51b5b0466ccfb224b234075023e6c0cee2d53605910d0909',
    digest: '1abf9ffc62eacd366fcba294fd3805e468ef8c0a54cb5a31931c646b20bf7bca',
    reason:
      'SECURITY INVOKER immutable helper private.citation_library_tags_valid(text[]) with search_path pg_catalog, pg_temp, used only by the table check constraint and the reviewed library RPCs in the same file; the multi-signature REVOKE ALL at :249-253 removes PUBLIC, anon, authenticated and service_role from it and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve staging-applied 20261118191500 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118191500_create_citation_library.sql',
    line: 22,
    rule: 'function-acl',
    fileDigest:
      '3fa8714ac7a354bc51b5b0466ccfb224b234075023e6c0cee2d53605910d0909',
    digest: '6876bfdece14ae5c1610dca64b9dbdf0c87bab84a0bfe532e455aa82cb2ba63b',
    reason:
      'SECURITY INVOKER immutable helper private.citation_library_search_text(jsonb,text[]) with search_path pg_catalog, pg_temp, used only by the trigram search index and the reviewed list RPC in the same file; the multi-signature REVOKE ALL at :249-253 removes PUBLIC, anon, authenticated and service_role from it and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve staging-applied 20261118191500 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261118191500_create_citation_library.sql',
    line: 101,
    rule: 'function-acl',
    fileDigest:
      '3fa8714ac7a354bc51b5b0466ccfb224b234075023e6c0cee2d53605910d0909',
    digest: '9ddbd0556d3dd2fbccb9573013c38b9e9c8e01084993a05a3b01d338568dda77',
    reason:
      'SECURITY INVOKER internal helper private.require_citation_library_access(uuid,uuid) with search_path pg_catalog, pg_temp, called only from the reviewed service_role-only definer RPCs in the same file; the multi-signature REVOKE ALL at :249-253 removes PUBLIC, anon, authenticated and service_role from it and no later statement grants it, so it ends with no client or service grant; only the no-grant marker is missing; preserve staging-applied 20261118191500 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
    line: 5,
    rule: 'function-acl',
    fileDigest:
      'e27409538d3f8e53a93e597164bbd9fc2ad42d9f3dfeb13a6aa3bb2147d5fab4',
    digest: '5759fc65f6e9b4d0fe6cfaf80319e7093e72fec799ac4b1499884bece21addcb',
    reason:
      'SECURITY DEFINER trigger function private.stamp_mail_notification_consumption() with search_path pg_catalog, pg_temp, attached only by the BEFORE INSERT OR UPDATE stamp_mail_notification_consumption trigger on private.mail_message_user_state; the REVOKE ALL at :16 removes PUBLIC, anon and authenticated and no later statement grants it, so a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve staging-applied 20261119003000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
    line: 22,
    rule: 'function-acl',
    fileDigest:
      'e27409538d3f8e53a93e597164bbd9fc2ad42d9f3dfeb13a6aa3bb2147d5fab4',
    digest: '204b348f9e4bd5a358c1dd2b35cf7ccd68f2c086214b09477e85bc4279860040',
    reason:
      'SECURITY DEFINER trigger function private.reconcile_mail_read_notifications() with search_path pg_catalog, pg_temp, attached only by the AFTER INSERT OR UPDATE reconcile_mail_read_notifications trigger on private.mail_message_user_state; the REVOKE ALL at :38 removes PUBLIC, anon and authenticated and no later statement grants it, so a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve staging-applied 20261119003000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
    line: 47,
    rule: 'function-acl',
    fileDigest:
      'e27409538d3f8e53a93e597164bbd9fc2ad42d9f3dfeb13a6aa3bb2147d5fab4',
    digest: 'd495e8b995e5dcae0c93ea3a387a5d55a74b45528c831e9b8ac3228c6f8b24ac',
    reason:
      'SECURITY DEFINER trigger function private.apply_mail_read_state_to_notification() with search_path pg_catalog, pg_temp, attached only by the BEFORE INSERT apply_mail_read_state_to_notification trigger on public.notifications; the REVOKE ALL at :65 removes PUBLIC, anon and authenticated and no later statement grants it, so a direct call fails because trigger functions run only as triggers; only the no-grant marker is missing; preserve staging-applied 20261119003000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261119003000_reconcile_mail_notification_reads.sql',
    line: 75,
    rule: 'dynamic-sql-review',
    fileDigest:
      'e27409538d3f8e53a93e597164bbd9fc2ad42d9f3dfeb13a6aa3bb2147d5fab4',
    digest: '721d5f2542f04b3d72ab6b3a225b4bdc85ed26416983fdef777537b34f2d7a6c',
    reason:
      'Reviewed static bounded DO block: one capped repair of notifications already consumed in Mail state, with a 50000-row guard; no EXECUTE, routine creation, grants or caller-controlled SQL; preserve staging-applied 20261119003000 bytes',
  },
  {
    path: 'apps/database/supabase/migrations/20261120015000_meet_attendance_workspace_retention.sql',
    line: 7,
    rule: 'function-acl',
    fileDigest:
      'c27fd01b36e0aa95bcb6fd2e178a22c53b57c23a04b691af7124945107b4352d',
    digest: '331d3bd30c5ff38765b0db0207f9c9744949eee2d7e0e9c0b7417dcead1ed54e',
    reason:
      'SECURITY INVOKER trigger private.meet_attendance_reject_workspace_move() rejects moving an attendance interval to a different workspace. REVOKE ALL at line 22 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120020700_wallet_checkpoint_review.sql',
    line: 7,
    rule: 'function-acl',
    fileDigest:
      '78480f97d8e1e35e5835aeaa7dca45800976c3fd0305bb02ccf7ffe69760a198',
    digest: 'c8926b1c57f2081477482a4691ae0d9429b8ae8475de6a99735a35727637c5c8',
    reason:
      'SECURITY INVOKER trigger private.invalidate_wallet_checkpoint_review() invalidates a saved review if the wallet, balance or checkpoint changes. REVOKE ALL at line 23 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120025200_meet_attendance_meeting_fence.sql',
    line: 7,
    rule: 'function-acl',
    fileDigest:
      '347da58bb3539759f62172cb2f0d040ae556db5ea9aeea9f4939bd2ae55e591c',
    digest: '194644af907b6821a7dee626b529e170aceff5e1ce0bad01d0aa73693616912e',
    reason:
      'SECURITY INVOKER trigger private.meet_attendance_reject_meeting_move() rejects moving an attendance interval to another meeting. REVOKE ALL at line 22 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120031300_education_learner_progress.sql',
    line: 75,
    rule: 'function-acl',
    fileDigest:
      'a8ce39411bc5a28eca284189e613d355a16e42780c387d9b6f2fdbea4000a393',
    digest: '5e70b39126fe047e06449fca5f6f14c03d415b0f1e69c954b91941ed3169e37a',
    reason:
      'SECURITY INVOKER trigger private.enforce_education_learner_quiz_attempt_scope() validates quiz-attempt scope before writes. REVOKE ALL at line 232 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120031300_education_learner_progress.sql',
    line: 99,
    rule: 'function-acl',
    fileDigest:
      'a8ce39411bc5a28eca284189e613d355a16e42780c387d9b6f2fdbea4000a393',
    digest: 'dbf78a3db404c497a651914f4fdc7a9a8a674640c0f06551527f9f7c35df7726',
    reason:
      'SECURITY INVOKER trigger private.enforce_education_learner_answer_scope() validates quiz-answer scope before writes. REVOKE ALL at line 233 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120031300_education_learner_progress.sql',
    line: 124,
    rule: 'function-acl',
    fileDigest:
      'a8ce39411bc5a28eca284189e613d355a16e42780c387d9b6f2fdbea4000a393',
    digest: 'ee88e82c6f9cb51a1881ccc8b7367ebb4e8604dae0c66307fba4c59a6014a382',
    reason:
      'SECURITY INVOKER trigger private.enforce_education_learner_module_progress_scope() validates module-progress scope before writes. REVOKE ALL at line 234 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120031301_workspace_documents_owner_and_updated_at.sql',
    line: 22,
    rule: 'function-acl',
    fileDigest:
      'e2ab6fbc21bd9792b14314648e3bb1343fbe77e01c44a4982ac255cb635f65e8',
    digest: 'f88f1d26137195858b45a2ab3f55c4ae0cd16161bf01de89f493f306448cb291',
    reason:
      'SECURITY INVOKER trigger private.workspace_documents_touch_updated_at() sets the document update timestamp on writes. REVOKE ALL at line 41 removes PUBLIC, anon and authenticated. The routine is attached as a trigger, cannot be called directly and has no later grant in the migration history. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120051322_workspace_documents_owner_attribution.sql',
    line: 8,
    rule: 'function-acl',
    fileDigest:
      '3268e9f2b910dd9fc4b16367745aea0b0ec4ef127078e98ab553f7a0e1acb3fc',
    digest: 'e9ae2918284ae90f36251bd51f70f1c276f49fe0460c4eb9682eef0eb80c8246',
    reason:
      'SECURITY INVOKER trigger private.workspace_documents_assign_owner() assigns owner attribution and rejects owner changes during document writes. The same-file REVOKE ALL at line 41 removes PUBLIC, anon and authenticated; the function requires trigger context and has no later grant. The trigger-only annotation is missing.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120015000_meet_attendance_workspace_retention.sql',
    line: 58,
    rule: 'dynamic-sql-review',
    fileDigest:
      'c27fd01b36e0aa95bcb6fd2e178a22c53b57c23a04b691af7124945107b4352d',
    digest: 'dd7be776c53bf721008d6692b77060992f7a399787d799366d6368c1157a5f03',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120055902_retire_meet_attendance_pg_cron.sql',
    reason:
      'The published DO block schedules a fixed job with constant command text. The forward migration removes the job, and the schedule ownership guard requires the exact retirement migration bytes.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120060435_education_learner_attempt_submit.sql',
    line: 24,
    rule: 'function-acl',
    fileDigest:
      'a0a122567bb21f1234c684e96fcd549a6d8d00443e8f863f90b1941535145344',
    digest: 'cf29a2d268120bf4798f6ced00f1bfa352593ef5680f5acd74373ad811208e2c',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120064112_restate_education_learner_attempt_acl.sql',
    reason:
      'fixed forward by 20261120064112_restate_education_learner_attempt_acl.sql; private.education_learner_course_quiz_links is an internal helper called only from submit_education_learner_attempt. The applied file already revokes PUBLIC, anon, authenticated and service_role. The forward migration restates that revoke and does not grant the helper.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120060435_education_learner_attempt_submit.sql',
    line: 58,
    rule: 'function-acl',
    fileDigest:
      'a0a122567bb21f1234c684e96fcd549a6d8d00443e8f863f90b1941535145344',
    digest: 'f1fb060410104cc0dc27750ecdcc6e94489aa512be7bfdd83a4ccd029b8351f6',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120064112_restate_education_learner_attempt_acl.sql',
    reason:
      'fixed forward by 20261120064112_restate_education_learner_attempt_acl.sql; private.education_learner_completed_modules is an internal helper called only from submit_education_learner_attempt. The applied file already revokes PUBLIC, anon, authenticated and service_role. The forward migration restates that revoke and does not grant the helper.',
  },
  {
    path: 'apps/database/supabase/migrations/20261120060435_education_learner_attempt_submit.sql',
    line: 86,
    rule: 'function-acl',
    fileDigest:
      'a0a122567bb21f1234c684e96fcd549a6d8d00443e8f863f90b1941535145344',
    digest: '3c788f5e23a5c5ab390e39b21c75eae618e308a7754e87a6c65302144549be55',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261120064112_restate_education_learner_attempt_acl.sql',
    reason:
      'fixed forward by 20261120064112_restate_education_learner_attempt_acl.sql; private.education_learner_attempt_payload is an internal helper called only from submit_education_learner_attempt. The applied file already revokes PUBLIC, anon, authenticated and service_role. The forward migration restates that revoke and does not grant the helper. service_role keeps EXECUTE only on submit_education_learner_attempt.',
  },
];
