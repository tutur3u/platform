const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  renameSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const {
  DELETION_LIMIT,
  largeDocsDeletions,
  main,
  markedPaths,
  parseArgs,
} = require('./check-docs-deletions.js');

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-deletions-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const run = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: gitEnv });
  run('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'apps/docs/build'), { recursive: true });
  const lines = (count, word = 'line') =>
    Array.from({ length: count }, (_, index) => `${word} ${index}`).join('\n') +
    '\n';
  const commit = (message) => {
    run('add', '-A');
    run('commit', '-q', '--allow-empty', '-m', message);
    return run('rev-parse', 'HEAD').trim();
  };
  // git in the fixture runs in its own directory.
  const execFile = (cmd, args, options) =>
    execFileSync(cmd, args, { ...options, cwd: dir, env: gitEnv });
  return { dir, run, lines, commit, execFile };
}

function quiet(fn) {
  const log = console.log;
  const error = console.error;
  const errors = [];
  console.log = () => {};
  console.error = (line) => errors.push(String(line));
  try {
    return { code: fn(), errors };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('numstat parsing counts only large deletions under apps/docs', () => {
  assert.deepEqual(
    largeDocsDeletions(
      [
        `0\t${DELETION_LIMIT + 1}\tapps/docs/a.mdx`,
        `0\t${DELETION_LIMIT}\tapps/docs/b.mdx`,
        `0\t900\tapps/web/c.ts`,
        '-\t-\tapps/docs/image.png',
        `3\t${DELETION_LIMIT + 9}\t`,
        'apps/docs/old name.mdx',
        'apps/docs/new name.mdx',
        `0\t${DELETION_LIMIT + 2}\t`,
        'apps/docs/out.mdx',
        'docs-internal/out.mdx',
        '',
      ].join('\0')
    ),
    [
      { path: 'apps/docs/a.mdx', deleted: DELETION_LIMIT + 1 },
      { path: 'apps/docs/new name.mdx', deleted: DELETION_LIMIT + 9 },
      { path: 'docs-internal/out.mdx', deleted: DELETION_LIMIT + 2 },
    ]
  );
});

test('markers must be whole trailer lines naming the path', () => {
  assert.deepEqual(
    [
      ...markedPaths(
        'fix: x\n\nDocs-Deletion: apps/docs/a.mdx\nsee Docs-Deletion: apps/docs/b.mdx\n'
      ),
    ],
    ['apps/docs/a.mdx']
  );
});

test('arguments require exactly one selector', () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(['--base', 'a', '--commit', 'b']));
  assert.throws(() => parseArgs(['--base']));
  assert.deepEqual(parseArgs(['--range', 'a..b']), {
    base: null,
    range: 'a..b',
    commit: null,
  });
});

test('an unmarked large docs deletion fails and a marked one passes', (t) => {
  const { dir, lines, commit, execFile } = repo(t);
  const page = join(dir, 'apps/docs/build/page.mdx');
  writeFileSync(page, lines(DELETION_LIMIT + 50));
  const base = commit('docs: add page');

  writeFileSync(page, lines(10));
  const unmarked = commit('docs: trim page');
  const failed = quiet(() => main(['--commit', unmarked], execFile));
  assert.equal(failed.code, 1);
  assert.match(failed.errors.join('\n'), /apps\/docs\/build\/page\.mdx/);
  assert.equal(quiet(() => main(['--base', base], execFile)).code, 1);

  writeFileSync(page, lines(DELETION_LIMIT + 50));
  commit('docs: restore page');
  unlinkSync(page);
  const marked = commit(
    'docs: retire page\n\nDocs-Deletion: apps/docs/build/page.mdx'
  );
  assert.equal(quiet(() => main(['--commit', marked], execFile)).code, 0);
});

test('renames and small or non-docs deletions pass', (t) => {
  const { dir, run, lines, commit, execFile } = repo(t);
  const page = join(dir, 'apps/docs/build/page.mdx');
  writeFileSync(page, lines(DELETION_LIMIT + 50));
  writeFileSync(join(dir, 'big.ts'), lines(DELETION_LIMIT + 50));
  const base = commit('chore: seed');
  renameSync(page, join(dir, 'apps/docs/build/moved.mdx'));
  commit('docs: move page');
  writeFileSync(join(dir, 'apps/docs/build/moved.mdx'), lines(DELETION_LIMIT));
  commit('docs: trim a little');
  writeFileSync(join(dir, 'big.ts'), '');
  commit('chore: empty source');
  assert.equal(quiet(() => main(['--base', base], execFile)).code, 0);
});

test('a renamed page that loses many lines needs a marker for its new path', (t) => {
  const { dir, run, lines, commit, execFile } = repo(t);
  const page = join(dir, 'apps/docs/build/page.mdx');
  const full = lines(3 * DELETION_LIMIT);
  writeFileSync(page, full);
  commit('docs: add page');
  unlinkSync(page);
  // Keep 60% so git still pairs the rename while 600 lines go.
  writeFileSync(
    join(dir, 'apps/docs/build/moved.mdx'),
    `${full
      .split('\n')
      .slice(0, 2 * DELETION_LIMIT - 100)
      .join('\n')}\n`
  );
  const unmarked = commit('docs: move and trim page');
  assert.equal(quiet(() => main(['--commit', unmarked], execFile)).code, 1);
  run(
    'commit',
    '-q',
    '--amend',
    '-m',
    'docs: move and trim page\n\nDocs-Deletion: apps/docs/build/moved.mdx'
  );
  const marked = run('rev-parse', 'HEAD').trim();
  assert.equal(quiet(() => main(['--commit', marked], execFile)).code, 0);
});

test('a merge that drops docs content is checked against its first parent', (t) => {
  const { dir, run, lines, commit, execFile } = repo(t);
  const page = join(dir, 'apps/docs/build/page.mdx');
  writeFileSync(page, lines(DELETION_LIMIT + 50));
  const base = commit('docs: add page');
  run('checkout', '-q', '-b', 'side');
  writeFileSync(join(dir, 'side.txt'), 'side\n');
  commit('chore: side work');
  run('checkout', '-q', 'main');
  writeFileSync(join(dir, 'main.txt'), 'main\n');
  commit('chore: main work');
  run('merge', '-q', '--no-ff', '--no-commit', 'side');
  writeFileSync(page, lines(5));
  run('add', '-A');
  run('commit', '-q', '-m', 'merge side');
  assert.equal(quiet(() => main(['--base', base], execFile)).code, 1);
});

test('a merge does not recount a deletion its branch already marked', (t) => {
  const { dir, run, lines, commit, execFile } = repo(t);
  const page = join(dir, 'apps/docs/build/page.mdx');
  writeFileSync(page, lines(DELETION_LIMIT + 100));
  const base = commit('docs: add page');
  run('checkout', '-q', '-b', 'side');
  writeFileSync(page, lines(10));
  commit('docs: trim page\n\nDocs-Deletion: apps/docs/build/page.mdx');
  run('checkout', '-q', 'main');
  writeFileSync(join(dir, 'main.txt'), 'main\n');
  commit('chore: main work');
  run('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  assert.equal(quiet(() => main(['--base', base], execFile)).code, 0);
});
