const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ORDER_EXEMPT_VERSIONS } = require('./check-migration-timestamps.js');

const repoRoot = path.resolve(__dirname, '..');
const WORKFLOW = path.join(repoRoot, '.github/workflows/check-migrations.yml');
const SCRIPT = path.join(__dirname, 'check-migration-timestamps.js');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const BASE_NEWEST = '20261030131100_apply_creator_grant_checks.sql';

// The real "Check new migration files" step, so the test exercises the
// workflow's own Check 2 and not a copy of it.
function checkStepScript() {
  const lines = fs.readFileSync(WORKFLOW, 'utf8').split('\n');
  const start = lines.findIndex((line) =>
    line.includes('- name: Check new migration files')
  );
  assert.notEqual(start, -1, 'step exists');
  const run = lines.findIndex(
    (line, i) => i > start && /^\s+run: \|$/u.test(line)
  );
  assert.notEqual(run, -1, 'step has a run block');
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function setupRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-check2-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(repo, MIGRATIONS_DIR), { recursive: true });
  fs.writeFileSync(path.join(repo, MIGRATIONS_DIR, BASE_NEWEST), '-- base\n');
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.copyFileSync(
    SCRIPT,
    path.join(repo, 'scripts/check-migration-timestamps.js')
  );
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'base');
  return { repo, baseSha: git(repo, 'rev-parse', 'HEAD') };
}

function runCheck(t, filenames) {
  const { repo, baseSha } = setupRepo(t);
  const script = path.join(repo, 'check-step.sh');
  fs.writeFileSync(script, checkStepScript());
  const newMigrations = filenames
    .map((filename) => `${MIGRATIONS_DIR}/${filename}`)
    .join('\n');
  return spawnSync('bash', ['-e', script], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, BASE_SHA: baseSha, NEW_MIGRATIONS: newMigrations },
  });
}

test('Check 2 passes the exempt out-of-order version', (t) => {
  const result = runCheck(t, [
    '20261030130950_quarantine_orphan_role_permissions.sql',
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /reviewed out-of-order exemption/u);
  assert.match(result.stdout, /All migration checks passed/u);
});

test('Check 2 still fails any other older version', (t) => {
  for (const filename of [
    '20261030130949_neighbor_below.sql',
    '20261030130951_neighbor_above.sql',
    '20260101000000_ancient.sql',
  ]) {
    const result = runCheck(t, [filename]);
    assert.equal(result.status, 1, `${filename}: ${result.stdout}`);
    assert.match(result.stdout, /is older than the last migration/u, filename);
  }
});

test('Check 2 fails when an exempt version is mixed with an older one', (t) => {
  const result = runCheck(t, [
    '20261030130950_quarantine_orphan_role_permissions.sql',
    '20261030130949_neighbor_below.sql',
  ]);
  assert.equal(result.status, 1, result.stdout);
});

test('Check 2 exemption cannot match by prefix, glob or suffix', (t) => {
  for (const filename of [
    '202610301309500_prefix_extension.sql',
    '2026103013095_prefix_truncation.sql',
    '2026103013095*_glob.sql',
    '20261030130950-suffix_not_a_version.sql',
  ]) {
    const result = runCheck(t, [filename]);
    assert.equal(result.status, 1, `${filename}: ${result.stdout}`);
  }
});

test('the workflow holds no copy of the exemption list', () => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  for (const version of ORDER_EXEMPT_VERSIONS) {
    assert.equal(workflow.includes(version), false, version);
  }
  assert.match(
    workflow,
    /check-migration-timestamps\.js --print-exempt-versions/u
  );
});

test('--print-exempt-versions prints exactly the exported list', () => {
  const result = spawnSync('node', [SCRIPT, '--print-exempt-versions'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${ORDER_EXEMPT_VERSIONS.join('\n')}\n`);
});

test('CODEOWNERS assigns the exemption list to the security reviewer', () => {
  const owners = fs.readFileSync(
    path.join(repoRoot, '.github/CODEOWNERS'),
    'utf8'
  );
  assert.match(owners, /^\/scripts\/check-migration-timestamps\.js\s+@vhpx$/mu);
});
