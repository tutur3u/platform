// EXECUTE ACL replay for SECURITY DEFINER functions in the SQL grant guard.
//
// Two ways a definer passes (policy:
// apps/docs/reference/database/migrations-guide.mdx#sql-grant-guard):
//   1. End state: an exact-signature REVOKE from public and anon after the
//      creation statement, in the same file or a later forward migration.
//   2. Inherited ACL: CREATE OR REPLACE keeps the existing ACL, so the seven
//      frozen definers (sql-grant-frozen-definers.js, the single source of the
//      list) pass when an earlier REVOKE still stands at the end of the
//      migration history. Migrations newer than the newest frozen file never
//      use inheritance, and the qualifying REVOKE must sit in the creation file;
//      later migrations are still replayed so a later grant reopens EXECUTE.

const path = require('node:path');
const { FROZEN_DEFINERS } = require('./sql-grant-frozen-definers');
const {
  readRoutine,
  roleList,
  routineKey,
  signatureTypes,
  splitTopLevel,
} = require('./sql-grant-identifiers');

const OPEN_ROLES = ['public', 'anon'];

const EXECUTE_PRIVILEGES = /^(?:execute|all(?: privileges)?)$/;
const REVOKE_FUNCTION =
  /^revoke\s(.+?)\son (?:function|procedure|routine)s?\s(.+?)\sfrom\s(.+)$/;
const GRANT_FUNCTION =
  /^grant\s(.+?)\son (?:function|procedure|routine)s?\s(.+?)\sto\s(.+)$/;
const GRANT_SCHEMA =
  /^grant\s(.+?)\son all (?:functions|routines) in schema (.+?) to (.+)$/;
const DROP_FUNCTION =
  /^drop (?:function|procedure|routine)s?\s(?:if exists\s)?(.+?)(?:\s(?:cascade|restrict))?$/;
const DROP_SCHEMA = /^drop schema\s(?:if exists\s)?(.+?)\scascade$/;
const ALTER_FUNCTION = /^alter (?:function|procedure|routine)\s(.+)$/;
const CREATE_PLAIN_FUNCTION = /^create function\s(.+)$/;

// Does any target name this routine? Revoke evidence needs the exact
// signature. Everything that can reopen or discard an ACL (grant, drop, rename,
// move) also matches a signature-free target, which PostgreSQL accepts for a
// unique name and which here stands for every overload of that name.
function matchesRoutine(targets, key, { anyOverload = false } = {}) {
  return splitTopLevel(targets).some((target) => {
    const routine = readRoutine(target);
    if (routine === null) return false;
    if (routine.args === null) {
      return anyOverload && routine.name === key.slice(0, key.indexOf('('));
    }
    return routineKey(routine.name, signatureTypes(routine.args)) === key;
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
    return EXECUTE_PRIVILEGES.test(grant[1]) &&
      matchesRoutine(grant[2], key, { anyOverload: true })
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
  if (drop) {
    return matchesRoutine(drop[1], key, { anyOverload: true })
      ? { op: 'reset' }
      : null;
  }
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
        key,
        { anyOverload: true }
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
function replayRoutineAcl(
  events,
  key,
  { honorReset = false, onlyFile = undefined } = {}
) {
  const revoked = new Map();
  for (const event of events) {
    const effect = routineAclEffect(event.text, key);
    if (!effect) continue;
    if (effect.op === 'reset' && honorReset) revoked.clear();
    for (const role of effect.roles ?? []) {
      if (effect.op === 'revoke') {
        // With `onlyFile`, only a revoke in that file qualifies; revokes in
        // other files neither count nor clear earlier evidence.
        if (onlyFile === undefined || event.file === onlyFile) {
          revoked.set(role, event);
        }
      } else revoked.delete(role);
    }
  }
  return revoked;
}

// Does any later statement grant EXECUTE on this routine to PUBLIC or anon?
function reopensOpenRole(events, key) {
  return events.some((event) => {
    const effect = routineAclEffect(event.text, key);
    return (
      effect?.op === 'grant' &&
      effect.roles.some((role) => OPEN_ROLES.includes(role))
    );
  });
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
    FROZEN_DEFINERS.find((entry) => entry.key === key && entry.file === name) ??
    null
  );
}

// Decides whether one definer is covered. `history` is every statement before
// the definer in migration order, `definer` the creation statement and `tail`
// everything after it (same file, then every later migration). With
// `sameFileOnly`, the qualifying revoke must be in `file`; later migrations are
// still replayed so a later grant reopens EXECUTE.
// Returns { missing } or { missing: [], mode, evidence, note }.
function judgeDefinerAcl({
  file,
  key,
  history,
  definer,
  tail,
  sameFileOnly = false,
  reviewed = null,
}) {
  const forward = replayRoutineAcl(tail, key, {
    onlyFile: sameFileOnly ? file : undefined,
  });
  const missing = OPEN_ROLES.filter((role) => !forward.has(role));
  if (missing.length === 0) {
    return {
      missing,
      mode: 'revoke-after-creation',
      evidence: evidenceOf(forward, OPEN_ROLES),
      note: null,
    };
  }
  // A reviewed exception (sql-grant-reviewed-exceptions.js) waives only the
  // missing revoke; a later PUBLIC/anon grant still fails the definer.
  if (reviewed && !reopensOpenRole(tail, key)) {
    return {
      missing: [],
      mode: 'reviewed-exception',
      evidence: OPEN_ROLES.map((role) => ({
        role,
        file,
        line: reviewed.block.startLine,
      })),
      note: `${reviewed.entry.id}: ${reviewed.entry.reason}; reviewed block sha256 ${reviewed.entry.blockSha256.slice(0, 12)}`,
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
  OPEN_ROLES,
  judgeDefinerAcl,
  replayRoutineAcl,
  routineAclEffect,
};
