// Source-bound findings for the secrets vault storage migrations.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261121163000_secrets_vault_storage.sql',
    line: 19,
    rule: 'rollback-safety',
    fileDigest:
      '9d255c59590161695d3131c9bea165d064c42aa7c042af6ce1d979684781b9fb',
    digest: '24362f33b250a10f360eb34d5cfaee00d65971f41e953390b53867ca1449051d',
    reason:
      'vault_definer is NOLOGIN, NOINHERIT and NOBYPASSRLS; granting it to postgres lets the migration transfer vault routine ownership to it. No API role is a member, and its only privileges are the vault tables through policies scoped to it.',
  },
];
