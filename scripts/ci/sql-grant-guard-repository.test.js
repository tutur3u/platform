const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  resolveBase,
  baselineReference,
} = require('./sql-grant-guard-repository');
const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
test('CI fetches an absent named base and deepens a depth-two checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-grant-base-'));
  try {
    const remote = path.join(dir, 'remote.git');
    const checkout = path.join(dir, 'checkout');
    const source = path.join(dir, 'source');
    fs.mkdirSync(source);
    git(source, 'init', '--quiet');
    git(source, 'config', 'user.name', 'vhpx');
    git(source, 'config', 'user.email', 'contact@vohoangphuc.com');
    fs.mkdirSync(path.join(source, 'apps/database/supabase/migrations'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(
        source,
        'apps/database/supabase/migrations/20200101000000_fixture.sql'
      ),
      'select 1;'
    );
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'fixture base');
    const ancestor = git(source, 'rev-parse', 'HEAD');
    for (let i = 0; i < 5; i++)
      git(source, 'commit', '--allow-empty', '-m', `fixture ${i}`);
    const head = git(source, 'rev-parse', 'HEAD');
    git(source, 'clone', '--bare', source, remote);
    git(remote, 'update-ref', 'refs/heads/guard-feature', head);
    git(remote, 'update-ref', 'refs/heads/guard-base', ancestor);
    git(
      dir,
      'clone',
      '--quiet',
      '--depth=2',
      '--single-branch',
      '--branch',
      'guard-feature',
      `file://${remote}`,
      checkout
    );
    assert.throws(() =>
      git(checkout, 'rev-parse', '--verify', 'origin/guard-base')
    );
    const shallowEvent = path.join(dir, 'shallow-push.json');
    fs.writeFileSync(shallowEvent, JSON.stringify({ before: ancestor }));
    assert.equal(
      baselineReference(checkout, head, {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_EVENT_PATH: shallowEvent,
      }),
      ancestor
    );

    assert.equal(
      resolveBase(checkout, { CI: 'true', GITHUB_BASE_REF: 'guard-base' }),
      ancestor
    );
    assert.equal(
      git(checkout, 'merge-base', 'HEAD', 'origin/guard-base'),
      ancestor
    );
    // A push-to-main checkout has an empty diff but must still enforce new SQL.
    git(checkout, 'update-ref', 'refs/remotes/origin/main', head);
    const baselinePath = 'scripts/ci/sql-grant-guard.baseline.json';
    const trackedBaseline = git(
      checkout,
      'ls-tree',
      '--name-only',
      head,
      '--',
      baselinePath
    );
    const sourceSha = trackedBaseline
      ? JSON.parse(git(checkout, 'show', `${head}:${baselinePath}`)).source
      : ancestor;
    fs.mkdirSync(path.join(checkout, 'scripts/ci'), { recursive: true });
    fs.mkdirSync(path.join(checkout, 'apps/database/supabase/migrations'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(checkout, baselinePath),
      JSON.stringify({
        label: 'historical debt, not safe',
        source: sourceSha,
        files: {},
        entries: [],
      })
    );
    if (trackedBaseline) {
      const { loadBaseline } = require('./sql-grant-guard-baseline');
      assert.equal(loadBaseline(checkout, head).entries.length, 0);
    }
    const fixture =
      'apps/database/supabase/migrations/20300101000000_guard_fixture.sql';
    fs.writeFileSync(
      path.join(checkout, fixture),
      'create function public.leak() returns int language sql as $$select 1$$;'
    );
    const eventPath = path.join(dir, 'push-event.json');
    fs.writeFileSync(eventPath, JSON.stringify({ before: ancestor }));
    assert.equal(
      baselineReference(checkout, head, {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_EVENT_PATH: eventPath,
      }),
      ancestor
    );
    assert.throws(
      () => baselineReference(checkout, head, { GITHUB_EVENT_NAME: 'push' }),
      /payload is required/
    );
    const { checkRepository } = require('./sql-grant-guard');
    assert.ok(
      checkRepository(checkout, {}).violations.some(
        (f) => f.file === fixture && f.rule === 'function-acl'
      )
    );

    assert.throws(
      () =>
        resolveBase(checkout, { CI: 'true', GITHUB_BASE_REF: 'missing-base' }),
      /failed/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('a checkout without a resolvable base fails loudly rather than returning an empty scope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-grant-no-base-'));
  try {
    git(dir, 'init', '--quiet');
    assert.throws(() => resolveBase(dir, {}), /failed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
