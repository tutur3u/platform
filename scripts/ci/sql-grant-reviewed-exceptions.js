// Reviewed, source-bound exceptions to the SQL grant guard's definer rule.
//
// An entry waives only the missing-REVOKE finding for its listed findings and
// only while ALL of these hold: the migration path matches exactly; the file's
// own sha256 equals `fileSha256`; the finding (rule, line and signature) hashes
// to the listed digest; and the file holds a DO statement (real code, not a
// comment or string) whose normalized content hashes to `blockSha256` and that
// precedes the creation statement. Any change to the file, any other file, any
// other line, signature or rule gets no exception. A later grant to PUBLIC or
// anon still fails the definer. Never add entries without a security review.

const crypto = require('node:crypto');

const REVIEWED_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: 'SR-843-finance-invoice-totals',
    file: 'apps/database/supabase/migrations/20261029040800_finance_workspace_boundaries.sql',
    blockSha256:
      '0d097e687c1e74b2af83fcfb379aea72f91f2ea2d652e323e244300a68dc9af7',
    rule: 'definer-public',
    fileSha256:
      '31973f08b14236f3ec1befe03897ff7787b40486d66848c7a1af8ccd499792c1',
    findings: Object.freeze([
      Object.freeze({
        signature:
          'public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
        line: 197,
        digest:
          '75d9c89f751fdd8a6608c2d712ddaa5ee1b857402901547e3aee868eda4500d5',
      }),
      Object.freeze({
        signature:
          'public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
        line: 267,
        digest:
          'cfa35985ccb3fc08862c014c31759ec4eae878533780403ef7a4114e3dfb63ee',
      }),
      Object.freeze({
        signature:
          'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
        line: 341,
        digest:
          'a41b701146e0ee1b2733fd1a1e6bf91c62557c03a300b58e92dad6278d3eb73c',
      }),
      Object.freeze({
        signature:
          'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)',
        line: 415,
        digest:
          '499f6be9bac5ee9d4e4b8a118624e96b88d7ad6bc34bc8c65642f609228833af',
      }),
    ]),
    reason:
      'SR-843 verified: ends service_role-only (pre-creation revoke on pre-existing signatures; CREATE OR REPLACE preserves ACL)',
  }),
]);

// Digest of the finding the guard would otherwise report, bound to its file.
function digestFinding({ rule, file, line, signature }) {
  return crypto
    .createHash('sha256')
    .update(`${rule}\n${file}\n${line}\n${signature}`)
    .digest('hex');
}

function digestFile(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

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
    (candidate) => candidate.file === file
  );
  if (!entry || digestFile(sql) !== entry.fileSha256) return null;
  const covered = entry.findings.some(
    (finding) =>
      finding.signature === key &&
      finding.line === definerLine &&
      finding.digest ===
        digestFinding({
          rule: entry.rule,
          file,
          line: definerLine,
          signature: key,
        })
  );
  if (!covered) return null;
  const block = findDoBlocks(sql, code).find(
    (candidate) =>
      candidate.digest === entry.blockSha256 && candidate.endLine < definerLine
  );
  return block ? { entry, block } : null;
}

module.exports = {
  REVIEWED_EXCEPTIONS,
  digestBlock,
  digestFile,
  digestFinding,
  findDoBlocks,
  matchReviewedException,
};
