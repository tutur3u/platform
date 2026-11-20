const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  directDependents,
  maxScopedRoots,
  outputs,
  resolvePushScope,
  scanRoot,
  selectScope,
} = require('./codeql-push-scope.js');

const everyLanguage = ['actions', 'javascript-typescript', 'python'];

test('scan roots are workspaces, top-level directories or root files', () => {
  assert.equal(scanRoot('apps/meet/src/app/api/x/route.ts'), 'apps/meet');
  assert.equal(scanRoot('packages/auth/src/session.ts'), 'packages/auth');
  assert.equal(scanRoot('scripts/ci/codeql-push-scope.js'), 'scripts');
  assert.equal(scanRoot('oxlint.config.ts'), 'oxlint.config.ts');
  assert.equal(scanRoot('apps/@scope/x.ts'), 'apps/@scope');
  assert.equal(scanRoot('.github/scripts/x.js'), '.github');
  // Next.js route segments below the workspace never reach the filter.
  assert.equal(
    scanRoot('apps/web/src/app/api/v1/admin/qa/test-users/[userId]/route.ts'),
    'apps/web'
  );
  assert.equal(
    scanRoot('apps/web/src/app/(dashboard)/[wsId]/page.tsx'),
    'apps/web'
  );
  assert.equal(scanRoot('scripts/[x]/a.js'), 'scripts');
  assert.equal(scanRoot(' apps/web/x.ts'), null);
  assert.equal(selectScope([' apps/web/x.ts']).full, true);
  for (const unsafe of [
    'apps/../x.ts',
    'apps/*/x.ts',
    'apps/a b/x.ts',
    'apps/x\ny/z.ts',
    '/abs.ts',
    './x.ts',
    'apps/./x.ts',
  ])
    assert.equal(scanRoot(unsafe), null, JSON.stringify(unsafe));
});

test('JavaScript scans narrow to touched workspaces; other languages stay whole', () => {
  assert.deepEqual(
    selectScope([
      'apps/meet/src/a.ts',
      'apps/meet/src/b.tsx',
      'packages/auth/src/c.ts',
      'apps/discord/main.py',
      'docs/readme.md',
    ]),
    {
      full: false,
      languages: ['javascript-typescript', 'python'],
      paths: ['apps/meet', 'packages/auth'],
      reason: '2 workspace(s) in scope',
    }
  );
  const pythonOnly = selectScope(['apps/discord/main.py']);
  assert.deepEqual(pythonOnly.languages, ['python']);
  assert.deepEqual(pythonOnly.paths, []);
  assert.deepEqual(selectScope(['docs/a.md']).languages, []);
  assert.equal(
    selectScope(['.github/workflows/x.yaml']).languages[0],
    'actions'
  );
});

test('unknown, unsafe or broad change sets select the full scan', () => {
  for (const files of [[], null, ['apps/a b/x.ts']]) {
    const scope = selectScope(files);
    assert.equal(scope.full, true);
    assert.deepEqual(scope.languages, everyLanguage);
    assert.deepEqual(scope.paths, []);
  }
  const broad = Array.from(
    { length: maxScopedRoots + 1 },
    (_, index) => `packages/p${index}/index.ts`
  );
  assert.equal(selectScope(broad).full, true);
  // A full scope emits no paths filter, so the analysis stays whole.
  assert.ok(outputs(selectScope([])).includes('codeql_paths='));
  assert.ok(
    outputs(selectScope(['apps/meet/a.ts'])).includes(
      'codeql_paths=["apps/meet"]'
    )
  );
});

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-push-scope-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ci@example.invalid');
  git('config', 'user.name', 'ci');
  const commit = (files, message) => {
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(dir, name);
      if (content === null) {
        fs.rmSync(target);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { commit, dir };
}

const runsFetcher =
  (runs, calls = []) =>
  async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ workflow_runs: runs }) };
  };
const run = (sha, extra = {}) => ({
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  conclusion: 'success',
  repository: { full_name: 'tutur3u/platform' },
  head_repository: { full_name: 'tutur3u/platform' },
  ...extra,
});

test('a push diffs from the last successful push scan, covering replaced commits', async (t) => {
  const { commit, dir } = repo(t);
  const scanned = commit({ 'apps/web/a.ts': '1' }, 'scanned');
  // Its pending scan was replaced by the next push.
  const replaced = commit({ 'packages/auth/b.ts': '1' }, 'replaced');
  const head = commit({ 'apps/meet/c.ts': '1' }, 'head');
  const calls = [];
  const scope = await resolvePushScope({
    fetcher: runsFetcher(
      [
        run(head),
        run('f'.repeat(40)),
        run(replaced, { conclusion: 'cancelled' }),
        run(replaced, { head_repository: { full_name: 'fork/platform' } }),
        run(scanned),
      ],
      calls
    ),
    headSha: head,
    repo: 'tutur3u/platform',
    rootDir: dir,
    token: 'disposable-test-token',
  });
  assert.match(calls[0], /workflows\/codeql\.yml\/runs\?/u);
  assert.match(calls[0], /status=success/u);
  assert.equal(scope.baseSha, scanned);
  assert.deepEqual(scope.paths, ['apps/meet', 'packages/auth']);
  assert.equal(scope.full, false);
});

test('missing or failed scan history selects the full scan, never a narrower range', async (t) => {
  const { commit, dir } = repo(t);
  commit({ 'apps/web/a.ts': '1' }, 'before');
  const head = commit({ 'apps/meet/c.ts': '1' }, 'head');
  for (const fetcher of [
    async () => ({ ok: false, status: 502 }),
    async () => {
      throw new Error('timeout');
    },
    async () => ({ ok: true, json: async () => ({}) }),
    // Only a scanned commit off the pushed line.
    runsFetcher([run('e'.repeat(40))]),
    runsFetcher([]),
  ]) {
    const scope = await resolvePushScope({
      fetcher,
      headSha: head,
      repo: 'tutur3u/platform',
      rootDir: dir,
      token: 'disposable-test-token',
    });
    assert.equal(scope.full, true, scope.reason);
    assert.deepEqual(scope.languages, everyLanguage);
  }
  for (const args of [
    { headSha: 'HEAD' },
    { headSha: head },
    { headSha: head, token: 'disposable-test-token' },
  ])
    assert.equal(
      (
        await resolvePushScope({
          ...args,
          rootDir: dir,
          fetcher: runsFetcher([]),
        })
      ).full,
      true
    );
});

test('deletions scan their surviving workspace and touched packages add direct dependents', async (t) => {
  const { commit, dir } = repo(t);
  const manifest = (name, dependencies = {}) =>
    JSON.stringify({ name, dependencies });
  const scanned = commit(
    {
      'apps/meet/package.json': manifest('meet', { '@t/utils': '*' }),
      'apps/meet/src/sanitize.ts': '1',
      'apps/meet/src/page.ts': '1',
      'apps/web/package.json': manifest('web', { '@t/ui': '*' }),
      'apps/web/a.ts': '1',
      'apps/gone/x.ts': '1',
      'packages/utils/package.json': manifest('@t/utils'),
      'packages/utils/index.ts': '1',
      'packages/ui/package.json': manifest('@t/ui', { '@t/utils': '*' }),
      'packages/ui/index.ts': '1',
    },
    'scanned'
  );
  const deletion = commit(
    { 'apps/meet/src/sanitize.ts': null, 'apps/gone/x.ts': null },
    'delete'
  );
  const deleted = await resolvePushScope({
    fetcher: runsFetcher([run(scanned)]),
    headSha: deletion,
    repo: 'tutur3u/platform',
    rootDir: dir,
    token: 'disposable-test-token',
  });
  assert.equal(deleted.full, false);
  assert.deepEqual(deleted.paths, ['apps/meet']);
  assert.deepEqual(deleted.languages, ['javascript-typescript']);

  const helper = commit({ 'packages/utils/index.ts': '2' }, 'helper');
  const scope = await resolvePushScope({
    fetcher: runsFetcher([run(deletion)]),
    headSha: helper,
    repo: 'tutur3u/platform',
    rootDir: dir,
    token: 'disposable-test-token',
  });
  // Direct dependents only: apps/web reaches utils through packages/ui.
  assert.deepEqual(scope.paths, ['apps/meet', 'packages/ui', 'packages/utils']);
});

test('dependents beyond the scoped ceiling are deferred to the nightly scan', () => {
  const manifests = new Map([['packages/core', { name: '@t/core' }]]);
  for (let index = 0; index < maxScopedRoots; index += 1)
    manifests.set(`apps/a${index}`, {
      name: `a${index}`,
      dependencies: { '@t/core': '*' },
    });
  assert.equal(
    directDependents(new Set(['packages/core']), manifests).size,
    maxScopedRoots
  );
  assert.equal(directDependents(new Set(['apps/a0']), manifests).size, 0);
  const scope = selectScope(['packages/core/index.ts'], { manifests });
  assert.equal(scope.full, false);
  assert.deepEqual(scope.paths, ['packages/core']);
  assert.match(scope.reason, /30 dependents deferred to the nightly scan/u);
  // Too many directly touched workspaces still selects the full scan.
  const touched = Array.from(
    { length: maxScopedRoots + 1 },
    (_, index) => `apps/a${index}/x.ts`
  );
  assert.equal(selectScope(touched, { manifests }).full, true);
});
