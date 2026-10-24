const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { normalizeReleaseNotes } = require('./normalize-release-notes');

const hash = 'a'.repeat(40);
const second = 'b'.repeat(40);
const commit = (value) =>
  `([${value.slice(0, 7)}](https://github.com/tutur3u/platform/commit/${value}))`;
const issue = '([#42](https://github.com/tutur3u/platform/issues/42))';
const old = `## [1.0.0](https://example.test/old)\n\n* Already published ${commit(hash)}\n* Already published ${commit(second)}\n`;
const header =
  '# Changelog\n\n## [1.1.0](https://example.test/new)\n\n### Fixes\n';

test('combines repeated descriptions while retaining all source references', () => {
  const input = `${header}* **mail:** repair cache ${commit(hash)}\n* **mail:** repair cache ${issue} ${commit(second)}\n\n${old}`;
  const result = normalizeReleaseNotes(input, `# Changelog\n\n${old}`);
  assert.equal(
    result,
    `${header}* **mail:** repair cache ${commit(hash)} ${issue} ${commit(second)}\n\n${old}`
  );
  assert.equal(normalizeReleaseNotes(result, old), result);
});

test('does not deduplicate across release sections or change published history', () => {
  const input = `${header}* Same ${commit(hash)}\n### Features\n* Same ${commit(second)}\n${old}`;
  assert.equal(normalizeReleaseNotes(input, old), input);
});

test('keeps distinct descriptions and unfamiliar trailing content', () => {
  const input = `${header}* First ${commit(hash)}\n* Second ${commit(second)}\n* First ${commit(second)} Additional detail\n${old}`;
  assert.equal(normalizeReleaseNotes(input, old), input);
});

test('removes only confirmed integration commits in unpublished additions', () => {
  const input = `${header}* Integration ${commit(hash)}\n* Real fix ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old, (value) => value === hash),
    `${header}* Real fix ${commit(second)}\n${old}`
  );
});

test('retains combined entries containing any functional commit', () => {
  const input = `${header}* Mixed ${commit(hash)} ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old, (value) => value === hash),
    input
  );
});

test('fails closed when published history cannot be located', () => {
  assert.throws(
    () => normalizeReleaseNotes(header, old),
    /boundary is missing/
  );
});

test('supports an initial release with no previous headings', () => {
  const input = `${header}* Fix ${commit(hash)}\n* Fix ${commit(hash)}\n`;
  assert.equal(
    normalizeReleaseNotes(input, '# Changelog\n'),
    `${header}* Fix ${commit(hash)}\n`
  );
});

test('omits known Git bookkeeping in new notes but preserves published originals and product merges', () => {
  const input = `${header}* **mobile:** Merge remote-tracking branch 'origin/main' ${commit(hash)}\n* **contacts:** merge duplicate contacts ${commit(second)}\n${old}`;
  assert.equal(
    normalizeReleaseNotes(input, old),
    `${header}* **contacts:** merge duplicate contacts ${commit(second)}\n${old}`
  );
});

const offlineHash = 'a45d63498cc1e686d1d070f5861cf938c4e9a9ef';
const offlineMerge = '2f0f39763daea56f1029fcc3e99e0be53c60e106';
const offlineTitle =
  '* **mobile:** support offline data and safe inventory checkout';
const offlineMergeTitle =
  '* **mobile:** support offline data, cached images, and safe inventory checkout';

test('consolidates only the proven #5734 source and merge pair in either order', () => {
  const original = `${offlineTitle} ${commit(offlineHash)}`;
  const merge = `${offlineMergeTitle} ${issue} ${commit(offlineMerge)}`;
  for (const reverse of [false, true]) {
    const lines = reverse ? [merge, original] : [original, merge];
    const result = normalizeReleaseNotes(
      `${header}${lines.join('\n')}\n${old}`,
      old
    );
    const references = reverse
      ? `${issue} ${commit(offlineMerge)} ${commit(offlineHash)}`
      : `${commit(offlineHash)} ${issue} ${commit(offlineMerge)}`;
    assert.equal(result, `${header}${offlineMergeTitle} ${references}\n${old}`);
    assert.equal(normalizeReleaseNotes(result, old), result);
  }
});

test('does not infer equivalent releases from similar titles or unrelated hashes', () => {
  for (const [left, right] of [
    [hash, offlineMerge],
    [offlineHash, second],
    [offlineHash, offlineHash],
  ]) {
    const input = `${header}${offlineTitle} ${commit(left)}\n${offlineMergeTitle} ${commit(right)}\n${old}`;
    assert.equal(normalizeReleaseNotes(input, old), input);
  }
  const standalone = `${header}${offlineTitle} ${commit(offlineHash)}\n${old}`;
  assert.equal(normalizeReleaseNotes(standalone, old), standalone);
});

test('keeps the proven mobile pair separate across sections and published history', () => {
  const source = `${offlineTitle} ${commit(offlineHash)}`;
  const merge = `${offlineMergeTitle} ${commit(offlineMerge)}`;
  const separated = `${header}${source}\n### Features\n${merge}\n${old}`;
  assert.equal(normalizeReleaseNotes(separated, old), separated);
  const published = `## [1.0.0](https://example.test/old)\n${source}\n${merge}\n`;
  const input = `${header}${source}\n${published}`;
  assert.equal(normalizeReleaseNotes(input, published), input);
});

const script = path.join(__dirname, 'normalize-release-notes.js');
const historyLimit = 8 * 1024 * 1024;
const otherIssue = '([#43](https://github.com/tutur3u/platform/issues/43))';

function historyBytes(size) {
  const prefix = `# Changelog\n\n${old}* Published café\r\n`;
  return Buffer.from(
    `${prefix}${'x'.repeat(size - Buffer.byteLength(prefix) - 1)}\n`
  );
}

function historyFixture(t, published) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-history-'));
  fs.chmodSync(cwd, 0o700);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      [
        '-c',
        'user.name=Release history fixture',
        '-c',
        'user.email=release-history@example.test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.autocrlf=false',
        ...args,
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  git('init', '--quiet');
  fs.writeFileSync(path.join(cwd, 'fixture.txt'), 'Private test fixture\n');
  if (published) fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), published);
  git('add', '--', '.');
  git('commit', '--quiet', '-m', 'Initial published history');
  const base = git('rev-parse', 'HEAD').trim();
  const additions = `${header}* Fix ${issue}\n* Fix ${otherIssue}\n\n`;
  const generated = Buffer.concat([
    Buffer.from(additions),
    published || Buffer.alloc(0),
  ]);
  fs.writeFileSync(path.join(cwd, 'CHANGELOG.md'), generated);
  git('add', '--', 'CHANGELOG.md');
  git('commit', '--quiet', '-m', 'Generated release notes');
  return { cwd, base, generated, published };
}

function runNormalizer(fixture, env = process.env) {
  return spawnSync(process.execPath, [script, fixture.base], {
    cwd: fixture.cwd,
    env,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 64 * 1024,
    killSignal: 'SIGKILL',
  });
}

function assertNormalized(fixture, result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Normalized 1 generated changelog files/);
  const expected = Buffer.concat([
    Buffer.from(`${header}* Fix ${issue} ${otherIssue}\n\n`),
    fixture.published || Buffer.alloc(0),
  ]);
  const actual = fs.readFileSync(path.join(fixture.cwd, 'CHANGELOG.md'));
  assert.deepEqual(actual, expected);
  if (fixture.published) {
    assert.deepEqual(
      actual.subarray(-fixture.published.length),
      fixture.published
    );
  }
}

function assertHistoryFailure(fixture, result) {
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot read published history: CHANGELOG.md/);
  assert.deepEqual(
    fs.readFileSync(path.join(fixture.cwd, 'CHANGELOG.md')),
    fixture.generated
  );
  assert.doesNotMatch(result.stdout, /published history preserved/);
}

test('reads a real published Git blob above the old buffer and preserves every byte', (t) => {
  const fixture = historyFixture(t, historyBytes(1_071_091));
  assert.throws(
    () =>
      execFileSync('git', ['show', `${fixture.base}:CHANGELOG.md`], {
        cwd: fixture.cwd,
        encoding: 'utf8',
      }),
    (error) => {
      t.diagnostic(
        JSON.stringify({
          code: error.code,
          signal: error.signal,
          status: error.status,
          stdoutBytes: Buffer.byteLength(error.stdout),
        })
      );
      return error.code === 'ENOBUFS' && error.stdout.length > 1024 * 1024;
    }
  );
  assertNormalized(fixture, runNormalizer(fixture));
});

test('accepts the complete published history at the 8 MiB boundary', (t) => {
  const fixture = historyFixture(t, historyBytes(historyLimit));
  assertNormalized(fixture, runNormalizer(fixture));
});

test('fails closed without rewriting when published history exceeds 8 MiB', (t) => {
  const fixture = historyFixture(t, historyBytes(historyLimit + 1));
  assertHistoryFailure(fixture, runNormalizer(fixture));
});

test('allows an initial changelog only when it is absent from the base tree', (t) => {
  const fixture = historyFixture(t);
  assertNormalized(fixture, runNormalizer(fixture));
});

function controlledGit(fixture, mode) {
  const bin = path.join(fixture.cwd, 'controlled-bin');
  fs.mkdirSync(bin);
  const attempts = path.join(bin, 'history-attempts');
  const executable = path.join(bin, 'git');
  fs.writeFileSync(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'show' && args[1] === ${JSON.stringify(`${fixture.base}:CHANGELOG.md`)}) {
  fs.appendFileSync(${JSON.stringify(attempts)}, 'attempt\\n');
  if (${JSON.stringify(mode)} === 'failure') process.exit(42);
  process.on('SIGTERM', () => {});
  setTimeout(() => process.exit(0), 60_000);
} else {
  const result = spawnSync('/usr/bin/git', args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
`,
    { mode: 0o700 }
  );
  return {
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    attempts,
  };
}

test('keeps an existing published changelog fail-closed after a Git read failure without retry', (t) => {
  const fixture = historyFixture(t, Buffer.from(old));
  const control = controlledGit(fixture, 'failure');
  assertHistoryFailure(fixture, runNormalizer(fixture, control.env));
  assert.equal(fs.readFileSync(control.attempts, 'utf8'), 'attempt\n');
});

test('kills a stalled published-history read at its 10-second deadline without retry or rewrite', (t) => {
  const fixture = historyFixture(t, Buffer.from(old));
  const control = controlledGit(fixture, 'timeout');
  const started = performance.now();
  assertHistoryFailure(fixture, runNormalizer(fixture, control.env));
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 10_000 && elapsed < 14_000, `Elapsed ${elapsed} ms`);
  assert.equal(fs.readFileSync(control.attempts, 'utf8'), 'attempt\n');
});

const { normalizeMobileReleaseNotes } = require('./normalize-release-notes');
test('renders the reported mobile submission history without branch merge noise', () => {
  const input =
    '- Merge main into feat/feedback-mobile-submit-20261022\n- retain uncertain submissions and compare omitted media\n- connect secure mobile submission and private media\n- retain completed replies across reload and follow-up';
  assert.equal(
    normalizeMobileReleaseNotes(input),
    '- Retain uncertain submissions and compare omitted media\n- Connect secure mobile submission and private media\n- Retain completed replies across reload and follow-up'
  );
});

test('prefers mobile product changes, removes maintenance and references, and deduplicates', () => {
  const input = [
    'fix(web): repair navigation (#12)',
    'chore(mobile): update tools',
    'ci: update workflow',
    'test: extend coverage',
    'docs: explain testing',
    'refactor(mobile): move helpers',
    'feat(mobile): send feedback (#42)',
    'fix(mobile): Send feedback',
    'fix(mobile): repair replies on fix/mobile-replies PR #43',
  ].join('\n');
  const expected = '- Send feedback\n- Repair replies on\n- Repair navigation';
  assert.equal(normalizeMobileReleaseNotes(input), expected);
  assert.equal(normalizeMobileReleaseNotes(expected), expected);
  assert.equal(
    normalizeMobileReleaseNotes('- merge duplicate contacts'),
    '- Merge duplicate contacts'
  );
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'normalize-release-description.js'), '--mobile'],
    { input, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
});

test('mobile history excludes multi-parent product-titled merges but keeps their underlying work', async (t) => {
  const fixture = historyFixture(t);
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { cwd: fixture.cwd, encoding: 'utf8' }
    );
  const base = git('rev-parse', 'HEAD').trim();
  fs.mkdirSync(path.join(fixture.cwd, 'apps/mobile'), { recursive: true });
  git('checkout', '-b', 'product');
  fs.writeFileSync(path.join(fixture.cwd, 'apps/mobile/feature'), 'feature');
  git('add', 'apps/mobile');
  git('commit', '-m', 'feat(mobile): send feedback');
  git('checkout', '--detach', base);
  git('merge', '--no-ff', 'product', '-m', 'feat(mobile): integration noise');
  const { changesBetween } = await import(
    '../mobile-deployment/release-history.mjs'
  );
  assert.deepEqual(
    changesBetween(base, 'HEAD', (command, args) =>
      execFileSync(command, args, { cwd: fixture.cwd, encoding: 'utf8' })
    ),
    ['Send feedback']
  );
});

test('mobile notes strip bare PR numbers and every permitted task branch prefix', () => {
  assert.equal(
    normalizeMobileReleaseNotes('fix(mobile): Keep drafts #123'),
    '- Keep drafts'
  );
  for (const prefix of [
    'feature',
    'feat',
    'fix',
    'bugfix',
    'hotfix',
    'release',
    'chore',
    'docs',
    'style',
    'refactor',
    'perf',
    'dependabot',
    'claude',
  ]) {
    assert.equal(
      normalizeMobileReleaseNotes(
        `fix(mobile): Keep drafts ${prefix}/drafts #123`
      ),
      '- Keep drafts',
      prefix
    );
  }
});
