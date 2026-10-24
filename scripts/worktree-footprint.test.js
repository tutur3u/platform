const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const {
  findArtifactDirs,
  isHeld,
  newestMtimeMs,
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
  assert.throws(
    () => readHolds(path.join(root, 'missing.txt')),
    /Cannot read holds/
  );
  assert.deepEqual(
    readHolds(path.join(root, 'missing.txt'), fs, { optional: true }),
    []
  );
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

test('holds inputs fail closed and aliases protect worktrees', () => {
  for (const args of [
    ['prune', '--holds-file'],
    ['prune', '--holds-file', '--apply'],
  ])
    assert.throws(() => parseArgs(args, {}), /requires a value/);
  assert.throws(() =>
    parseArgs(['prune'], { TUTURUUU_WORKTREE_HOLDS_FILE: '' })
  );
  const { repo, root } = makeRepo();
  const alias = path.join(root, 'alias');
  fs.symlinkSync(repo, alias);
  assert.equal(isHeld(repo, [alias]), true);
  if (process.platform === 'darwin') {
    assert.equal(isHeld(repo, [repo.replace('/private/tmp/', '/tmp/')]), true);
  }
  assert.equal(isHeld(repo, [path.join(alias, 'missing-child')]), true);
  assert.equal(isHeld(repo, [path.join(alias, 'prefix-*')]), true);
  assert.throws(() => readHolds(repo), /Cannot read holds/);
  const denied = {
    readFileSync() {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    },
  };
  assert.throws(() => readHolds(repo, denied, { optional: true }), /denied/);
  for (const options of [
    parseArgs(['prune', '--holds-file', path.join(root, 'missing')], {}),
    parseArgs(['prune'], {
      TUTURUUU_WORKTREE_HOLDS_FILE: path.join(root, 'missing'),
    }),
  ]) {
    assert.equal(options.optionalHoldsFile, false);
    assert.throws(() =>
      readHolds(options.holdsFile, fs, { optional: options.optionalHoldsFile })
    );
  }
  assert.throws(() => parseArgs(['prune', '--category', 'rust-target'], {}));
});

test('recursive activity scan fails safe on depth, entry and read limits', () => {
  const { root } = makeRepo();
  const tree = path.join(root, 'activity');
  writeFile(path.join(tree, 'a/b/c'), 'old');
  backdate([tree], Date.now() - 48 * HOUR_MS);
  fs.writeFileSync(path.join(tree, 'a/b/c'), 'new');
  assert.ok(newestMtimeMs(tree) > Date.now() - HOUR_MS);
  assert.equal(newestMtimeMs(tree, fs, { maxDepth: 1 }), Infinity);
  assert.equal(newestMtimeMs(tree, fs, { maxEntries: 1 }), Infinity);
  assert.equal(newestMtimeMs(path.join(root, 'missing')), Infinity);
});

test('locked, current and deeply written artifacts are preserved', () => {
  const { repo, root } = makeRepo();
  const now = Date.now();
  const wt = addWorktree(repo, root, 'gates');
  backdateWorktree(repo, wt, now - 48 * HOUR_MS);
  const options = { repoDir: repo, currentDir: root, baseRef: 'main', now };
  run(repo, 'worktree', 'lock', wt);
  assert.ok(planPrune(options).skipped.some((x) => x.reason === 'locked'));
  run(repo, 'worktree', 'unlock', wt);
  assert.ok(
    planPrune({ ...options, currentDir: path.join(wt, 'apps') }).skipped.some(
      (x) => x.reason === 'current-worktree'
    )
  );
  fs.writeFileSync(path.join(wt, '.turbo/cache/a.tar.zst'), 'recent');
  const result = pruneArtifacts({ ...options, apply: true });
  assert.ok(
    result.skipped.some(
      (x) =>
        x.path === path.join(wt, '.turbo') && x.reason === 'recently-written'
    )
  );
  assert.ok(fs.existsSync(path.join(wt, '.turbo/cache/a.tar.zst')));
});

test('symlink artifacts and symlink parents never become candidates', () => {
  const { repo, root } = makeRepo();
  const wt = addWorktree(repo, root, 'symlinks');
  const outside = path.join(root, 'outside');
  writeFile(path.join(outside, 'keep'), 'safe');
  fs.rmSync(path.join(wt, '.turbo'), { recursive: true });
  fs.symlinkSync(outside, path.join(wt, '.turbo'));
  fs.mkdirSync(path.join(outside, '.dart_tool/build'), { recursive: true });
  fs.symlinkSync(outside, path.join(wt, 'apps/mobile/.dart_tool'));
  const found = findArtifactDirs(wt);
  assert.equal(
    found.some(
      (x) => x.category === 'turbo' || x.category === 'dart-tool-build'
    ),
    false
  );
  assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'safe');
});

test('fatal check-ignore failure records a skip instead of empty success', () => {
  const { repo, root } = makeRepo();
  const wt = addWorktree(repo, root, 'ignore-failure');
  backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
  const execFile = (command, args, options) => {
    if (args.includes('check-ignore'))
      throw Object.assign(new Error('fatal'), { status: 128 });
    return execFileSync(command, args, options);
  };
  const plan = planPrune({
    repoDir: repo,
    currentDir: root,
    baseRef: 'main',
    execFile,
  });
  assert.equal(plan.candidates.length, 0);
  assert.ok(
    plan.skipped.some(
      (x) => x.path === wt && x.reason === 'check-ignore-failed'
    )
  );
});

test('HEAD change between planning and apply preserves artifacts', () => {
  const { repo, root } = makeRepo();
  const wt = addWorktree(repo, root, 'head-race');
  backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
  let changed = false;
  const execFile = (command, args, options) => {
    if (!changed && args.includes('rev-parse') && args.includes('HEAD')) {
      changed = true;
      run(wt, 'commit', '--allow-empty', '-q', '-m', 'racing commit');
    }
    return execFileSync(command, args, options);
  };
  const result = pruneArtifacts({
    repoDir: repo,
    currentDir: root,
    baseRef: 'main',
    execFile,
    apply: true,
  });
  assert.equal(changed, true);
  assert.ok(result.candidates.length > 0);
  assert.equal(result.removed.length, 0);
  assert.ok(fs.existsSync(path.join(wt, '.turbo')));
});

for (const flag of [
  '--base',
  '--worktree',
  '--holds-file',
  '--max-remove',
  '--min-idle-hours',
  '--category',
]) {
  for (const suffix of [[], ['--apply']]) {
    test(`parseArgs rejects ${flag} with ${suffix.length ? 'another option' : 'no value'}`, () => {
      assert.throws(() => parseArgs(['prune', flag, ...suffix], {}), {
        message: `${flag} requires a value.`,
      });
    });
  }
}

for (const kind of [
  'repository',
  'worktree',
  'bare',
  'artifact-root',
  'ancestor',
]) {
  test(`prune preserves nested ${kind} checkouts inside ignored artifacts`, () => {
    const { repo, root } = makeRepo();
    const wt = addWorktree(repo, root, `nested-${kind}`);
    const artifact = path.join(wt, 'apps/web/dist');
    const nested =
      kind === 'artifact-root'
        ? artifact
        : kind === 'ancestor'
          ? path.dirname(artifact)
          : path.join(artifact, 'deep/checkout');
    fs.mkdirSync(nested, { recursive: true });
    if (kind === 'worktree') {
      run(repo, 'worktree', 'add', '-q', '--detach', nested, 'main');
    } else if (kind === 'bare' || kind === 'artifact-root') {
      run(nested, 'init', '-q', '--bare');
    } else {
      run(nested, 'init', '-q');
    }
    const sentinel = path.join(
      kind === 'ancestor' ? artifact : nested,
      'keep.txt'
    );
    writeFile(sentinel, 'nested checkout data');
    backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
    const result = pruneArtifacts({
      repoDir: repo,
      currentDir: root,
      baseRef: 'main',
      apply: true,
      categories: ['dist'],
    });
    assert.equal(fs.existsSync(sentinel), true);
    assert.equal(result.removed.length, 0);
    assert.ok(result.skipped.some((x) => x.reason === 'nested-checkout'));
  });
}

for (const activity of ['cwd', 'open-file']) {
  test(`prune preserves old artifacts with a live process ${activity}`, async (t) => {
    const { repo, root } = makeRepo();
    const wt = addWorktree(repo, root, `live-${activity}`);
    const artifact = path.join(wt, '.turbo');
    const file = path.join(artifact, 'cache/a.tar.zst');
    backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      if (process.argv[1] === 'open-file') {
        global.fd = require('node:fs').openSync(process.argv[2], 'r');
      }
      process.send('ready');
      setInterval(() => {}, 1000);
    `,
        activity,
        file,
      ],
      {
        cwd: activity === 'cwd' ? path.dirname(file) : root,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      }
    );
    t.after(async () => {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('child readiness timeout')),
        5000
      );
      child.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const result = pruneArtifacts({
      repoDir: repo,
      currentDir: root,
      baseRef: 'main',
      apply: true,
      categories: ['turbo'],
    });
    assert.equal(fs.existsSync(file), true);
    assert.equal(result.removed.length, 0);
    assert.ok(
      result.skipped.some((x) => x.reason === 'in-use'),
      JSON.stringify(result.skipped)
    );
  });
}

for (const failure of [
  'missing',
  'timeout',
  'permission',
  'warning',
  'empty-success',
  'truncated',
  'signal',
]) {
  test(`prune preserves artifacts when liveness is uncertain: ${failure}`, () => {
    const { repo, root } = makeRepo();
    const wt = addWorktree(repo, root, `uncertain-${failure}`);
    backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
    const probes = [];
    const spawnFile = (command, args, options) => {
      probes.push({ command, args, options });
      return {
        status: failure === 'empty-success' || failure === 'warning' ? 0 : 1,
        signal: failure === 'signal' ? 'SIGKILL' : null,
        error: ['missing', 'timeout', 'truncated'].includes(failure)
          ? new Error(failure)
          : undefined,
        stdout: failure === 'warning' ? 'p123\nfcwd\n' : '',
        stderr: ['permission', 'warning'].includes(failure)
          ? 'lsof: incomplete scan'
          : '',
      };
    };
    const result = pruneArtifacts({
      repoDir: repo,
      currentDir: root,
      baseRef: 'main',
      apply: true,
      categories: ['turbo'],
      spawnFile,
    });
    assert.equal(fs.existsSync(path.join(wt, '.turbo/cache/a.tar.zst')), true);
    assert.equal(probes.length, 1);
    const { command, args, options } = probes[0];
    assert.equal(command, 'lsof');
    assert.ok(options.timeout > 0 && options.timeout <= 5000);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.ok(options.maxBuffer > 0 && options.maxBuffer <= 1024 * 1024);
    assert.deepEqual(args, ['-nP', '-Fpf', '+D', path.join(wt, '.turbo')]);
    assert.equal(result.removed.length, 0);
    assert.ok(result.skipped.some((x) => x.reason === 'liveness-unknown'));
  });
}

test('prune preserves a checkout created after the final preflight scan', () => {
  const { repo, root } = makeRepo();
  const wt = addWorktree(repo, root, 'late-checkout');
  const artifact = path.join(wt, '.turbo');
  const nested = path.join(artifact, 'late');
  backdateWorktree(repo, wt, Date.now() - 48 * HOUR_MS);
  const result = pruneArtifacts({
    repoDir: repo,
    currentDir: root,
    baseRef: 'main',
    apply: true,
    categories: ['turbo'],
    spawnFile() {
      run(repo, 'worktree', 'add', '-q', '--detach', nested, 'main');
      writeFile(path.join(nested, 'keep.txt'), 'late checkout data');
      return { status: 1, stdout: '', stderr: '' };
    },
  });
  assert.equal(
    fs.readFileSync(path.join(nested, 'keep.txt'), 'utf8'),
    'late checkout data'
  );
  assert.equal(result.removed.length, 0);
  assert.ok(result.skipped.some((x) => x.reason === 'nested-checkout'));
});
