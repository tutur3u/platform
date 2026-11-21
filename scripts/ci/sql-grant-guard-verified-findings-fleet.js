// Source-bound Fleet desk findings fixed by a forward ACL migration.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261121140100_fleet_desk_ownership.sql',
    line: 325,
    rule: 'definer-public',
    fileDigest:
      'ad1589f89d29a44b1c490faaddde602bd145c99f5489bf66cf58c2025b9b78fb',
    digest: '00a5cec94c9dc04389e2dde24d282c2705971795da1f0ae93fffbafe73816731',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_verify_link_code keeps the ACL from 20261121114610 and 20261121124400, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140100_fleet_desk_ownership.sql',
    line: 325,
    rule: 'function-acl',
    fileDigest:
      'ad1589f89d29a44b1c490faaddde602bd145c99f5489bf66cf58c2025b9b78fb',
    digest: '00a5cec94c9dc04389e2dde24d282c2705971795da1f0ae93fffbafe73816731',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_verify_link_code keeps the ACL from 20261121114610 and 20261121124400, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140100_fleet_desk_ownership.sql',
    line: 363,
    rule: 'definer-public',
    fileDigest:
      'ad1589f89d29a44b1c490faaddde602bd145c99f5489bf66cf58c2025b9b78fb',
    digest: 'dfc5a165846b9456ae3f7dc1d4ff0f8090832ab54b7382cbf310ba39766a0bfc',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_submit_resolved_intent keeps the ACL from 20261121114610, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140100_fleet_desk_ownership.sql',
    line: 363,
    rule: 'function-acl',
    fileDigest:
      'ad1589f89d29a44b1c490faaddde602bd145c99f5489bf66cf58c2025b9b78fb',
    digest: 'dfc5a165846b9456ae3f7dc1d4ff0f8090832ab54b7382cbf310ba39766a0bfc',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_submit_resolved_intent keeps the ACL from 20261121114610, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140101_fleet_desk_digest.sql',
    line: 161,
    rule: 'definer-public',
    fileDigest:
      '4d5605342512b9da13b04555394500348a9d6fa3b3ad884e90e328a113790b2c',
    digest: 'fb1b39053595d6da8982778ae358ac9f5d6f1689bdfcc7149accfe892774d66a',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_get_digest keeps the ACL from 20261121104726, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140101_fleet_desk_digest.sql',
    line: 161,
    rule: 'function-acl',
    fileDigest:
      '4d5605342512b9da13b04555394500348a9d6fa3b3ad884e90e328a113790b2c',
    digest: 'fb1b39053595d6da8982778ae358ac9f5d6f1689bdfcc7149accfe892774d66a',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_get_digest keeps the ACL from 20261121104726, which revoked PUBLIC, anon and authenticated and granted service_role. The forward migration restates that revoke and grant. The applied file stays unchanged.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121140101_fleet_desk_digest.sql',
    line: 23,
    rule: 'function-acl',
    fileDigest:
      '4d5605342512b9da13b04555394500348a9d6fa3b3ad884e90e328a113790b2c',
    digest: 'a6f2aad5b21470eae00ef53e74a56f2b916934d25d9f7d2d106193e942d77e2d',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121151849_restate_fleet_desk_function_acl.sql',
    reason:
      'fixed forward by 20261121151849_restate_fleet_desk_function_acl.sql; CREATE OR REPLACE of private.fleet_admit_intent keeps the no-grant trigger ACL from 20261121095112, which revoked PUBLIC, anon, authenticated and service_role. The forward migration restates that revoke and does not grant the trigger. The applied file stays unchanged.',
  },
];
