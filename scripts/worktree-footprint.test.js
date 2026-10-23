const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  findArtifactDirs,
  isHeld,
  parseWorktreeList,
  readHolds,
} = require('./worktree-footprint-git.js');
const {
  canMeasureApfsPrivate,
  measureTreeAllocated,
  measureTreesApfsPrivate,
} = require('./worktree-footprint-size.js');
const {
  getFootprintReport,
  parseArgs,
  planPrune,
  pruneArtifacts,
} = require('./worktree-footprint.js');

const HOUR_MS = 60 * 60 * 1000;
const tempRoots = [];

test.after(() => {
  for (const root of tempRoots)
    fs.rmSync(root, { force: true, recursive: true });
});

function run(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function writeFile(filePath, contents = 'x') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function makeRepo() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-footprint-'))
  );
  tempRoots.push(root);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  run(repo, 'init', '-q', '-b', 'main');
  run(repo, 'config', 'user.email', 'test@example.com');
  run(repo, 'config', 'user.name', 'Test');
  run(repo, 'config', 'commit.gpgsign', 'false');
  writeFile(
    path.join(repo, '.gitignore'),
    '.turbo\nnode_modules\ndist\napps/mobile/build/\n'
  );
  // apps/docs/build is tracked documentation, not an artifact.
  writeFile(path.join(repo, 'apps/docs/build/index.mdx'), '# docs');
  writeFile(path.join(repo, 'apps/web/src/page.ts'), 'export {};');
  run(repo, 'add', '.');
  run(repo, 'commit', '-q', '-m', 'init');
  return { repo, root };
}

function addWorktree(repo, root, name, { branch = name, base = 'main' } = {}) {
  const worktree = path.join(root, name);
  run(repo, 'worktree', 'add', '-q', '-b', branch, worktree, base);
  writeFile(path.join(worktree, '.turbo/cache/a.tar.zst'), 'cache');
  writeFile(path.join(worktree, 'apps/web/dist/index.js'), 'built');
  writeFile(path.join(worktree, 'apps/mobile/build/app.bin'), 'binary');
  return worktree;
}

function backdate(paths, ms) {
  const date = new Date(ms);
  for (const target of paths) {
    for (const entry of fs.readdirSync(target, { recursive: true })) {
      fs.utimesSync(path.join(target, entry), date, date);
    }
    fs.utimesSync(target, date, date);
  }
}

function backdateWorktree(repo, worktree, ms) {
  const gitDir = run(worktree, 'rev-parse', '--absolute-git-dir').trim();
  backdate([gitDir], ms);
  for (const dir of ['.turbo', 'apps/web/dist', 'apps/mobile/build']) {
    const target = path.join(worktree, dir);
    if (fs.existsSync(target)) backdate([target], ms);
  }
  return repo;
}

test('parseWorktreeList marks the first entry primary and reads flags', () => {
  const parsed = parseWorktreeList(
    [
      'worktree /repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/.worktrees/pr',
      'HEAD bbb',
      'detached',
      'locked reason',
      '',
    ].join('\n')
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].primary, true);
  assert.equal(parsed[0].branch, 'main');
  assert.equal(parsed[1].primary, false);
  assert.equal(parsed[1].detached, true);
  assert.equal(parsed[1].locked, true);
});

test('holds protect the path, its parents, its children, and glob prefixes', () => {
  const { root } = makeRepo();
  const holdsFile = path.join(root, 'holds.txt');
  writeFile(
    holdsFile,
    '# reason\n/wt/a # inline\n/tmp/evidence-*\nrelative/ignored\n'
  );
  const holds = readHolds(holdsFile);
  assert.deepEqual(holds, ['/wt/a', '/tmp/evidence-*']);
  assert.equal(isHeld('/wt/a', holds), true);
  assert.equal(isHeld('/wt', holds), true);
  assert.equal(isHeld('/wt/a/.worktrees/x', holds), true);
  assert.equal(isHeld('/tmp/evidence-20261023', holds), true);
  assert.equal(isHeld('/wt/b', holds), false);
  assert.deepEqual(readHolds(path.join(root, 'missing.txt')), []);
});

test('findArtifactDirs only returns ignored directories without tracked files', () => {
  const { repo, root } = makeRepo();
  const worktree = addWorktree(repo, root, 'wt-artifacts');
  const found = findArtifactDirs(worktree)
    .map((entry) => `${entry.category}:${path.relative(worktree, entry.path)}`)
    .sort();
  assert.deepEqual(found, [
    'build:apps/mobile/build',
    'dist:apps/web/dist',
    'turbo:.turbo',
  ]);
});

test('measureTreeAllocated attributes files to listed buckets once per inode', () => {
  const { root } = makeRepo();
  const tree = path.join(root, 'tree');
  writeFile(path.join(tree, 'src/a.txt'), 'a'.repeat(5000));
  writeFile(path.join(tree, 'node_modules/pkg/index.js'), 'b'.repeat(3000));
  fs.linkSync(
    path.join(tree, 'node_modules/pkg/index.js'),
    path.join(tree, 'node_modules/pkg/hardlink.js')
  );
  fs.symlinkSync('pkg', path.join(tree, 'node_modules/alias'));
  const nodeModules = path.join(tree, 'node_modules');
  const result = measureTreeAllocated({ dirs: [nodeModules], root: tree });
  assert.equal(result[tree].files, 1);
  assert.equal(result[tree].apparentBytes, 5000);
  assert.equal(result[nodeModules].files, 3);
  assert.equal(result[nodeModules].apparentBytes, 3000);
  assert.equal(result[nodeModules].privateBytes, null);
});

test('APFS walker reports zero private bytes for clonefile copies', {
  skip: !canMeasureApfsPrivate(),
}, () => {
  const { root } = makeRepo();
  const original = path.join(root, 'cache/blob');
  const clone = path.join(root, 'clone/blob');
  writeFile(original, Buffer.alloc(256 * 1024, 7));
  fs.mkdirSync(path.dirname(clone));
  // Node's COPYFILE_FICLONE_FORCE is unsupported on macOS; cp -c clones.
  execFileSync('cp', ['-c', original, clone]);
  const [cloned, unique] = measureTreesApfsPrivate([
    { root: path.dirname(clone) },
    { root: path.join(root, 'cache') },
  ]);
  assert.equal(cloned[path.dirname(clone)].privateBytes, 0);
  assert.equal(unique[path.join(root, 'cache')].privateBytes, 0);
  fs.rmSync(clone);
  const [alone] = measureTreesApfsPrivate([{ root: path.join(root, 'cache') }]);
  assert.ok(alone[path.join(root, 'cache')].privateBytes >= 256 * 1024);
});

test('planPrune selects only clean, merged, idle, unheld linked worktrees', () => {
  const { repo, root } = makeRepo();
  const now = Date.now();
  const merged = addWorktree(repo, root, 'wt-merged');
  const dirty = addWorktree(repo, root, 'wt-dirty');
  writeFile(path.join(dirty, 'apps/web/src/page.ts'), 'export const x = 1;');
  const unmerged = addWorktree(repo, root, 'wt-unmerged');
  writeFile(path.join(unmerged, 'apps/web/src/new.ts'), 'export {};');
  run(unmerged, 'add', '.');
  run(unmerged, 'commit', '-q', '-m', 'feature');
  const held = addWorktree(repo, root, 'wt-held');
  const active = addWorktree(repo, root, 'wt-active');
  for (const worktree of [merged, dirty, unmerged, held]) {
    backdateWorktree(repo, worktree, now - 48 * HOUR_MS);
  }

  const plan = planPrune({
    baseRef: 'main',
    currentDir: root,
    holds: [held],
    now,
    repoDir: repo,
  });
  const reasons = Object.fromEntries(
    plan.skipped.map((entry) => [path.basename(entry.path), entry.reason])
  );

  assert.equal(reasons.repo, 'primary-checkout');
  assert.equal(reasons['wt-dirty'], 'dirty');
  assert.equal(reasons['wt-unmerged'], 'not-merged-into-main');
  assert.equal(reasons['wt-held'], 'held');
  assert.equal(reasons['wt-active'], 'recently-active');
  assert.deepEqual(plan.eligible, [merged]);
  assert.deepEqual(
    plan.candidates.map((entry) => path.relative(merged, entry.path)).sort(),
    ['.turbo', 'apps/mobile/build', 'apps/web/dist']
  );
  assert.ok(fs.existsSync(path.join(active, '.turbo')));
});

test('pruneArtifacts is a dry run by default and honors bounds on apply', () => {
  const { repo, root } = makeRepo();
  const now = Date.now();
  const merged = addWorktree(repo, root, 'wt-merged');
  backdateWorktree(repo, merged, now - 48 * HOUR_MS);
  const base = { baseRef: 'main', currentDir: root, now, repoDir: repo };

  const dryRun = pruneArtifacts(base);
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.removed.length, 0);
  assert.ok(fs.existsSync(path.join(merged, '.turbo')));

  const turboOnly = pruneArtifacts({
    ...base,
    apply: true,
    categories: ['turbo'],
  });
  assert.deepEqual(
    turboOnly.removed.map((entry) => path.relative(merged, entry.path)),
    ['.turbo']
  );
  assert.equal(fs.existsSync(path.join(merged, '.turbo')), false);
  assert.ok(fs.existsSync(path.join(merged, 'apps/web/dist')));

  const capped = pruneArtifacts({ ...base, apply: true, maxRemoveBytes: 1 });
  assert.equal(capped.removed.length, 0);
  assert.ok(
    capped.skipped.some((entry) => entry.reason === 'max-remove-reached')
  );

  // A worktree that became dirty after planning keeps its artifacts.
  writeFile(path.join(merged, 'apps/web/src/page.ts'), 'export const y = 2;');
  const dirtyNow = pruneArtifacts({ ...base, apply: true });
  assert.equal(dirtyNow.removed.length, 0);
  assert.ok(fs.existsSync(path.join(merged, 'apps/web/dist')));
  assert.ok(fs.existsSync(path.join(merged, 'apps/docs/build/index.mdx')));
});

test('getFootprintReport excludes nested worktrees and git metadata', () => {
  const { repo, root } = makeRepo();
  const worktree = addWorktree(repo, root, 'wt-report');
  const report = getFootprintReport({ apfsPrivate: false, repoDir: repo });
  const entry = report.worktrees.find((item) => item.path === worktree);
  assert.ok(entry);
  assert.equal(entry.total.privateBytes, null);
  assert.equal(entry.artifacts.length, 3);
  assert.ok(entry.total.files >= entry.source.files);
  const only = getFootprintReport({
    apfsPrivate: false,
    only: [worktree],
    repoDir: repo,
  });
  assert.deepEqual(
    only.worktrees.map((item) => item.path),
    [worktree]
  );
});

test('parseArgs validates commands, categories and apply scope', () => {
  const options = parseArgs(
    [
      'prune',
      '--category',
      'turbo',
      '--max-remove',
      '2g',
      '--min-idle-hours',
      '6',
    ],
    {}
  );
  assert.equal(options.command, 'prune');
  assert.deepEqual(options.categories, ['turbo']);
  assert.equal(options.maxRemoveBytes, 2 * 1024 ** 3);
  assert.equal(options.minIdleHours, 6);
  assert.equal(options.apply, false);
  assert.throws(() => parseArgs(['prune', '--category', 'node_modules'], {}));
  assert.throws(() => parseArgs(['report', '--apply'], {}));
  assert.throws(() => parseArgs(['clean'], {}));
  assert.equal(
    parseArgs(['report'], { TUTURUUU_WORKTREE_HOLDS_FILE: '/h.txt' }).holdsFile,
    '/h.txt'
  );
});
