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

// These dispositions cover exact repository findings, not a general SQL marker.
// Changes to any source, finding or required forward contract fail closed.
const REVIEWED_END_STATE_FINDINGS = Object.freeze(
  [
    {
      file: 'apps/database/supabase/migrations/20261030113002_consolidate_workspace_permission.sql',
      fileSha256:
        'c8ad25d8c565e3b2c3b980ee776d0f5d5a5e2c1f2d5b6f5902778b91c9f048b8',
      reason:
        'Caller-bound permission helpers intentionally retain anonymous EXECUTE for RLS evaluation; direct end-user calls cannot select another actor. Exact grant signatures carry the reviewed #7178 contract.',
      findings: [
        {
          rule: 'definer-public',
          line: 13,
          digest:
            '4788dac14b75b6b32361d96aabcc2c64b0b4ae989aaf367bf0f58a38726429bc',
        },
        {
          rule: 'definer-public',
          line: 41,
          digest:
            'fe3dac60ccc37fea3c43684bd829e8d56831040bbc7233443ce6fce77552d67d',
        },
        {
          rule: 'anon-grant',
          line: 152,
          digest:
            'bdf652bc81825961bfacc4f122fb2a8221c6539427ef2fc0f6e3aa1f7176243f',
        },
        {
          rule: 'anon-grant',
          line: 155,
          digest:
            '258e89fbae02f7a58639e05e393fb350fb478c23e0e17dad99fd75a303b76f82',
        },
      ],
    },
    {
      file: 'apps/database/supabase/migrations/20261109180000_guard_legacy_cross_app_token_uuid.sql',
      fileSha256:
        '519ceb35caf61da65898895fb208cbf1e3b115a3d91263fdd9d671a331fbbc31',
      reason:
        'Applied legacy token body is preserved only with the exact reviewed forward replacement, which pins search_path and explicitly revokes PUBLIC/anon before authenticated/service_role grants.',
      requiredFile:
        'apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql',
      requiredSha256:
        '5c8e4c029edd2845279fb6d7ad23c1ef09bf4924b1347d8b7edfa4e0fe17ed88',
      findings: [
        {
          rule: 'definer-public',
          line: 1,
          digest:
            '5faed816265f4de6b76ed4fd733dab684f808641f3f2480902df1c0bf075749c',
        },
      ],
    },
    {
      file: 'apps/database/rollbacks/20261030113003_workspace_storage_limit_execute.rollback.sql',
      fileSha256:
        'b9c954fe54378e9d6699ec0a7183c0773545abb6aef26a3dfd32ec08e25d1b4a',
      reason:
        'Paired rollback restores the pre-migration anonymous storage-limit RPC ACL; the exact forward contract closes PUBLIC/anon and retains authenticated/service_role access.',
      requiredFile:
        'apps/database/supabase/migrations/20261030113003_workspace_storage_limit_execute.sql',
      requiredSha256:
        '03ba315b4218014d3d2c2d366b8a417f46024ea35a1e36b375c91c0f520392e8',
      findings: [
        {
          rule: 'anon-grant',
          line: 2,
          digest:
            '7a7fdedb6f0c4b2d00fda584328712bbf89b643b541f5f0a635abe6bc36fb2d9',
        },
      ],
    },
  ].map((entry) =>
    Object.freeze({
      ...entry,
      findings: Object.freeze(
        entry.findings.map((finding) => Object.freeze(finding))
      ),
    })
  )
);

function digestEndStateFinding({ rule, file, line, detail }) {
  return crypto
    .createHash('sha256')
    .update(`${rule}\n${file}\n${line}\n${detail}`)
    .digest('hex');
}

function matchEndStateFinding({ file, sql, finding, files, readFile }) {
  const entry = REVIEWED_END_STATE_FINDINGS.find(
    (candidate) => candidate.file === file
  );
  if (!entry || digestFile(sql) !== entry.fileSha256) return null;
  if (
    !entry.findings.some(
      (covered) =>
        covered.rule === finding.rule &&
        covered.line === finding.line &&
        covered.digest === digestEndStateFinding({ ...finding, file })
    )
  )
    return null;
  if (entry.requiredFile) {
    if (!files.includes(entry.requiredFile)) return null;
    try {
      if (digestFile(readFile(entry.requiredFile)) !== entry.requiredSha256)
        return null;
    } catch {
      return null;
    }
  }
  return entry;
}

module.exports = {
  REVIEWED_EXCEPTIONS,
  REVIEWED_END_STATE_FINDINGS,
  digestBlock,
  digestEndStateFinding,
  digestFile,
  digestFinding,
  findDoBlocks,
  matchReviewedException,
  matchEndStateFinding,
};
