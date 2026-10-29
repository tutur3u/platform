// Reviewed, source-bound exceptions to the SQL grant guard's definer rule.
//
// An entry waives only the missing-REVOKE finding for the listed signatures and
// only while ALL of these hold: the migration path matches exactly; that file
// holds a DO statement (real code, not a comment or string) whose normalized
// content hashes to `blockSha256` and that precedes the creation statement; the
// definer's signature is in `signatures`. Any change to the block, any other
// file and any other signature gets no exception. A later grant to PUBLIC or
// anon still fails the definer. Never add entries without a security review.

const crypto = require('node:crypto');

const REVIEWED_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: 'SR-843-finance-invoice-totals',
    file: 'apps/database/supabase/migrations/20261029040800_finance_workspace_boundaries.sql',
    blockSha256:
      '0d097e687c1e74b2af83fcfb379aea72f91f2ea2d652e323e244300a68dc9af7',
    signatures: Object.freeze([
      'public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)',
    ]),
    reason:
      'pre-creation revoke on pre-existing signatures; CREATE OR REPLACE preserves ACL; bodies gate on auth.role() = service_role (SR-843)',
  }),
]);

const DO_STATEMENT = /\bDO\s+(\$[A-Za-z_]*\$)[\s\S]*?\1\s*;/gi;

// Whitespace-insensitive at line ends only: any token change alters the digest.
function digestBlock(text) {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// `code` is the lexed SQL (same offsets as `sql`, comments and literals
// blanked), so a DO inside a comment or string never counts.
function findDoBlocks(sql, code) {
  const blocks = [];
  for (const match of sql.matchAll(DO_STATEMENT)) {
    if (code.slice(match.index, match.index + 2).toLowerCase() !== 'do')
      continue;
    const before = code.slice(0, match.index).trimEnd();
    if (before !== '' && !before.endsWith(';')) continue;
    const startLine = sql.slice(0, match.index).split('\n').length;
    blocks.push({
      digest: digestBlock(match[0]),
      startLine,
      endLine: startLine + match[0].split('\n').length - 1,
    });
  }
  return blocks;
}

// Returns { entry, block } when the exception covers this definer, else null.
function matchReviewedException({ file, sql, code, key, definerLine }) {
  const entry = REVIEWED_EXCEPTIONS.find(
    (candidate) => candidate.file === file && candidate.signatures.includes(key)
  );
  if (!entry) return null;
  const block = findDoBlocks(sql, code).find(
    (candidate) =>
      candidate.digest === entry.blockSha256 && candidate.endLine < definerLine
  );
  return block ? { entry, block } : null;
}

module.exports = {
  REVIEWED_EXCEPTIONS,
  digestBlock,
  findDoBlocks,
  matchReviewedException,
};
