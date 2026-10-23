const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { generate } = require('../generate-docs-inventory');
const {
  DOCS_PATH,
  refreshVersions,
  refreshGitVersions,
  verifyGitVersions,
} = require('./release-docs-inventory');
const { validateGitWorkspaceLock } = require('./release-workspace-lock');
const {
  evaluateReleasePullRequest,
  buildAllowedPaths,
} = require('./release-please-auto-approve-core');
const {
  autoApproveReleasePullRequest,
} = require('./release-please-auto-approve');
const repo = path.resolve(__dirname, '../..');
const write = (root, file, value) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(
    path.join(root, file),
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-docs-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'package.json', {
    packageManager: 'bun@1.4.1',
    engines: { node: '24' },
  });
  write(root, 'bun.lock', { workspaces: {}, packages: {} });
  for (const name of ['one', 'two', 'utils'])
    write(root, `packages/${name}/package.json`, {
      name,
      version: name === 'two' ? '7.4.0' : '1.0.0',
    });
  write(root, 'packages/utils/src/seo-policy.json', {});
  write(
    root,
    'packages/utils/src/platform-release.ts',
    "export const TUTURUUU_PLATFORM_VERSION = '0.67.0';\n"
  );
  write(
    root,
    'apps/mobile/pubspec.yaml',
    'version: 1.0.0\nsdk: 3\nflutter: 3\n'
  );
  write(
    root,
    'apps/mobile/pubspec.lock',
    'packages:\n  thing:\n    version: "1.0.0"\nsdks:\n'
  );
  write(
    root,
    'apps/discord/pyproject.toml',
    'version = "1.0.0"\nrequires-python = ">=3"\n'
  );
  write(
    root,
    'apps/discord/uv.lock',
    '[[package]]\nname = "thing"\nversion = "1.0.0"\n'
  );
  write(root, 'apps/docs/mintlify-version.json', { version: '4' });
  write(root, 'apps/docs/docs.json', {
    navigation: { group: 'Reference', pages: [] },
  });
  for (const file of [
    'scripts/generate-docs-inventory.js',
    'scripts/paused-runtimes.js',
  ])
    write(root, file, fs.readFileSync(path.join(repo, file), 'utf8'));
  write(root, 'release-please-config.json', {
    packages: {
      '.': {
        'version-file': 'platform-version.txt',
        'extra-files': ['packages/utils/src/platform-release.ts'],
      },
      'packages/one': {},
      'packages/two': {},
    },
  });
  generate({ root });
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'chore(release): release fixture');
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  return { root, git, commit, base };
}
function bump(root, version, one = '1.0.0', two = '7.4.0') {
  write(
    root,
    'packages/utils/src/platform-release.ts',
    `export const TUTURUUU_PLATFORM_VERSION = '${version}';\n`
  );
  write(root, 'packages/one/package.json', { name: 'one', version: one });
  write(root, 'packages/two/package.json', { name: 'two', version: two });
}

test('platform and independently released package changes derive exact full bytes, twice idempotently', (t) => {
  const { root } = fixture(t);
  bump(root, '0.67.1', '2.3.0', '8.0.1');
  assert.equal(refreshVersions(root), true);
  const output = fs.readFileSync(path.join(root, DOCS_PATH), 'utf8');
  assert.match(output, /Platform release \| `0\.67\.1`/);
  assert.match(output, /`one` \| `2\.3\.0`/);
  assert.match(output, /`two` \| `8\.0\.1`/);
  assert.equal(refreshVersions(root), false);
  assert.deepEqual(generate({ root, check: true }), []);
});
test('only the versions page may be refreshed; unrelated stale output fails without writes', (t) => {
  const { root } = fixture(t);
  bump(root, '0.67.1');
  const before = fs.readFileSync(path.join(root, DOCS_PATH));
  write(root, 'apps/docs/reference/repository/catalog.mdx', 'tampered');
  assert.throws(() => refreshVersions(root), /Unrelated/);
  assert.deepEqual(fs.readFileSync(path.join(root, DOCS_PATH)), before);
});
test('immutable previous normalized head permits an automatic 0.67.1 to 0.67.2 update', (t) => {
  const { root, base, commit } = fixture(t);
  bump(root, '0.67.1');
  refreshVersions(root);
  const previous = commit();
  bump(root, '0.67.2', '2.0.0');
  const next = commit();
  assert.throws(
    () => refreshGitVersions(root, base, next),
    /Missing immutable/
  );
  assert.equal(refreshGitVersions(root, base, next, previous), true);
  const normalized = commit();
  assert.equal(verifyGitVersions(root, base, normalized).headSha, normalized);
  assert.equal(refreshGitVersions(root, base, normalized, previous), false);
  const cwd = process.cwd();
  try {
    process.chdir(root);
    assert.deepEqual(validateGitWorkspaceLock(base, normalized), []);
  } finally {
    process.chdir(cwd);
  }
});
test('tampered previous provenance, source changes and malformed refs fail closed', (t) => {
  const { root, base, commit } = fixture(t);
  bump(root, '0.67.1');
  refreshVersions(root);
  write(root, DOCS_PATH, 'tampered previous page');
  const previous = commit();
  bump(root, '0.67.2');
  const next = commit();
  assert.throws(
    () => refreshGitVersions(root, base, next, previous),
    /differs/
  );
  assert.throws(
    () => refreshGitVersions(root, base, next, 'production'),
    /immutable/
  );
  write(root, 'scripts/paused-runtimes.js', 'module.exports = {}');
  const foreign = commit();
  assert.throws(
    () => verifyGitVersions(root, base, foreign),
    /unexpected|Untrusted/
  );
});
test('auto-approval requires exact docs proof and revalidates head/base before any approval', async () => {
  const base = 'b'.repeat(40),
    head = 'a'.repeat(40);
  const pull = {
    state: 'open',
    number: 1,
    base: { ref: 'production', sha: base },
    head: { ref: 'release-please--branches--production', sha: head },
    user: { login: 'github-actions[bot]', type: 'Bot' },
  };
  const commits = [
    {
      author: { login: pull.user.login },
      commit: { message: 'chore(release): release production' },
    },
  ];
  const files = [{ filename: DOCS_PATH }];
  const args = {
    allowedPaths: buildAllowedPaths({}),
    pullRequest: pull,
    commits,
    files,
    targetBranch: 'production',
  };
  assert.equal(evaluateReleasePullRequest(args).approve, false);
  assert.equal(
    evaluateReleasePullRequest({ ...args, verifiedDocsInventory: true })
      .approve,
    true
  );
  assert.equal(
    evaluateReleasePullRequest({
      ...args,
      verifiedDocsInventory: true,
      files: [{ filename: 'apps/docs/other.mdx' }],
    }).approve,
    false
  );
  let calls = 0,
    approved = 0,
    proofs = 0;
  const github = {
    findReleasePullRequest: async () =>
      ++calls === 1
        ? pull
        : { ...pull, head: { ...pull.head, sha: 'c'.repeat(40) } },
    listAll: async (type) => (type === 'commits' ? commits : files),
    verifyDocsInventory: async (a, b) => {
      assert.equal(a, base);
      assert.equal(b, head);
      proofs++;
    },
    approve: async () => {
      approved++;
    },
  };
  assert.equal(
    (
      await autoApproveReleasePullRequest({
        config: {},
        github,
        targetBranch: 'production',
      })
    ).status,
    'skipped'
  );
  assert.equal(proofs, 1);
  assert.equal(approved, 0);
  github.findReleasePullRequest = async () => pull;
  github.verifyDocsInventory = async () => {
    throw new Error('tampered exact docs');
  };
  await assert.rejects(
    autoApproveReleasePullRequest({
      config: {},
      github,
      targetBranch: 'production',
    }),
    /tampered/
  );
  assert.equal(approved, 0);
});

test('actual release helper integration regenerates merged workspace versions before validation/commit', (t) => {
  const { root } = fixture(t);
  const { finalizeMerge } = require('../git-release-please');
  bump(root, '0.67.0', '3.1.0', '9.2.1');
  const calls = [];
  finalizeMerge({
    ensureCleanMerge: () => {},
    format: false,
    stagedFilesProvider: () => [DOCS_PATH],
    runCommand: (command, args) => {
      calls.push([command, args]);
      if (command === 'bun' && args[0] === 'release:sync-platform-version')
        bump(root, '0.67.2', '3.1.0', '9.2.1');
      if (command === 'node')
        execFileSync(
          process.execPath,
          [path.join(repo, args[0]), ...args.slice(1)],
          { cwd: root }
        );
      if (
        (command === 'bun' && args[0] === 'validate') ||
        (command === 'git' && args[0] === 'commit')
      ) {
        const docs = fs.readFileSync(path.join(root, DOCS_PATH), 'utf8');
        assert.match(docs, /Platform release \| `0\.67\.2`/);
        assert.match(docs, /`one` \| `3\.1\.0`/);
        assert.match(docs, /`two` \| `9\.2\.1`/);
      }
    },
  });
  assert.equal(calls.filter(([command]) => command === 'node').length, 1);
});

test('normal lease push rejects a concurrent release branch update without replacing it', (t) => {
  const { root, git, base, commit } = fixture(t);
  const remote = path.join(root, '..', `${path.basename(root)}-remote.git`);
  t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  git('remote', 'add', 'origin', remote);
  git(
    'push',
    'origin',
    `${base}:refs/heads/release-please--branches--production`
  );
  bump(root, '0.67.1');
  refreshVersions(root);
  const concurrent = commit();
  git(
    'push',
    'origin',
    `${concurrent}:refs/heads/release-please--branches--production`
  );
  bump(root, '0.67.2');
  refreshVersions(root);
  const candidate = commit();
  assert.throws(() =>
    git(
      'push',
      'origin',
      `${candidate}:refs/heads/release-please--branches--production`,
      `--force-with-lease=refs/heads/release-please--branches--production:${base}`
    )
  );
  assert.equal(
    git(
      'ls-remote',
      '--heads',
      'origin',
      'release-please--branches--production'
    ).split(/\s/)[0],
    concurrent
  );
});

test('exact target branch and immutable docs verification reject foreign release refs', async () => {
  const pullRequest = {
    state: 'open',
    base: { ref: 'production' },
    head: { ref: 'release-please--branches--staging' },
    user: { login: 'github-actions[bot]', type: 'Bot' },
  };
  assert.equal(
    evaluateReleasePullRequest({
      allowedPaths: new Set(),
      pullRequest,
      targetBranch: 'production',
      commits: [
        {
          author: { login: pullRequest.user.login },
          commit: { message: 'chore(release): release production' },
        },
      ],
      files: [{ filename: DOCS_PATH }],
      verifiedDocsInventory: true,
    }).approve,
    false
  );
  const { GitHubClient } = require('./release-please-auto-approve');
  const client = new GitHubClient({ repository: 'tutur3u/platform' });
  await assert.rejects(
    client.verifyDocsInventory('production', 'a'.repeat(40)),
    /Immutable/
  );
});

test('inventory snapshot rejects symlinked inputs rather than reading outside its owned root', (t) => {
  const { root, base, commit } = fixture(t);
  fs.unlinkSync(path.join(root, 'packages/one/package.json'));
  fs.symlinkSync('/etc/passwd', path.join(root, 'packages/one/package.json'));
  const head = commit();
  assert.throws(() => verifyGitVersions(root, base, head), /Non-regular/);
});

test('an independent package release preserves unrelated package/platform versions', (t) => {
  const { root } = fixture(t);
  write(root, 'packages/one/package.json', { name: 'one', version: '2.0.1' });
  assert.equal(refreshVersions(root), true);
  const output = fs.readFileSync(path.join(root, DOCS_PATH), 'utf8');
  assert.match(output, /Platform release \| `0\.67\.0`/);
  assert.match(output, /`one` \| `2\.0\.1`/);
  assert.match(output, /`two` \| `7\.4\.0`/);
  assert.deepEqual(generate({ root, check: true }), []);
});

test('navigation or dependency drift is not silently repaired by a release refresh', (t) => {
  const { root } = fixture(t);
  const before = fs.readFileSync(path.join(root, DOCS_PATH));
  write(root, 'apps/docs/docs.json', {
    navigation: { group: 'Reference', pages: [] },
  });
  assert.throws(() => refreshVersions(root), /Unrelated.*docs.json/);
  assert.deepEqual(fs.readFileSync(path.join(root, DOCS_PATH)), before);
});

test('release normalization captures prior immutable provenance and stages only verified inventory bytes', () => {
  const workflow = fs.readFileSync(
    path.join(repo, '.github/workflows/release-please.yaml'),
    'utf8'
  );
  const capture = workflow.indexOf('Capture previous generated release head');
  const create = workflow.indexOf('Create or update release PR');
  assert.ok(capture > 0 && capture < create);
  assert.match(
    workflow,
    /PREVIOUS_RELEASE_SHA: \$\{\{ steps\.previous-release\.outputs\.sha \}\}/
  );
  assert.match(workflow, /cp -R scripts "\$\{trusted_scripts\}\/scripts"/);
  assert.match(
    workflow,
    /release-docs-inventory\.js" --refresh origin\/production HEAD "\$\{PREVIOUS_RELEASE_SHA\}"/
  );
  assert.match(
    workflow,
    /changed_files\+=\(apps\/docs\/reference\/repository\/versions\.mdx\)/
  );
  const lock = workflow.indexOf('bun install --lockfile-only --ignore-scripts');
  const derived = workflow.indexOf(
    'release-docs-inventory.js" --refresh',
    lock
  );
  const guard = workflow.indexOf(
    'release-workspace-lock.js" origin/production HEAD --working',
    derived
  );
  const amend = workflow.indexOf('git commit --amend --no-edit', guard);
  assert.ok(lock < derived && derived < guard && guard < amend);
  assert.match(
    workflow,
    /--force-with-lease="refs\/heads\/\$\{RELEASE_BRANCH\}:\$\{release_sha\}"/
  );
  assert.doesNotMatch(workflow, /git add (?:--all|apps\/docs\/)/);
});
