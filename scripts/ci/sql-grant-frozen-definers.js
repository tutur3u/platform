// Frozen SECURITY DEFINER allowlist for the SQL grant guard.
//
// Single source of truth. Import it; never copy these entries into another
// guard, test fixture or config (PR #7034's security-definer guard imports this
// module). The list is frozen: do not add entries, a new definer carries its own
// REVOKE in the same migration file.
//
// Why these six exist: CREATE OR REPLACE FUNCTION keeps the ACL of the
// existing function, so each definer below is closed (EXECUTE revoked from
// PUBLIC and anon, and from authenticated where required) by an earlier
// migration although its latest replacement carries no REVOKE of its own.
//
// Stable API (plain data, no dependencies, no side effects):
//   FROZEN_DEFINERS         frozen array of frozen entries
//     signature             schema-qualified signature as written in SQL
//     key                   normalized lookup key (`schema.name(type,...)`,
//                           lowercase, no `public.` prefix on argument types,
//                           canonical type names; what sql-grant-acl.js uses)
//     file                  basename of the migration that holds the latest
//                           replacement; inheritance applies to that file only
//     version               its 14-digit timestamp prefix
//     requiredRevoked       roles whose EXECUTE must still be revoked
//     note                  null, or why a role keeps EXECUTE by design
//   FROZEN_DEFINERS_CUTOFF  newest `version` above; a migration with a larger
//                           version never uses inheritance or later-file revoke
//                           evidence and must revoke in its own file

const freeze = (entry) =>
  Object.freeze({
    ...entry,
    version: /^\d{14}/.exec(entry.file)[0],
    requiredRevoked: Object.freeze([...entry.requiredRevoked]),
  });

// Service-role-only definers: authenticated must stay revoked as well.
const CLOSED = ['public', 'anon', 'authenticated'];

const FROZEN_DEFINERS = Object.freeze(
  [
    {
      signature: 'public.transfer_workspace_ownership(uuid,uuid)',
      key: 'public.transfer_workspace_ownership(uuid,uuid)',
      file: '20261029012000_harden_workspace_ownership_guard.sql',
      // Keeps authenticated EXECUTE by design (members call it through the
      // API); only PUBLIC and anon must stay revoked.
      requiredRevoked: ['public', 'anon'],
      note: 'authenticated EXECUTE retained by design',
    },
    {
      signature:
        'private.create_workspace_email_invitation_with_roles(uuid,text,uuid,public.workspace_member_type,uuid[])',
      key: 'private.create_workspace_email_invitation_with_roles(uuid,text,uuid,workspace_member_type,uuid[])',
      file: '20261029012100_restrict_subscription_writes.sql',
      requiredRevoked: CLOSED,
      note: null,
    },
    {
      signature: 'private.create_inventory_pos_operator_invite(uuid,uuid,text)',
      key: 'private.create_inventory_pos_operator_invite(uuid,uuid,text)',
      file: '20261029012100_restrict_subscription_writes.sql',
      requiredRevoked: CLOSED,
      note: null,
    },
    {
      signature:
        'private.finalize_workspace_invitation_membership_v2(uuid,uuid,public.workspace_member_type,uuid[])',
      key: 'private.finalize_workspace_invitation_membership_v2(uuid,uuid,workspace_member_type,uuid[])',
      file: '20261029012100_restrict_subscription_writes.sql',
      requiredRevoked: CLOSED,
      note: null,
    },
    {
      signature:
        'private.finalize_workspace_invitation_membership(uuid,uuid,public.workspace_member_type,uuid)',
      key: 'private.finalize_workspace_invitation_membership(uuid,uuid,workspace_member_type,uuid)',
      file: '20261029012100_restrict_subscription_writes.sql',
      requiredRevoked: CLOSED,
      note: null,
    },
    {
      signature: 'public.get_user_workspace_subscription_info(uuid)',
      key: 'public.get_user_workspace_subscription_info(uuid)',
      file: '20261029030400_align_ai_chat_and_subscription_rpc_access.sql',
      requiredRevoked: CLOSED,
      note: null,
    },
  ].map(freeze)
);

const FROZEN_DEFINERS_CUTOFF = FROZEN_DEFINERS.map(
  (entry) => entry.version
).reduce((newest, version) => (version > newest ? version : newest));

module.exports = { FROZEN_DEFINERS, FROZEN_DEFINERS_CUTOFF };
