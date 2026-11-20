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

module.exports = {
  assertShrinkingBlocks,
  assertReviewedBlocks,
  reviewedBlockMatches,
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

function replayRoutineIdentity(target, migrations, routineTarget) {
  const hasCustomInput = target.args.some(({ key }) =>
    key.startsWith('qualified:')
  );
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
      )
        return null;
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

// Fix-forward proof is restricted to static routine definitions and ACLs.
function verifyRemediation(
  sql,
  { original, entry, intervening },
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
