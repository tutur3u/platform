// EXECUTE ACL replay for SECURITY DEFINER functions in the SQL grant guard.
//
// Two ways a definer passes (policy:
// apps/docs/reference/database/migrations-guide.mdx#sql-grant-guard):
//   1. End state: an exact-signature REVOKE from public and anon after the
//      creation statement, in the same file or a later forward migration.
//   2. Inherited ACL: CREATE OR REPLACE keeps the existing ACL, so the seven
//      frozen definers below pass when an earlier REVOKE still stands at the end
//      of the migration history. Migrations newer than the newest allowlisted
//      file never use inheritance or later-file evidence; they must revoke in
//      the same file, after the creation.
// Do not add entries. A new definer carries its own REVOKE in the same file.

const path = require('node:path');
const {
  readRoutine,
  roleList,
  routineKey,
  signatureTypes,
  splitTopLevel,
} = require('./sql-grant-identifiers');

const OPEN_ROLES = ['public', 'anon'];

// transfer_workspace_ownership keeps authenticated EXECUTE by design (members
// call it through the API), so only public and anon must stay revoked there.
// The other six are service-role only, so authenticated must stay revoked too.
const INHERITED_ACL_ALLOWLIST = Object.freeze(
  [
    [
      'private.employee_creation_runtime_ready(uuid)',
      '20261029010000_restore_employee_readiness_path_contract.sql',
    ],
    [
      'public.transfer_workspace_ownership(uuid,uuid)',
      '20261029012000_harden_workspace_ownership_guard.sql',
      'authenticated EXECUTE retained by design',
    ],
    [
      'private.create_workspace_email_invitation_with_roles(uuid,text,uuid,public.workspace_member_type,uuid[])',
      '20261029012100_restrict_subscription_writes.sql',
    ],
    [
      'private.create_inventory_pos_operator_invite(uuid,uuid,text)',
      '20261029012100_restrict_subscription_writes.sql',
    ],
    [
      'private.finalize_workspace_invitation_membership_v2(uuid,uuid,public.workspace_member_type,uuid[])',
      '20261029012100_restrict_subscription_writes.sql',
    ],
    [
      'private.finalize_workspace_invitation_membership(uuid,uuid,public.workspace_member_type,uuid)',
      '20261029012100_restrict_subscription_writes.sql',
    ],
    [
      'public.get_user_workspace_subscription_info(uuid)',
      '20261029030400_align_ai_chat_and_subscription_rpc_access.sql',
    ],
  ].map(([signature, file, note]) => {
    const routine = readRoutine(signature);
    const authenticatedRetained = note !== undefined;
    return Object.freeze({
      key: routineKey(routine.name, signatureTypes(routine.args)),
      file,
      requiredRevoked: Object.freeze(
        authenticatedRetained ? OPEN_ROLES : [...OPEN_ROLES, 'authenticated']
      ),
      note: note ?? null,
    });
  })
);

// Migrations with a version above this must carry their own REVOKE.
const INHERITED_ACL_CUTOFF = INHERITED_ACL_ALLOWLIST.map(
  (entry) => /^\d{14}/.exec(entry.file)[0]
).sort()[INHERITED_ACL_ALLOWLIST.length - 1];

const EXECUTE_PRIVILEGES = /^(?:execute|all(?: privileges)?)$/;
const REVOKE_FUNCTION =
  /^revoke\s(.+?)\son (?:function|routine)s?\s(.+?)\sfrom\s(.+)$/;
const GRANT_FUNCTION =
  /^grant\s(.+?)\son (?:function|routine)s?\s(.+?)\sto\s(.+)$/;
const GRANT_SCHEMA =
  /^grant\s(.+?)\son all (?:functions|routines) in schema (.+?) to (.+)$/;
const DROP_FUNCTION =
  /^drop (?:function|routine)s?\s(?:if exists\s)?(.+?)(?:\s(?:cascade|restrict))?$/;
const DROP_SCHEMA = /^drop schema\s(?:if exists\s)?(.+?)\scascade$/;
const ALTER_FUNCTION = /^alter (?:function|routine)\s(.+)$/;
const CREATE_PLAIN_FUNCTION = /^create function\s(.+)$/;

function matchesRoutine(targets, key) {
  return splitTopLevel(targets).some((target) => {
    const routine = readRoutine(target);
    return (
      routine !== null &&
      routine.args !== null &&
      routineKey(routine.name, signatureTypes(routine.args)) === key
    );
  });
}

// Returns how a normalized statement changes the EXECUTE ACL of the routine
// `key`, or null: `revoke`/`grant` carry roles; `reset` means the function was
// dropped, moved or recreated, so earlier ACL evidence no longer applies.
function routineAclEffect(text, key) {
  const schema = key.split('.')[0];
  const revoke = REVOKE_FUNCTION.exec(text);
  if (revoke) {
    return EXECUTE_PRIVILEGES.test(revoke[1]) && matchesRoutine(revoke[2], key)
      ? { op: 'revoke', roles: roleList(revoke[3]) }
      : null;
  }
  const grant = GRANT_FUNCTION.exec(text);
  if (grant) {
    return EXECUTE_PRIVILEGES.test(grant[1]) && matchesRoutine(grant[2], key)
      ? { op: 'grant', roles: roleList(grant[3]) }
      : null;
  }
  const schemaGrant = GRANT_SCHEMA.exec(text);
  if (schemaGrant) {
    const schemas = schemaGrant[2]
      .split(',')
      .map((name) => name.trim().replace(/"/g, ''));
    return EXECUTE_PRIVILEGES.test(schemaGrant[1]) && schemas.includes(schema)
      ? { op: 'grant', roles: roleList(schemaGrant[3]) }
      : null;
  }
  const drop = DROP_FUNCTION.exec(text);
  if (drop) return matchesRoutine(drop[1], key) ? { op: 'reset' } : null;
  const dropSchema = DROP_SCHEMA.exec(text);
  if (dropSchema) {
    const schemas = dropSchema[1]
      .split(',')
      .map((name) => name.trim().replace(/"/g, ''));
    return schemas.includes(schema) ? { op: 'reset' } : null;
  }
  const alter = ALTER_FUNCTION.exec(text);
  if (alter) {
    const routine = readRoutine(alter[1]);
    const moves =
      routine && /^\s*(?:rename to|set schema)\s/.test(routine.rest);
    return moves &&
      matchesRoutine(
        alter[1].slice(0, alter[1].length - routine.rest.length),
        key
      )
      ? { op: 'reset' }
      : null;
  }
  const plain = CREATE_PLAIN_FUNCTION.exec(text);
  if (plain) {
    const routine = readRoutine(plain[1]);
    return routine &&
      routine.args !== null &&
      routineKey(routine.name, signatureTypes(routine.args)) === key
      ? { op: 'reset' }
      : null;
  }
  return null;
}

// Replays events (statements tagged with `file`) in order. Returns the roles
// whose latest relevant event is a REVOKE, with that event as evidence. A drop,
// move or recreation discards earlier evidence only when `honorReset` is set;
// the end-state rule keeps its original semantics, inheritance must honor it.
function replayRoutineAcl(events, key, { honorReset = false } = {}) {
  const revoked = new Map();
  for (const event of events) {
    const effect = routineAclEffect(event.text, key);
    if (!effect) continue;
    if (effect.op === 'reset' && honorReset) revoked.clear();
    for (const role of effect.roles ?? []) {
      if (effect.op === 'revoke') revoked.set(role, event);
      else revoked.delete(role);
    }
  }
  return revoked;
}

function evidenceOf(revoked, roles) {
  return roles.map((role) => ({
    role,
    file: revoked.get(role).file,
    line: revoked.get(role).startLine,
  }));
}

function allowlistEntry(file, key) {
  const name = file ? path.posix.basename(file) : null;
  return (
    INHERITED_ACL_ALLOWLIST.find(
      (entry) => entry.key === key && entry.file === name
    ) ?? null
  );
}

// Decides whether one definer is covered. `history` is every statement before
// the definer in migration order, `definer` the creation statement and `tail`
// everything after it (same file, then later migrations unless same-file only).
// Returns { missing } or { missing: [], mode, evidence, note }.
function judgeDefinerAcl({ file, key, history, definer, tail }) {
  const forward = replayRoutineAcl(tail, key);
  const missing = OPEN_ROLES.filter((role) => !forward.has(role));
  if (missing.length === 0) {
    return {
      missing,
      mode: 'revoke-after-creation',
      evidence: evidenceOf(forward, OPEN_ROLES),
      note: null,
    };
  }
  const entry = allowlistEntry(file, key);
  if (entry && /^create or replace function\s/.test(definer.text)) {
    const state = replayRoutineAcl([...history, definer, ...tail], key, {
      honorReset: true,
    });
    if (entry.requiredRevoked.every((role) => state.has(role))) {
      return {
        missing: [],
        mode: 'inherited-acl',
        evidence: evidenceOf(state, entry.requiredRevoked),
        note: entry.note,
      };
    }
  }
  return { missing };
}

module.exports = {
  INHERITED_ACL_ALLOWLIST,
  INHERITED_ACL_CUTOFF,
  OPEN_ROLES,
  judgeDefinerAcl,
  replayRoutineAcl,
  routineAclEffect,
};
