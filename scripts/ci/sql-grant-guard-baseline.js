const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('./sql-grant-guard-repository');
const BASELINE = 'scripts/ci/sql-grant-guard.baseline.json';
const LABEL = 'historical debt, not safe';
const ROOT = path.resolve(__dirname, '../..');
const SQL_DIRS = [
  'apps/database/supabase/migrations',
  'apps/database/rollbacks',
  'apps/database/supabase/schemas',
];
const entryKey = (entry) =>
  JSON.stringify([entry.path, entry.rule, entry.digest, entry.occurrence ?? 0]);
function baselineEntry(finding) {
  return {
    path: finding.file,
    rule: finding.rule,
    digest: finding.digest,
    fileDigest: finding.fileDigest,
    ...(finding.class ? { class: finding.class } : {}),
  };
}
function numbered(entries) {
  const counts = new Map();
  return entries.map((entry) => {
    const key = entryKey(entry);
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return { ...entry, ...(occurrence ? { occurrence } : {}) };
  });
}
function makeBaseline(source, entries) {
  const files = Object.fromEntries(
    entries.map((entry) => [entry.path, entry.fileDigest])
  );
  return {
    label: LABEL,
    source,
    files,
    entries: numbered(entries).map(
      ({ path, rule, digest, occurrence, class: classification }) => ({
        path,
        rule,
        digest,
        ...(classification ? { class: classification } : {}),
        ...(occurrence ? { occurrence } : {}),
      })
    ),
  };
}
const FIX_GUIDANCE = {
  'anon-grant':
    'Remove the open grant; routine exceptions require the signature review marker with anon-required.',
  'definer-public':
    'REVOKE ALL on the exact routine signature from PUBLIC and anon in the defining file.',
  'function-acl':
    'Use an explicit signature, REVOKE ALL from PUBLIC/anon/authenticated, then grant service_role or record the documented signature review/no-grant marker.',
  'definer-search-path':
    'Pin one search_path with pg_catalog first and pg_temp last; reviewed ALTER requires an alter-routine-review marker.',
  'dynamic-sql-review':
    'Review DO/EXECUTE and attach a statement-adjacent reviewed(dynamic-sql-review) marker.',
  'rollback-safety':
    'Remove unsafe rollback grants, default privileges, membership or grant options.',
  'rollback-name':
    'Match the forward migration filename with an approved rollback suffix.',
};
function debtClass(file, diagnostic) {
  const name = path.posix.basename(file);
  if (
    file.startsWith(`${SQL_DIRS[1]}/`) &&
    ((name.startsWith('20261029012300_') && diagnostic.line === 2) ||
      (name.startsWith('20261029030500_') && diagnostic.line === 6) ||
      (name.startsWith('20261029030600_') && diagnostic.line === 43)) &&
    ['anon-grant', 'rollback-safety'].includes(diagnostic.rule)
  )
    return 'latent-rollback-grant';
  if (
    file.startsWith(`${SQL_DIRS[0]}/`) &&
    diagnostic.rule === 'definer-search-path' &&
    ((name.startsWith('20261029050430_') &&
      [9, 120].includes(diagnostic.line)) ||
      (name.startsWith('20261029100000_') &&
        [39, 380].includes(diagnostic.line)))
  )
    return 'definer-path-hygiene';
  return null;
}
function collectDiagnostics({ files, readFile }) {
  const {
    scanSql,
    scanExtensions,
    lexSql,
    splitStatements,
  } = require('./sql-grant-guard');
  const findings = [];
  for (const file of files) {
    if (!SQL_DIRS.some((dir) => file.startsWith(`${dir}/`))) continue;
    const sql = readFile(file);
    const rollback = file.startsWith(`${SQL_DIRS[1]}/`);
    const diagnostics = [
      ...scanSql(sql, { definerRule: file.startsWith(`${SQL_DIRS[0]}/`) }),
      ...scanExtensions(sql, { rollback }),
    ];
    if (rollback) {
      const name = path.posix.basename(file);
      const stem = name.replace(
        /\.(?:incident-rollback|rollback-validate|rollback|containment)\.sql$/,
        '.sql'
      );
      if (stem === name || !files.includes(`${SQL_DIRS[0]}/${stem}`))
        diagnostics.push({
          rule: 'rollback-name',
          line: 1,
          detail:
            'rollback filename must match a migration and use an approved rollback suffix',
        });
    }
    let offset = 0;
    let line = 1;
    const blocks = splitStatements(lexSql(sql).code).map((part) => {
      const block = {
        start: line,
        end: line + part.split('\n').length - 1,
        raw: sql.slice(offset, offset + part.length),
      };
      line = block.end;
      offset += part.length + 1;
      return block;
    });
    for (const diagnostic of diagnostics) {
      const block = blocks
        .filter(
          (part) => diagnostic.line >= part.start && diagnostic.line <= part.end
        )
        .map((part) => part.raw)
        .join(';');
      const context =
        diagnostic.rule === 'rollback-name' ||
        (diagnostic.rule === 'dynamic-sql-review' && diagnostic.line === 1)
          ? sql
          : block || sql;
      const classification = debtClass(file, diagnostic);
      findings.push({
        ...diagnostic,
        ...(classification ? { class: classification } : {}),
        file,
        digest: digest(context),
        fileDigest: digest(sql),
        message: `${file}:${diagnostic.line} ${diagnostic.detail}. [${diagnostic.rule}] ${FIX_GUIDANCE[diagnostic.rule] ?? 'See the SQL grant guard documentation.'}`,
      });
    }
  }
  return findings;
}
function evaluateSqlFiles({
  files,
  readFile,
  baseline = makeBaseline('0'.repeat(40), []),
  verifiedFindings = [],
}) {
  const diagnostics = collectDiagnostics({ files, readFile });
  const actualEntries = numbered(diagnostics.map(baselineEntry));
  const allowed = new Set(baseline.entries.map(entryKey));
  const actual = new Map(
    actualEntries.map((entry, i) => [entryKey(entry), diagnostics[i]])
  );
  const legacy = [];
  const violations = [];
  const hashes = new Map(
    diagnostics.map((finding) => [finding.file, finding.fileDigest])
  );
  for (const [file, expected] of Object.entries(baseline.files)) {
    if (!hashes.has(file) && files.includes(file))
      hashes.set(file, digest(readFile(file)));
    if (hashes.get(file) !== expected)
      violations.push({
        file,
        rule: 'baseline-file-changed',
        line: 1,
        detail:
          'baselined SQL file changed; fix its diagnostics and remove its debt entries',
        message: `${file}:1 baseline-file-changed: historical debt bytes changed; remove stale entries and fix diagnostics`,
      });
  }
  for (const entry of baseline.entries) {
    if (!actual.has(entryKey(entry)))
      violations.push({
        file: entry.path,
        rule: 'baseline-stale',
        line: 1,
        detail: 'baseline entry no longer matches an existing diagnostic',
        message: `${entry.path}:1 baseline-stale: remove the stale ${entry.rule} entry`,
      });
  }

  const verified = [];
  const matchesVerified = (finding) =>
    verifiedFindings.some(
      (entry) =>
        entry.path === finding.file &&
        entry.line === finding.line &&
        entry.rule === finding.rule &&
        /^[a-f0-9]{64}$/.test(entry.fileDigest ?? '') &&
        entry.fileDigest === finding.fileDigest &&
        entry.digest === finding.digest &&
        typeof entry.reason === 'string' &&
        entry.reason.trim().length > 0 &&
        (entry.class === undefined || entry.class === 'fixed-forward') &&
        (entry.class !== 'fixed-forward' ||
          (typeof entry.requiredMigration === 'string' &&
            /^apps\/database\/supabase\/migrations\/[a-zA-Z0-9_]+\.sql$/.test(
              entry.requiredMigration
            ) &&
            entry.requiredMigration !== entry.path &&
            files.includes(entry.requiredMigration)))
    );
  diagnostics.forEach((finding, i) => {
    if (matchesVerified(finding)) {
      verified.push(finding);
      return;
    }

    (allowed.has(entryKey(actualEntries[i])) &&
    baseline.files[finding.file] === finding.fileDigest
      ? legacy
      : violations
    ).push(finding);
  });
  return { violations, legacy, verified };
}
function validateBaseline(current, previous) {
  if (
    current?.label !== LABEL ||
    !/^[a-f0-9]{40}$/.test(current.source) ||
    !Array.isArray(current.entries) ||
    !current.files ||
    Array.isArray(current.files) ||
    typeof current.files !== 'object'
  )
    throw new Error('Invalid historical debt baseline');
  const seen = new Set();
  const paths = new Set();
  const prior =
    previous &&
    new Map(previous.entries.map((entry) => [entryKey(entry), entry]));
  if (
    previous &&
    (previous.label !== current.label || previous.source !== current.source)
  )
    throw new Error('Historical debt baseline metadata is shrink-only');
  for (const entry of current.entries) {
    if (
      !SQL_DIRS.some((dir) => entry.path?.startsWith(`${dir}/`)) ||
      entry.path.includes('..') ||
      !entry.path.endsWith('.sql') ||
      !/^[a-f0-9]{64}$/.test(entry.digest) ||
      !/^[a-f0-9]{64}$/.test(current.files[entry.path]) ||
      typeof entry.rule !== 'string' ||
      (entry.class !== undefined &&
        !['latent-rollback-grant', 'definer-path-hygiene'].includes(
          entry.class
        )) ||
      (entry.occurrence !== undefined &&
        (!Number.isInteger(entry.occurrence) || entry.occurrence < 1))
    )
      throw new Error('Invalid historical debt entry');
    const key = entryKey(entry);
    if (seen.has(key))
      throw new Error(`Duplicate historical debt entry: ${entry.path}`);
    seen.add(key);
    paths.add(entry.path);
    if (
      prior &&
      (!prior.has(key) ||
        previous.files[entry.path] !== current.files[entry.path] ||
        prior.get(key).class !== entry.class)
    )
      throw new Error(`Historical debt baseline is shrink-only: ${entry.path}`);
  }
  if (Object.keys(current.files).some((file) => !paths.has(file)))
    throw new Error('Stale baseline file metadata must be removed');
}
function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function withSnapshot(root, source, action) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sql-grant-baseline-')
  );
  try {
    const dirs = git(root, [
      'ls-tree',
      '--name-only',
      source,
      '--',
      ...SQL_DIRS,
    ])
      .split('\n')
      .filter(Boolean);
    if (!dirs.length) throw new Error('No SQL directories in baseline source');
    const archive = execFileSync(
      'git',
      ['archive', '--format=tar', source, '--', ...dirs],
      { cwd: root, maxBuffer: 128 * 1024 * 1024, timeout: 60000 }
    );
    const extracted = spawnSync('tar', ['-xf', '-', '-C', directory], {
      input: archive,
      encoding: 'utf8',
      timeout: 60000,
    });
    if (extracted.status !== 0)
      throw new Error(`Could not read SQL snapshot: ${extracted.stderr}`);
    const { listSqlFiles } = require('./sql-grant-guard');
    return action(
      collectDiagnostics({
        files: listSqlFiles(directory),
        readFile: (file) => fs.readFileSync(path.join(directory, file), 'utf8'),
      })
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function loadBaseline(root, base) {
  const current = JSON.parse(
    fs.readFileSync(path.join(root, BASELINE), 'utf8')
  );
  const priorPath = git(root, ['ls-tree', '--name-only', base, '--', BASELINE]);
  const prior = priorPath
    ? JSON.parse(git(root, ['show', `${base}:${BASELINE}`]))
    : null;
  validateBaseline(current, prior);
  if (!prior) {
    git(root, ['merge-base', '--is-ancestor', current.source, base]);
    withSnapshot(root, current.source, (diagnostics) => {
      const actual = new Map(
        numbered(diagnostics.map(baselineEntry)).map((entry) => [
          entryKey(entry),
          entry.fileDigest,
        ])
      );
      for (const entry of current.entries)
        if (actual.get(entryKey(entry)) !== current.files[entry.path])
          throw new Error(
            `Baseline entry was not diagnostic debt on its main source: ${entry.path}`
          );
    });
  }
  return current;
}
module.exports = {
  BASELINE,
  LABEL,
  baselineEntry,
  makeBaseline,
  collectDiagnostics,
  evaluateSqlFiles,
  validateBaseline,
  loadBaseline,
  withSnapshot,
};
if (require.main === module) {
  const source = process.argv[3];
  if (process.argv[2] !== '--generate' || !/^[a-f0-9]{40}$/.test(source ?? ''))
    throw new Error(
      'Usage: sql-grant-guard-baseline.js --generate <full main SHA>'
    );
  withSnapshot(ROOT, source, (diagnostics) => {
    const baseline = makeBaseline(source, diagnostics.map(baselineEntry));
    validateBaseline(baseline);
    fs.writeFileSync(
      path.join(ROOT, BASELINE),
      `${JSON.stringify(baseline, null, 2)}\n`
    );
    console.log(
      JSON.stringify({
        source,
        count: diagnostics.length,
        classes: baseline.entries.reduce((counts, entry) => {
          const key = `${entry.class ?? 'unclassified-historical-debt'}/${entry.rule}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
        counts: diagnostics.reduce((counts, finding) => {
          counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
          return counts;
        }, {}),
      })
    );
  });
}
