const assert = require('node:assert/strict');
const test = require('node:test');
const { readLock, validateWorkspaceLock } = require('./release-workspace-lock');
const {
  buildAllowedPaths,
  evaluateReleasePullRequest,
} = require('./release-please-auto-approve-core');
const {
  autoApproveReleasePullRequest,
  GitHubClient,
} = require('./release-please-auto-approve');
const before = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "root", "version": "1.0.0", },
    "apps/thing": { "name": "thing", "version": "1.0.0", "dependencies": { "dep": "1" }, },
  },
  "packages": { "dep": ["dep@1", "", {}, "sha512-old"] },
}\n`;
const after = before.replace(
  '"thing", "version": "1.0.0"',
  '"thing", "version": "2.0.0"'
);
const packages = () => ({ version: '2.0.0' });
const config = { packages: { 'apps/thing': {} } };
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const pull = {
  state: 'open',
  number: 1,
  draft: false,
  base: { ref: 'production', sha: base },
  head: { ref: 'release-please--branches--production', sha: head },
  user: { login: 'github-actions[bot]', type: 'Bot' },
};
const commit = {
  sha: head,
  author: { login: pull.user.login },
  commit: { message: 'chore(release): release production' },
};

// Guards preserve bytes as well as dependency semantics, including JSONC syntax.
test('accepts only final manifest workspace-version string replacements', () => {
  assert.deepEqual(validateWorkspaceLock(before, after, packages), [
    'apps/thing',
  ]);
  assert.deepEqual(validateWorkspaceLock(before, before, packages), []);
  assert.equal(
    readLock(before).parsed.workspaces['apps/thing'].version,
    '1.0.0'
  );
});
for (const [kind, mutate] of Object.entries({
  dependency: (text) => text.replace('"dep": "1"', '"dep": "2"'),
  resolution: (text) => text.replace('dep@1', 'dep@2'),
  checksum: (text) => text.replace('sha512-old', 'sha512-new'),
  name: (text) => text.replace('"name": "thing"', '"name": "other"'),
  addition: (text) =>
    text.replace('"apps/thing":', '"apps/extra": {}, "apps/thing":'),
  removal: (text) => text.replace('"apps/thing":', '"removed/thing":'),
  nestedVersion: (text) =>
    text.replace('"dependencies": {', '"dependencies": { "version": "2",'),
  rootVersion: (text) =>
    text.replace('"root", "version": "1.0.0"', '"root", "version": "2.0.0"'),
  formatting: (text) =>
    text.replace('  "lockfileVersion"', ' "lockfileVersion"'),
  removedVersion: (text) =>
    text.replace('"name": "thing", "version": "2.0.0", ', '"name": "thing", '),
})) {
  test(`rejects ${kind} spill`, () =>
    assert.throws(() =>
      validateWorkspaceLock(before, mutate(after), packages)
    ));
}
test('rejects package mismatch and malformed or duplicate JSONC', () => {
  assert.throws(
    () => validateWorkspaceLock(before, after, () => ({ version: '3' })),
    /mismatch/
  );
  for (const text of [
    '{',
    '{}garbage',
    '{"workspaces":{},"workspaces":{}}',
    '{/*bad',
  ])
    assert.throws(() => readLock(text));
});
test('does not execute JS expressions or swallow commas inside strings', () => {
  assert.throws(() => readLock('{"workspaces": {}, "x": (()=>1)()}'));
  const text = before.replace('sha512-old', 'comma,} /* not a comment */');
  assert.deepEqual(validateWorkspaceLock(text, text, packages), []);
});
test('lock is conditional while ordinary allowlist and author gates stay narrow', () => {
  const allowedPaths = buildAllowedPaths(config);
  assert.equal(allowedPaths.has('bun.lock'), false);
  const input = {
    allowedPaths,
    files: [{ filename: 'bun.lock' }],
    commits: [commit],
    pullRequest: pull,
    targetBranch: 'production',
  };
  assert.equal(evaluateReleasePullRequest(input).approve, false);
  assert.equal(
    evaluateReleasePullRequest({ ...input, verifiedWorkspaceLock: true })
      .approve,
    true
  );
  assert.equal(
    evaluateReleasePullRequest({
      ...input,
      verifiedWorkspaceLock: true,
      files: [{ filename: 'runtime.js' }],
    }).approve,
    false
  );
  assert.equal(
    evaluateReleasePullRequest({
      ...input,
      verifiedWorkspaceLock: true,
      commits: [{ ...commit, author: { login: 'human' } }],
    }).approve,
    false
  );
});
function githubFixture({
  changedHead = false,
  changedBase = false,
  lock = after,
  author = commit.author,
  failRead = false,
} = {}) {
  let reads = 0;
  const fetched = [];
  const approvals = [];
  return {
    fetched,
    approvals,
    findReleasePullRequest: async () =>
      ++reads > 1 && (changedHead || changedBase)
        ? {
            ...pull,
            ...(changedBase
              ? {
                  base: {
                    ...pull.base,
                    sha: changedHead ? 'c'.repeat(40) : head,
                  },
                }
              : {}),
            head: { ...pull.head, sha: changedHead ? 'c'.repeat(40) : head },
          }
        : pull,
    listAll: async (route) =>
      route === 'commits'
        ? [{ ...commit, author }]
        : [{ filename: 'bun.lock' }],
    readFileAt: async (file, sha) => {
      fetched.push([file, sha]);
      if (failRead) throw new Error('Unavailable');
      return file === 'bun.lock'
        ? sha === base
          ? before
          : lock
        : JSON.stringify(packages());
    },
    listReviews: async () => [],
    approve: async (...args) => approvals.push(args),
  };
}
test('independently validates immutable file bodies and pins approval', async () => {
  const github = githubFixture();
  const result = await autoApproveReleasePullRequest({
    config,
    github,
    targetBranch: 'production',
  });
  assert.equal(result.status, 'approved');
  assert.deepEqual(github.fetched, [
    ['bun.lock', base],
    ['bun.lock', head],
    ['apps/thing/package.json', head],
  ]);
  assert.equal(github.approvals[0][2], head);
});
for (const options of [
  { changedHead: true },
  { changedBase: true },
  { author: { login: 'human' } },
  { lock: after.replace('sha512-old', 'changed') },
  { failRead: true },
]) {
  test(`does not approve invalid or stale independent evidence ${JSON.stringify(options)}`, async () => {
    const github = githubFixture(options);
    const result = await autoApproveReleasePullRequest({
      config,
      github,
      targetBranch: 'production',
    });
    assert.equal(result.status, 'skipped');
    assert.equal(github.approvals.length, 0);
  });
}
test('GitHub review API includes exact validated head rather than latest-head default', async () => {
  const github = new GitHubClient({ repository: 'test/repo', token: 'test' });
  let args;
  github.request = async (...values) => {
    args = values;
  };
  await github.approve(1, 'generated', head);
  assert.equal(args[2].body.commit_id, head);
  await assert.rejects(
    github.readFileAt('bun.lock', 'production'),
    /Immutable/
  );
});

test('git validator rejects authored paths before a workspace metadata repair', () => {
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { validateGitWorkspaceLock } = require('./release-workspace-lock');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-lock-guard-'));
  const previous = process.cwd();
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    fs.mkdirSync(path.join(root, 'apps/thing'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'release-please-config.json'),
      JSON.stringify(config)
    );
    fs.writeFileSync(path.join(root, 'bun.lock'), before);
    fs.writeFileSync(
      path.join(root, 'apps/thing/package.json'),
      JSON.stringify({ version: '1.0.0' })
    );
    git('init', '--quiet');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const baseRef = git('rev-parse', 'HEAD').toString().trim();
    fs.writeFileSync(
      path.join(root, 'apps/thing/package.json'),
      JSON.stringify(packages())
    );
    git('add', 'apps/thing/package.json');
    git('commit', '--quiet', '-m', 'generated');
    fs.writeFileSync(path.join(root, 'bun.lock'), after);
    process.chdir(root);
    assert.deepEqual(validateGitWorkspaceLock(baseRef, 'HEAD', true), [
      'apps/thing',
    ]);
    fs.writeFileSync(path.join(root, 'runtime.js'), 'module.exports = true;');
    // Nonignored untracked files must fail without being staged by the guard.
    assert.throws(
      () => validateGitWorkspaceLock(baseRef, 'HEAD', true),
      /non-generated/
    );
    assert.equal(
      git('ls-files', '--error-unmatch', 'bun.lock').toString().trim(),
      'bun.lock'
    );
    assert.equal(git('diff', '--cached', '--name-only').toString(), '');
    git('add', 'runtime.js');
    // Staged changes must not evade the working-tree formatter guard.
    assert.throws(
      () => validateGitWorkspaceLock(baseRef, 'HEAD', true),
      /non-generated/
    );
  } finally {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
