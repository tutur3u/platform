// Source-bound findings for the Memory PostgREST role memberships.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261123061000_memory_postgrest.sql',
    line: 6,
    rule: 'rollback-safety',
    fileDigest:
      'b000a7c599fb12c06b4b4edbc792a6ef4be9b829434bb0910d206d4a86121c75',
    digest: '28c74daade96ab1bba900178e65e3b0762ba6c04552e2dda91dd88bd515f79d4',
    reason:
      'PostgREST can switch from authenticator to the NOLOGIN memory_rpc role selected by a signed machine token. Inheritance and admin are disabled. This role can execute two typed memory_api RPCs and the unexposed pre-request hook.',
  },
  {
    path: 'apps/database/supabase/migrations/20261123061000_memory_postgrest.sql',
    line: 7,
    rule: 'rollback-safety',
    fileDigest:
      'b000a7c599fb12c06b4b4edbc792a6ef4be9b829434bb0910d206d4a86121c75',
    digest: '8adf2a357f9e78785974a2d96dfece281e050ee03a03bdc549163062f3fa9f84',
    reason:
      'The migration operator can assign the two RPCs to their NOLOGIN owner. The explicit grant disables inheritance and admin; managed role creation may add postgres-only options. No application API role can assume or inherit the owner.',
  },
];
