const { tokens, statements } = require('./security-sql');

function assertShrinkingBlocks(reviewed, proposed) {
  const keys = new Set(
    reviewed.map((entry) => JSON.stringify([entry.file, entry.blockDigest]))
  );
  const seen = new Set();
  for (const entry of proposed) {
    const key = JSON.stringify([entry.file, entry.blockDigest]);
    if (!keys.has(key) || seen.has(key))
      throw new Error(
        'Historical block baseline may only shrink: ' + entry.file
      );
    seen.add(key);
  }
}

function assertReviewedBlocks(reviewed, proposed) {
  const keys = new Set(reviewed.map((entry) => JSON.stringify(entry)));
  for (const entry of proposed) {
    if (!keys.has(JSON.stringify(entry)))
      throw new Error(
        'Reviewed block source or grant roles changed: ' + entry.file
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
