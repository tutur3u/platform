const fs = require('node:fs');
const path = require('node:path');
const { tokens, statements, definitions, values } = require('./security-sql');

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

// Fix-forward proof is restricted to static routine definitions and ACLs.
function verifyRemediation(
  sql,
  entry,
  { catalogEntry, lintMigration, parseAcl, targetMatches }
) {
  const keyword = (token, value) =>
    token?.kind === 'word' && !token.quoted && token.value === value;
  const defs = definitions(sql);
  const matches = defs.filter((fn) => fn.signature === entry.signature);
  if (matches.length !== 1 || lintMigration(sql).length) return false;
  const fn = catalogEntry(matches[0]);
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
