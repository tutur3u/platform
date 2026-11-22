const fs = require('node:fs');
const path = require('node:path');
const {
  tokens,
  statements,
  definitions,
  identity,
  values,
} = require('./security-sql');

function assertShrinkingBlocks(reviewed, proposed) {
  const keys = new Set(
    reviewed.map((entry) => JSON.stringify([entry.file, entry.blockDigest]))
  );
  const seen = new Set();
  for (const entry of proposed) {
    const key = JSON.stringify([entry.file, entry.blockDigest]);
    if (
      entry.classification !== 'historical debt, not safe' ||
      !keys.has(key) ||
      seen.has(key)
    )
      throw new Error(
        `Historical block baseline may only shrink: ${entry.file}`
      );
    seen.add(key);
  }
}

function assertReviewedBlocks(reviewed, proposed) {
  const keys = new Set(reviewed.map((entry) => JSON.stringify(entry)));
  for (const entry of proposed) {
    if (!keys.has(JSON.stringify(entry)))
      throw new Error(
        `Reviewed block source or grant roles changed: ${entry.file}`
      );
  }
}

function grantedRoles(ts) {
  const roles = new Set();
  for (const token of ts) {
    if (!['body', 'string'].includes(token.kind)) continue;
    for (const role of grantedRoles(tokens(token.value))) roles.add(role);
    const match = token.value.match(
      /^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+[\s\S]+?\s+TO\s+([\w,\s]+)$/i
    );
    if (match)
      for (const role of match[1]
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(Boolean))
        roles.add(role);
  }
  return [...roles].sort();
}

function reviewedBlockMatches(entry, file, finding, sql) {
  if (
    entry.file !== file ||
    entry.blockDigest !== finding.blockDigest ||
    typeof entry.reason !== 'string' ||
    !entry.reason.trim()
  )
    return false;
  const block = statements(sql).find(
    (ts) => sql.slice(0, ts[0].start).split('\n').length === finding.line
  );
  if (!block) return false;
  const roles = grantedRoles(block);
  // Revoke-only reviews have no grant recipients. Mixed blocks require the
  // complete, exact set, independently checked against the source bytes.
  return roles.length
    ? JSON.stringify(entry.grantedRoles) === JSON.stringify(roles) &&
        roles.every((role) => ['authenticated', 'service_role'].includes(role))
    : entry.grantedRoles === undefined || entry.grantedRoles.length === 0;
}

const taskActorBlockReview = {
  file: 'apps/database/supabase/migrations/20261121093435_bind_task_update_actor.sql',
  blockDigest:
    'f204cc1107b3bf87683b0b0246af2c56597ab934ae05768c0657c102691f6619',
  sourceDigest:
    'f6b8e954d254544471de428ce1b7c83248f42463e5ab48ee7e9604dd4acd0115',
  reason:
    'The migration rewrites a fixed catalog invoker function with two checked literal substitutions, preserving ownership, search path and ACLs.',
};

function reviewedTaskActorBlockMatches(file, finding, sql, sourceDigest) {
  return (
    sourceDigest === taskActorBlockReview.sourceDigest &&
    reviewedBlockMatches(taskActorBlockReview, file, finding, sql)
  );
}

module.exports = {
  assertShrinkingBlocks,
  assertReviewedBlocks,
  reviewedBlockMatches,
  reviewedTaskActorBlockMatches,
};

function readReviewedFile(root, trustedDirectory, name) {
  const proposed = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/ci', name), 'utf8')
  );
  assertReviewedBlocks(
    JSON.parse(fs.readFileSync(path.join(trustedDirectory, name), 'utf8')),
    proposed
  );
  return proposed;
}

function verifiedFindingMatches(entry, file, finding, sourceDigest) {
  return (
    entry.classification === 'verified false positive' &&
    entry.file === file &&
    entry.line === finding.line &&
    entry.sourceDigest === sourceDigest &&
    entry.rule === finding.rule &&
    entry.signature === finding.signature &&
    entry.digest === finding.digest &&
    typeof entry.reason === 'string' &&
    entry.reason.trim().length > 0
  );
}
module.exports.readReviewedFile = readReviewedFile;
module.exports.verifiedFindingMatches = verifiedFindingMatches;

const keyword = (token, value) =>
  token?.kind === 'word' && !token.quoted && token.value === value;

function routineStatement(ts, start, routineTarget) {
  const end = identity(ts, start).end;
  const target = routineTarget(ts.slice(start, end));
  if (
    !target.qualified ||
    target.parts.length !== 2 ||
    target.args.some((arg) => arg.ambiguous)
  )
    return null;
  return { target, end };
}

function routineKey(target) {
  return JSON.stringify([target.parts, target.args.map(({ key }) => key)]);
}

function originalTarget(sql, entry, routineTarget) {
  const matches = statements(sql).flatMap((ts) => {
    const line = sql.slice(0, ts[0].start).split('\n').length;
    if (line !== entry.line) return [];
    const start =
      ts.findIndex((t) => keyword(t, 'function') || keyword(t, 'procedure')) +
      1;
    if (!start || !['create', 'alter'].some((verb) => keyword(ts[0], verb)))
      return [];
    if (
      identity(ts, start, keyword(ts[0], 'create')).signature !==
      entry.signature
    )
      return [];
    const parsed = routineStatement(ts, start, routineTarget);
    return parsed ? [{ ...parsed, offset: ts.at(-1).end }] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

function rollbackControl(ts) {
  return ['rollback', 'abort', 'savepoint', 'release'].some((verb) =>
    keyword(ts[0], verb)
  );
}

// Schemas of the routine's custom input types (`qualified:["schema","type"]`).
function customInputSchemas(target) {
  return new Set(
    target.args
      .filter(({ key }) => key.startsWith('qualified:'))
      .map(({ key }) => JSON.parse(key.slice(10).replace(/\[\]$/, ''))[0])
  );
}

// Relation DDL on a schema-qualified object outside every custom input type's
// schema cannot drop or move those types; anything else stays unproven.
function relationOutsideSchemas(ts, schemas) {
  if (
    hidesIdentifiers(ts) ||
    ts.some((token) => keyword(token, 'cascade') || schemas.has(token.value)) ||
    (keyword(ts[0], 'drop') && ts.some((token) => keyword(token, ',')))
  )
    return false;
  let index = ['foreign', 'materialized'].some((kind) => keyword(ts[1], kind))
    ? 3
    : 2;
  while (
    ['if', 'not', 'exists', 'only'].some((word) => keyword(ts[index], word))
  )
    index += 1;
  return (
    ts[index]?.kind === 'word' &&
    keyword(ts[index + 1], '.') &&
    ts[index + 2]?.kind === 'word' &&
    !keyword(ts[index + 3], '.') &&
    !schemas.has(ts[index].value)
  );
}

// `U&"..."` identifiers carry escapes the token scan does not decode.
function hidesIdentifiers(ts) {
  return ts.some(
    (token, index) =>
      keyword(token, 'u') &&
      keyword(ts[index + 1], '&') &&
      ts[index + 2]?.start === token.end + 1
  );
}

function replayRoutineIdentity(target, migrations, routineTarget) {
  const hasCustomInput = target.args.some(({ key }) =>
    key.startsWith('qualified:')
  );
  const customSchemas = customInputSchemas(target);
  for (const sql of migrations) {
    for (const ts of statements(sql)) {
      const alter = keyword(ts[0], 'alter');
      const drop = keyword(ts[0], 'drop');
      if (
        rollbackControl(ts) ||
        ['do', 'call', 'execute'].some((verb) => keyword(ts[0], verb))
      )
        return null;
      // Table and view DDL can drop or move composite input types.
      const typeKinds = hasCustomInput
        ? ['type', 'domain', 'table', 'view', 'foreign', 'materialized']
        : ['type', 'domain'];
      if (
        ['create', 'alter', 'drop'].some((verb) => keyword(ts[0], verb)) &&
        typeKinds.some((kind) => keyword(ts[1], kind))
      ) {
        if (
          ['type', 'domain'].some((kind) => keyword(ts[1], kind)) ||
          !relationOutsideSchemas(ts, customSchemas)
        )
          return null;
        continue;
      }
      if (!alter && !drop) continue;
      if (
        drop &&
        (keyword(ts[1], 'owned') ||
          keyword(ts[1], 'extension') ||
          ts.some((token) => keyword(token, 'cascade')))
      )
        return null;
      if (
        keyword(ts[1], 'schema') &&
        ts.some((token) => keyword(token, 'rename'))
      )
        return null;
      if (drop && keyword(ts[1], 'schema')) return null;
      if (
        !['function', 'procedure', 'routine'].some((kind) =>
          keyword(ts[1], kind)
        )
      )
        continue;
      const rename = ts.findIndex((token) => keyword(token, 'rename'));
      const move = ts.findIndex(
        (token, index) =>
          keyword(token, 'set') && keyword(ts[index + 1], 'schema')
      );
      if (!drop && rename < 0 && move < 0) continue;
      if (drop) return null;
      const parsed = routineStatement(ts, 2, routineTarget);
      if (!parsed) return null;
      if (routineKey(parsed.target) !== routineKey(target)) continue;
      const parts = [...target.parts];
      if (
        parsed.end === rename &&
        keyword(ts[rename + 1], 'to') &&
        ts[rename + 2]?.kind === 'word'
      )
        parts[1] = ts[rename + 2].value;
      else if (parsed.end === move && ts[move + 2]?.kind === 'word')
        parts[0] = ts[move + 2].value;
      else return null;
      target = { ...target, parts };
    }
  }
  return target;
}

const storageAclProof = {
  file: 'apps/database/supabase/migrations/20261122181200_workspace_storage_ascii_roots.sql',
  line: 6,
  rule: 'public-execute',
  signature:
    'workspace_storage.object_access(text,text,workspace_storage . actor_access)',
  sourceDigest:
    '71caf459cd0aa9b657f2f02319f0df45ed77f783d089bda39fa792ba2d789cdc',
  remediationMigration:
    'apps/database/supabase/migrations/20261122182652_workspace_storage_ascii_root_grants.sql',
  remediationDigest:
    'f44dbb1fc517cf0aae39a38fe87a37806c5d62ae5dd734a17b17c1ff64fe374b',
};

// Statements around the follow-up that name the routine, its schema or its
// input types may only be revokes or exact two-part grants to the allowed
// roles.
function storageAclStaysScoped(sources, target, parseAcl, targetMatches) {
  const allowed = ['authenticated', 'service_role'];
  const names = [
    ...target.parts,
    ...target.args
      .filter(({ key }) => key.startsWith('qualified:'))
      .flatMap(({ key }) => JSON.parse(key.slice(10).replace(/\[\]$/, ''))),
  ];
  return sources.every((source) =>
    statements(source).every((ts) => {
      const text = source.slice(ts[0].start, ts.at(-1).end).toLowerCase();
      if (/u&\s*['"]/.test(text) || hidesIdentifiers(ts)) return false;
      const nested = nestedStatements(ts, names);
      if (
        !nested ||
        nested.some(
          (nested) =>
            changesMembership(nested) && !(nested === ts && grantsPrivilege(ts))
        )
      )
        return false;
      if (!names.some((name) => text.includes(name))) return true;
      if (keyword(ts[0], 'revoke')) return true;
      if (!keyword(ts[0], 'grant')) return false;
      let acl;
      try {
        acl = parseAcl(ts);
      } catch {
        return false;
      }
      return Boolean(
        acl?.action === 'grant' &&
        !acl.schemas?.length &&
        acl.targets?.length &&
        acl.targets.every(
          (routine) =>
            routine.parts?.length === 2 &&
            targetMatches(routine, { target }, acl.action)
        ) &&
        acl.roles.every((name) => allowed.includes(name)) &&
        !ts.some(
          (token) =>
            keyword(token, 'with') || (token.quoted && token.value === 'public')
        )
      );
    })
  );
}

// Routine bodies and string literals are lexed again so comments and quoting
// inside them cannot split keywords. Adjacent string literals are joined as
// PostgreSQL joins them. A body that does not lex, nesting deeper than eight
// levels, or a string that does not lex but carries escapes or membership
// keywords leaves the proof unproven (`null`). So does any literal that names
// the routine or carries `U&` or `E` escapes, and dynamic `EXECUTE` below the
// first body level, which the repository scan does not reach.
function nestedStatements(ts, names, depth = 0) {
  if (depth >= 2 && ts.some((token) => keyword(token, 'execute'))) return null;
  const literals = [];
  for (const [index, token] of ts.entries()) {
    if (token.kind !== 'body' && token.kind !== 'string') continue;
    const before = ts[index - 1];
    if (
      token.kind === 'string' &&
      keyword(before, 'e') &&
      before.end === token.start &&
      token.value.includes('\\')
    )
      return null;
    if (token.kind === 'string' && before?.kind === 'string')
      literals.at(-1).value += token.value;
    else literals.push({ value: token.value, body: token.kind === 'body' });
  }
  const nested = [ts];
  for (const literal of literals) {
    const text = literal.value.toLowerCase();
    if (/u&\s*['"]/.test(text) || names.some((name) => text.includes(name)))
      return null;
    let inner;
    try {
      inner = statements(literal.value);
    } catch {
      if (literal.body || mayChangeMembership(literal.value)) return null;
      continue;
    }
    if (inner.length && depth >= 8) return null;
    for (const statement of inner) {
      const more = nestedStatements(statement, names, depth + 1);
      if (!more) return null;
      nested.push(...more);
    }
  }
  return nested;
}

function mayChangeMembership(text) {
  if (text.includes('\\')) return true;
  const words = new Set(text.toLowerCase().match(/[a-z_]+/g) ?? []);
  return (
    (words.has('alter') && words.has('group')) ||
    (words.has('create') &&
      ['role', 'user', 'group'].some((word) => words.has(word))) ||
    (words.has('grant') && words.has('to'))
  );
}

// Role membership changes are never proven here, whatever role they name.
function changesMembership(ts) {
  return ts.some((token, index) => {
    if (keyword(token, 'alter') && keyword(ts[index + 1], 'group')) return true;
    if (
      keyword(token, 'create') &&
      ['role', 'user', 'group'].some((kind) => keyword(ts[index + 1], kind))
    )
      return true;
    if (!keyword(token, 'grant')) return false;
    for (const next of ts.slice(index + 1)) {
      if (keyword(next, 'on')) return false;
      if (keyword(next, 'to')) return true;
    }
    return false;
  });
}

function grantsPrivilege(ts) {
  return keyword(ts[0], 'grant') && ts.some((token) => keyword(token, 'on'));
}

function verifyStorageAcl(
  sql,
  { entry, target, intervening = [], later },
  parseAcl,
  targetMatches
) {
  if (
    Object.entries(storageAclProof).some(([key, value]) => entry[key] !== value)
  )
    return false;
  const revoked = new Set();
  const granted = new Set();
  const allowed = ['authenticated', 'service_role'];
  for (const ts of statements(sql)) {
    if (
      ts.length === 1 &&
      ['begin', 'commit'].some((word) => keyword(ts[0], word))
    )
      continue;
    const acl = parseAcl(ts);
    const routine = acl?.targets?.[0];
    if (
      acl?.targets?.length !== 1 ||
      !routine?.qualified ||
      !routine.args ||
      routine.args.some((argument) => argument.ambiguous) ||
      routineKey(routine) !== routineKey(target) ||
      ts.some(
        (token) =>
          keyword(token, 'with') ||
          keyword(token, 'granted') ||
          (token.quoted && token.value === 'public')
      )
    )
      return false;
    for (const role of acl.roles) {
      if (acl.action === 'grant') {
        if (!allowed.includes(role)) return false;
        granted.add(role);
      } else {
        if (!['public', 'anon'].includes(role)) return false;
        revoked.add(role);
      }
    }
  }
  return (
    revoked.has('public') &&
    revoked.has('anon') &&
    allowed.every((role) => granted.has(role)) &&
    storageAclStaysScoped(
      [...intervening, ...later],
      target,
      parseAcl,
      targetMatches
    )
  );
}

// Fix-forward proof is restricted to static routine definitions and ACLs.
function verifyRemediation(
  sql,
  { original, entry, intervening, later = [] },
  { catalogEntry, lintMigration, parseAcl, routineTarget, targetMatches }
) {
  if (statements(original).some(rollbackControl)) return false;
  const source = originalTarget(original, entry, routineTarget);
  if (!source) return false;
  const target = replayRoutineIdentity(
    source.target,
    [original.slice(source.offset), ...intervening],
    routineTarget
  );
  if (!target) return false;
  if (entry.remediationMode === 'acl-only')
    return verifyStorageAcl(
      sql,
      { entry, target, intervening, later },
      parseAcl,
      targetMatches
    );
  if (entry.remediationMode !== undefined) return false;
  const defs = definitions(sql);
  const matches = defs
    .map(catalogEntry)
    .filter(
      ({ target: candidate }) =>
        candidate.args &&
        candidate.args.every((arg) => !arg.ambiguous) &&
        routineKey(candidate) === routineKey(target)
    );
  if (matches.length !== 1 || lintMigration(sql).length) return false;
  const [fn] = matches;
  if (
    !fn.target.qualified ||
    !keyword(fn.tokens[1], 'or') ||
    !keyword(fn.tokens[2], 'replace')
  )
    return false;
  const configs = fn.tokens.flatMap((token, index, ts) =>
    keyword(token, 'set') && ts[index + 1]?.value === 'search_path'
      ? [index]
      : []
  );
  if (configs.length !== 1) return false;
  const [config] = configs;
  const setting = fn.tokens.slice(config + 2, config + 7);
  if (
    !/^(?:=|to) pg_catalog , pg_temp (?:as|language|security)$/.test(
      values(setting)
    ) ||
    !keyword(setting[1], 'pg_catalog') ||
    !keyword(setting[3], 'pg_temp')
  )
    return false;
  const offsets = new Set(defs.map((def) => def.offset));
  const clients = new Set(['public', 'anon', 'authenticated']);
  for (const ts of statements(sql)) {
    if (offsets.has(ts[0].start)) continue;
    if (
      ts.length === 1 &&
      ['begin', 'commit'].some((word) => keyword(ts[0], word))
    )
      continue;
    if (
      ts.length === 4 &&
      keyword(ts[0], 'notify') &&
      keyword(ts[1], 'pgrst') &&
      keyword(ts[2], ',') &&
      ts[3].kind === 'string' &&
      ts[3].value === 'reload schema'
    )
      continue;
    if (
      ts.length === 5 &&
      /^set local (?:lock_timeout|statement_timeout) = /.test(values(ts)) &&
      ts[4].kind === 'string'
    )
      continue;
    const acl = parseAcl(ts);
    if (!acl?.targets || ts.some((token) => keyword(token, 'granted')))
      return false;
    if (!acl.targets.some((target) => targetMatches(target, fn, acl.action)))
      continue;
    if (acl.action === 'grant') {
      if (acl.roles.some((role) => role !== 'service_role')) return false;
    } else if (ts[0].start > fn.offset) {
      const from = ts.findIndex((token) => keyword(token, 'from'));
      for (const token of ts.slice(from + 1)) {
        if (
          acl.roles.includes(token.value) &&
          token.kind === 'word' &&
          (!token.quoted || token.value !== 'public')
        )
          clients.delete(token.value);
      }
    }
  }
  return clients.size === 0;
}

module.exports.verifyRemediation = verifyRemediation;
