import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { parseLog, readCitedCommits, readCommits } from './commit-log.mjs';

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), 'roadmap-commits-'));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Dev');
  git('config', 'user.email', 'dev@example.com');
  git('config', 'commit.gpgsign', 'false');
  const commit = (subject, file, date) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), subject);
    git('add', '.');
    spawnSync('git', ['commit', '-q', '-m', subject], {
      cwd,
      env: { ...env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    });
    return git('rev-parse', 'HEAD');
  };
  return { cwd, git, commit };
}

test('parseLog reads records and their files', () => {
  const output =
    `\x1e${'a'.repeat(40)}\x1f2026-11-17T10:00:00+07:00\x1fDev\x1fdev@example.com\x1ffeat(meet): a\n\napps/meet/a.ts\n` +
    `\x1e${'b'.repeat(40)}\x1f2026-11-17T09:00:00+07:00\x1fDev\x1fdev@example.com\x1fdocs: b\n`;
  const parsed = parseLog(output);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0].files, ['apps/meet/a.ts']);
  assert.deepEqual(parsed[1].files, []);
  assert.equal(parsed[0].subject, 'feat(meet): a');
});

test('readCommits marks production and measures the production lag', (t) => {
  const { cwd, git, commit } = repo();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  commit('feat(meet): one', 'apps/meet/a.ts', '2026-11-15T10:00:00+07:00');
  const shipped = commit(
    'fix(calendar): two',
    'apps/calendar/a.ts',
    '2026-11-16T10:00:00+07:00'
  );
  git('branch', 'production');
  const deployed = commit(
    'feat(mail): three',
    'apps/mail/a.ts',
    '2026-11-17T08:00:00+07:00'
  );
  commit('feat(tasks): four', 'apps/tasks/a.ts', '2026-11-17T09:00:00+07:00');
  const { commits, production } = readCommits({
    cwd,
    productionRef: 'production',
    deployCommits: [deployed, 'f'.repeat(40)],
    sinceMs: Date.parse('2026-11-01T00:00:00Z'),
  });
  assert.equal(commits.length, 4);
  assert.deepEqual(
    commits.map((entry) => [entry.subject, entry.inProduction]),
    [
      ['feat(tasks): four', false],
      ['feat(mail): three', true],
      ['fix(calendar): two', true],
      ['feat(meet): one', true],
    ]
  );
  assert.deepEqual(commits[1].files, ['apps/mail/a.ts']);
  assert.equal(production.commit, shipped);
  assert.equal(production.waiting, 2);
  assert.equal(production.oldestWaitingAt, '2026-11-17T08:00:00+07:00');
});

test('readCommits refuses a shallow checkout', (t) => {
  const { cwd, commit } = repo();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  commit('a', 'a.txt', '2026-11-15T10:00:00+07:00');
  commit('b', 'b.txt', '2026-11-16T10:00:00+07:00');
  const shallow = mkdtempSync(join(tmpdir(), 'roadmap-shallow-'));
  t.after(() => rmSync(shallow, { recursive: true, force: true }));
  const clone = spawnSync(
    'git',
    ['clone', '-q', '--depth', '1', `file://${cwd}`, shallow],
    { encoding: 'utf8' }
  );
  assert.equal(clone.status, 0, clone.stderr);
  assert.throws(
    () => readCommits({ cwd: shallow, sinceMs: 0 }),
    /shallow checkout/
  );
});

test('readCitedCommits keeps only cited commits on the head history', (t) => {
  const { cwd, git, commit } = repo();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const first = commit(
    'feat(mail): one',
    'apps/mail/a.ts',
    '2026-11-15T10:00:00+07:00'
  );
  const second = commit(
    'feat(meet): two',
    'apps/meet/a.ts',
    '2026-11-16T10:00:00+07:00'
  );
  // A commit on another branch is not on main.
  git('checkout', '-q', '-b', 'side');
  const side = commit(
    'feat(tasks): side',
    'apps/tasks/a.ts',
    '2026-11-17T10:00:00+07:00'
  );
  git('checkout', '-q', 'main');
  const found = readCitedCommits({
    cwd,
    cited: [second, first, first, side, 'f'.repeat(40), 'abc1234'],
    mainRef: 'refs/heads/main',
  });
  assert.equal(found.head, second);
  assert.deepEqual(found.commits, [
    { sha: second, at: '2026-11-16T10:00:00+07:00' },
    { sha: first, at: '2026-11-15T10:00:00+07:00' },
  ]);
  assert.deepEqual(
    readCitedCommits({ cwd, cited: [], mainRef: 'refs/heads/main' }).commits,
    []
  );
  // Broken variants: without the main branch's remote-tracking ref nothing
  // counts as merged, and no tag with a similar name stands in for it.
  git('tag', 'origin/main', second);
  git('tag', 'refs/remotes/origin/main', second);
  assert.throws(
    () => readCitedCommits({ cwd, cited: [first] }),
    /refs\/remotes\/origin\/main/
  );
});

test('broken variant: a pull request build does not count its own commits', (t) => {
  const { cwd, git, commit } = repo();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const merged = commit('a', 'a.txt', '2026-11-15T10:00:00+07:00');
  git('branch', 'trunk');
  // The checkout is the request's head: it contains a commit main lacks.
  const proposed = commit('b', 'b.txt', '2026-11-16T10:00:00+07:00');
  const found = readCitedCommits({
    cwd,
    cited: [merged, proposed],
    mainRef: 'refs/heads/trunk',
  });
  assert.deepEqual(
    found.commits.map((entry) => entry.sha),
    [merged]
  );
});
