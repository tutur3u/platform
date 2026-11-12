const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { statements, tokens } = require('./security-sql');
const FILE = 'scripts/ci/sql-frozen-debt.json';
const hash = (text) => createHash('sha256').update(text).digest('hex');
const key = (entry) => JSON.stringify(entry);

// Keep literal bytes and quoted identifier case. Dollar bodies contain executable
// SQL; tokenize them recursively, leaving string literals inside them opaque.
function normalize(ts, sql) {
  return ts.map((t) => {
    if (t.kind === 'body') {
      try {
        return ['body', normalize(tokens(t.value), t.value)];
      } catch {
        return ['opaque-body', t.value];
      }
    }
    if (t.kind === 'string') return ['string', sql.slice(t.start, t.end)];
    return [t.kind, Boolean(t.quoted), t.value];
  });
}

function identify(scanner, finding, sql) {
  const parsed = statements(sql);
  const lineAt = (offset) => sql.slice(0, offset).split('\n').length;
  const line = finding.line ?? 1;
  let offending = parsed.filter(
    (ts) => lineAt(ts[0].start) <= line && lineAt(ts.at(-1).end) >= line
  );
  // File-level diagnostics point at line 1 even when comments precede SQL.
  if (!offending.length) offending = parsed;
  const acl = parsed.filter((ts) =>
    /^(grant|revoke|alter|set)$/.test(ts[0].value)
  );
  return {
    scanner,
    path: finding.file,
    directory: path.posix.dirname(finding.file),
    rule: finding.rule,
    severity: 'high',
    occurrence: 0,
    statementHash: hash(
      JSON.stringify({
        statements: offending.map((ts) => normalize(ts, sql)),
        // ACL and configuration can change a CREATE finding without editing CREATE.
        context: acl.map((ts) => normalize(ts, sql)),
      })
    ),
  };
}

function entriesFor(scanner, findings, root) {
  const cache = new Map();
  const counts = new Map();
  return findings.map((finding) => {
    if (!cache.has(finding.file))
      cache.set(
        finding.file,
        fs.readFileSync(path.join(root, finding.file), 'utf8')
      );
    const entry = identify(scanner, finding, cache.get(finding.file));
    const identity = key(entry);
    entry.occurrence = counts.get(identity) ?? 0;
    counts.set(identity, entry.occurrence + 1);
    return entry;
  });
}

function canonical(entries) {
  return [
    ...new Map(entries.map((entry) => [key(entry), entry])).values(),
  ].sort((a, b) => key(a).localeCompare(key(b), 'en'));
}

function validate(entries) {
  if (!Array.isArray(entries))
    throw new Error('Frozen SQL debt must be an array');
  for (const entry of entries) {
    if (
      !['grant', 'definer'].includes(entry.scanner) ||
      typeof entry.path !== 'string' ||
      !entry.path.endsWith('.sql') ||
      entry.directory !== path.posix.dirname(entry.path) ||
      typeof entry.rule !== 'string' ||
      entry.severity !== 'high' ||
      !Number.isSafeInteger(entry.occurrence) ||
      entry.occurrence < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.statementHash ?? '') ||
      Object.keys(entry).join(',') !==
        'scanner,path,directory,rule,severity,occurrence,statementHash'
    )
      throw new Error('Invalid frozen SQL debt entry');
  }
  if (JSON.stringify(entries) !== JSON.stringify(canonical(entries)))
    throw new Error('Frozen SQL debt must be sorted and unique');
}

function additions(proposed, trusted) {
  validate(proposed);
  validate(trusted);
  const allowed = new Set(trusted.map(key));
  return proposed.filter((entry) => !allowed.has(key(entry)));
}

function enforce(scanner, findings, root, entries) {
  const proposed =
    entries ?? JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8'));
  validate(proposed);
  const allowed = new Set(proposed.map(key));
  const actual = entriesFor(scanner, findings, root);
  const present = new Set(actual.map(key));
  const unknown = findings.filter((_, i) => !allowed.has(key(actual[i])));
  for (const entry of proposed.filter((e) => e.scanner === scanner)) {
    if (!present.has(key(entry)))
      unknown.push({
        file: entry.path,
        rule: 'frozen-debt-stale',
        message: `${entry.path}: remove stale frozen ${entry.rule} debt`,
      });
  }
  return unknown;
}

function collect(root) {
  const grant = require('./sql-grant-guard').checkRepository(
    root,
    process.env,
    { raw: true }
  );
  const definer = require('./security-definer-guard').checkRepository({
    root,
    raw: true,
  });
  return canonical([
    ...entriesFor('grant', grant.violations, root),
    ...entriesFor('definer', definer, root),
  ]);
}

function assertRollbackEdits(entries, changed) {
  const edited = new Set(changed);
  if (
    entries.some(
      (entry) =>
        entry.path.startsWith('apps/database/rollbacks/') &&
        edited.has(entry.path)
    )
  )
    throw new Error(
      'Edited rollbacks must clear their own frozen SQL findings'
    );
}

// Base-owned code is copied by CI. Missing bootstrap debt is never silently
// accepted: its additions require the same pinned bot and exact-head binding as
// verified definer records, with a distinct status context and digest.
async function admit(
  root,
  trustedDirectory = __dirname,
  env = process.env,
  fetch = globalThis.fetch
) {
  const proposed = JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8'));
  const trustedPath = path.join(trustedDirectory, path.basename(FILE));
  let trusted = [];
  if (path.resolve(trustedDirectory) !== path.resolve(root, 'scripts/ci')) {
    if (fs.existsSync(trustedPath))
      trusted = JSON.parse(fs.readFileSync(trustedPath, 'utf8'));
  } else {
    const {
      resolveBase,
      baselineReference,
    } = require('./sql-grant-guard-repository');
    const base = baselineReference(root, resolveBase(root, env), env);
    const exists = execFileSync(
      'git',
      ['ls-tree', '--name-only', base, '--', FILE],
      { cwd: root, encoding: 'utf8' }
    ).trim();
    if (exists)
      trusted = JSON.parse(
        execFileSync('git', ['show', `${base}:${FILE}`], {
          cwd: root,
          encoding: 'utf8',
        })
      );
  }
  const comparison =
    env.BASE_SHA ||
    execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  if (!/^[a-f0-9]{40}$/.test(comparison))
    throw new Error('Invalid SQL debt comparison SHA');
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', comparison, '--', 'apps/database/rollbacks'],
    { cwd: root, encoding: 'utf8' }
  )
    .trim()
    .split('\n');
  assertRollbackEdits(proposed, changed);
  const added = additions(proposed, trusted);
  if (!added.length) return;
  const {
    resolveShas,
    verifyAttestation,
    recordsDigest,
  } = require('./security-definer-admission');
  const { head } = resolveShas(root, env);
  await verifyAttestation({
    additions: added,
    head,
    token: env.GITHUB_TOKEN,
    fetch,
    context: 'security/sql-frozen-debt-admission',
    description: `sql-debt sha256:${recordsDigest(added)}`,
  });
}

module.exports = {
  FILE,
  hash,
  normalize,
  identify,
  entriesFor,
  canonical,
  validate,
  additions,
  assertRollbackEdits,
  enforce,
  collect,
  admit,
};

if (require.main === module) {
  (async () => {
    const root = process.cwd();
    const [command, output] = process.argv.slice(2);
    if (command === 'generate' && output) {
      fs.writeFileSync(output, JSON.stringify(collect(root), null, 2) + '\n');
    } else if (command === 'admit') {
      await admit(root);
    } else if (command === 'check') {
      await admit(root);
      const actual = collect(root);
      const proposed = JSON.parse(
        fs.readFileSync(path.join(root, FILE), 'utf8')
      );
      validate(proposed);
      if (JSON.stringify(actual) !== JSON.stringify(proposed))
        throw new Error('Frozen SQL debt differs from scanner findings');
      console.log(
        `Frozen SQL debt: ${actual.length} statement/rule identities`
      );
    } else
      throw new Error('Usage: sql-frozen-debt.js generate <output> | check');
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
