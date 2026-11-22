// Source-bound findings for the workspace storage ASCII root migrations.
module.exports = [
  ...['definer-public', 'function-acl'].map((rule) => ({
    path: 'apps/database/supabase/migrations/20261122181200_workspace_storage_ascii_roots.sql',
    line: 6,
    rule,
    fileDigest:
      '71caf459cd0aa9b657f2f02319f0df45ed77f783d089bda39fa792ba2d789cdc',
    digest: '001cc9d9b31d45c1064c43b3479d794ec749f4af2607ba5008cdf0ac53d4259b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261122182652_workspace_storage_ascii_root_grants.sql',
    reason:
      'The follow-up revokes EXECUTE on this exact SECURITY DEFINER signature from PUBLIC and anon and grants it only to authenticated and service_role; the definer guard binds that follow-up by digest and rejects later regrants.',
  })),
];
