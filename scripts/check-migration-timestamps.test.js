const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  checkMigrationOrder,
  findNewestMigration,
  parseAddedMigrations,
} = require('./check-migration-timestamps.js');

const SCRIPT = path.join(__dirname, 'check-migration-timestamps.js');
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const BASE_MIGRATIONS = [
  '20260101000000_first.sql',
  '20260105000000_second.sql',
];

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeMigration(repo, filename) {
  const dir = path.join(repo, MIGRATIONS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `-- ${filename}\n`);
}

function commitAll(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', message);
}

/**
 * A clone whose origin's main holds BASE_MIGRATIONS, checked out on a
 * feature branch from that main.
 */
function setupRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-order-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', '--quiet', origin, repo);
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'checkout', '--quiet', '-b', 'main');
  for (const filename of BASE_MIGRATIONS) writeMigration(repo, filename);
  commitAll(repo, 'base');
  git(repo, 'push', '--quiet', 'origin', 'main');
  git(repo, 'checkout', '--quiet', '-b', 'feature');
  return repo;
}

const PR_ENV = { GITHUB_BASE_REF: 'main', CI: 'true' };

test('a migration added after the base newest passes', (t) => {
  const repo = setupRepo(t);
  writeMigration(repo, '20260106000000_third.sql');
  commitAll(repo, 'add third');

  const result = checkMigrationOrder({ cwd: repo, env: PR_ENV });
  assert.deepEqual(result.newest, {
    filename: '20260105000000_second.sql',
    timestamp: '20260105000000',
  });
  assert.deepEqual(result.added, [
    `${MIGRATIONS_DIR}/20260106000000_third.sql`,
  ]);
  assert.deepEqual(result.outOfOrder, []);
});

test('a migration at or before the base newest fails', (t) => {
  const repo = setupRepo(t);
  writeMigration(repo, '20260103000000_late.sql');
  writeMigration(repo, '20260105000000_same_slot.sql');
  commitAll(repo, 'add out-of-order migrations');

  const result = checkMigrationOrder({ cwd: repo, env: PR_ENV });
  assert.deepEqual(result.outOfOrder, [
    '20260103000000_late.sql',
    '20260105000000_same_slot.sql',
  ]);
});

test('a rename to an older slot fails', (t) => {
  const repo = setupRepo(t);
  git(
    repo,
    'mv',
    `${MIGRATIONS_DIR}/20260105000000_second.sql`,
    `${MIGRATIONS_DIR}/20260103000000_second.sql`
  );
  commitAll(repo, 'rename second');

  const result = checkMigrationOrder({ cwd: repo, env: PR_ENV });
  assert.deepEqual(result.outOfOrder, ['20260103000000_second.sql']);
});

test('a PR without migrations passes', (t) => {
  const repo = setupRepo(t);
  fs.writeFileSync(path.join(repo, 'README.md'), 'docs\n');
  commitAll(repo, 'docs only');

  const result = checkMigrationOrder({ cwd: repo, env: PR_ENV });
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.outOfOrder, []);
});

test('the base newest comes from the base tip, not the merge-base', (t) => {
  const repo = setupRepo(t);
  writeMigration(repo, '20260106000000_feature.sql');
  commitAll(repo, 'feature migration');
  // main advances past the feature's migration after the branch was cut.
  git(repo, 'checkout', '--quiet', 'main');
  writeMigration(repo, '20260107000000_main.sql');
  commitAll(repo, 'main migration');
  git(repo, 'push', '--quiet', 'origin', 'main');
  git(repo, 'checkout', '--quiet', 'feature');

  const result = checkMigrationOrder({ cwd: repo, env: PR_ENV });
  assert.equal(result.newest.timestamp, '20260107000000');
  assert.deepEqual(result.outOfOrder, ['20260106000000_feature.sql']);
});

test('a shallow PR checkout fetches and deepens the base ref', (t) => {
  const repo = setupRepo(t);
  writeMigration(repo, '20260103000000_late.sql');
  commitAll(repo, 'late');
  commitAll(repo, 'second feature commit');
  git(repo, 'push', '--quiet', 'origin', 'feature');

  const shallow = path.join(path.dirname(repo), 'shallow');
  git(
    path.dirname(repo),
    'clone',
    '--quiet',
    '--depth=1',
    '--branch=feature',
    `file://${path.join(path.dirname(repo), 'origin.git')}`,
    shallow
  );

  const result = checkMigrationOrder({ cwd: shallow, env: PR_ENV });
  assert.deepEqual(result.outOfOrder, ['20260103000000_late.sql']);
});

test('the CLI names the files and base newest timestamp', (t) => {
  const repo = setupRepo(t);
  writeMigration(repo, '20260102000000_stale.sql');
  commitAll(repo, 'stale');

  const result = spawnSync('node', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...PR_ENV },
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /20260102000000_stale\.sql/u);
  assert.match(result.stderr, /newest migration on main \(20260105000000/u);
});

test('outside a pull request in CI the order check is skipped', (t) => {
  const repo = setupRepo(t);
  assert.deepEqual(checkMigrationOrder({ cwd: repo, env: { CI: 'true' } }), {
    skipped: 'no pull request base ref',
  });
});

test('name-status parsing keeps only added and renamed-to migrations', () => {
  const output = [
    `A\t${MIGRATIONS_DIR}/20260106000000_new.sql`,
    `R087\t${MIGRATIONS_DIR}/20260105000000_old.sql\t${MIGRATIONS_DIR}/20260104000000_old.sql`,
    `A\t${MIGRATIONS_DIR}/nested/20260106000000_ignored.sql`,
    `A\t${MIGRATIONS_DIR}/README.md`,
  ].join('\n');
  assert.deepEqual(parseAddedMigrations(output), [
    `${MIGRATIONS_DIR}/20260106000000_new.sql`,
    `${MIGRATIONS_DIR}/20260104000000_old.sql`,
  ]);
  assert.equal(findNewestMigration([]), null);
});
