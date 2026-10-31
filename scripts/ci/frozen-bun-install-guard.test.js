const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { repoRoot } = require('./workflow-config-test-helpers.js');

const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const retryScript = fs.readFileSync(
  path.join(repoRoot, 'scripts', 'ci', 'run-with-backoff.sh'),
  'utf8'
);

// Exact workflow, step and complete command; a marker grants no authority.
const exceptions = require('./frozen-bun-install-exceptions.json');
const MARKER = /#\s*unfrozen-bun-install:/;
const JUSTIFICATION = /#\s*unfrozen-bun-install:\s*\S+/;

function findUnfrozenInstalls(text, file = 'fixture.yaml') {
  const lines = text.replace(/\\\n[ \t]*/g, ' ').split('\n');
  const violations = [];
  let stepName;
  const allowed = (command) =>
    exceptions.some(
      ([workflow, step, exactCommand]) =>
        workflow === file && step === stepName && exactCommand === command
    );
  const commandText = (line) => line.trim().replace(/^run:\s*/, '');

  lines.forEach((line, index) => {
    // Reset at every job or step, including unnamed steps.
    if (/^ {2}\S/.test(line)) stepName = undefined;
    if (/^ {6}- /.test(line)) {
      stepName = /^ {6}- name: (.+)$/.exec(line)?.[1];
    }
    if (MARKER.test(line)) {
      if (
        !/^\s*#/.test(line) ||
        !JUSTIFICATION.test(line) ||
        !allowed(commandText(lines[index + 1] ?? ''))
      ) {
        violations.push(`${index + 1}: unauthorized exception marker`);
      }
      return;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || /^(?:run:\s*)?echo\s/.test(trimmed)) return;
    const installs = [...line.matchAll(/\bbun[ \t]+install\b([^#;&|]*)/g)];
    if (installs.length === 0) return;
    if (
      installs.every((match) =>
        /(?:^|\s)--frozen-lockfile(?:\s|$)/.test(match[1])
      )
    )
      return;
    if (
      JUSTIFICATION.test(lines[index - 1] ?? '') &&
      allowed(commandText(line))
    )
      return;
    violations.push(`${index + 1}: ${trimmed}`);
  });
  return violations;
}

test('workflows never run an unfrozen bun install', () => {
  const failures = [];

  for (const file of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(file)) continue;
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const violation of findUnfrozenInstalls(text, file)) {
      failures.push(`${file}:${violation}`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    'use --frozen-lockfile or an exact reviewed workflow/step/command exception with --ignore-scripts'
  );
});

test('guard flags unfrozen installs and honours exemptions', () => {
  for (const command of [
    'run: bun install',
    'run: bun  install',
    'run: bun install # --frozen-lockfile',
    'run: bun install --frozen-lockfile=false',
    'run: bun install; bun install --frozen-lockfile',
    'run: bun install && echo done',
    'bun install # unfrozen-bun-install: forged marker',
  ]) {
    assert.equal(findUnfrozenInstalls(command).length, 1, command);
  }
  assert.equal(
    findUnfrozenInstalls('run: bash scripts/ci/run-with-backoff.sh bun install')
      .length,
    1
  );
  assert.equal(
    findUnfrozenInstalls('run: bun install --frozen-lockfile').length,
    0
  );
  assert.equal(
    findUnfrozenInstalls('run: bun install --global vercel@1').length,
    1
  );
});

const releaseFixture = (
  command,
  step = 'Normalize generated release formatting'
) =>
  `jobs:\n  release-please:\n    steps:\n      - name: ${step}\n        run: |\n          # unfrozen-bun-install: version-only lock rewrite\n          ${command}\n`;

test('only exact reviewed workflow, step and safe command can be exempted', () => {
  const command = 'bun install --lockfile-only --ignore-scripts';
  assert.deepEqual(
    findUnfrozenInstalls(releaseFixture(command), 'release-please.yaml'),
    []
  );
  for (const [file, step, changedCommand] of [
    ['another.yaml', 'Normalize generated release formatting', command],
    ['release-please.yaml', 'Other step', command],
    [
      'release-please.yaml',
      'Normalize generated release formatting',
      'bun install --ignore-scripts',
    ],
    [
      'release-please.yaml',
      'Normalize generated release formatting',
      'bun install --lockfile-only',
    ],
    [
      'release-please.yaml',
      'Normalize generated release formatting',
      command + ' --force',
    ],
    [
      'vercel-preview-new.yaml',
      'Install Vercel CLI',
      'bash scripts/ci/run-with-backoff.sh bun install --global vercel@59.25.0 --ignore-scripts',
    ],
  ]) {
    assert.ok(
      findUnfrozenInstalls(releaseFixture(changedCommand, step), file).length >
        0,
      `${file}: ${step}: ${changedCommand}`
    );
  }
  assert.ok(
    findUnfrozenInstalls(
      '# unfrozen-bun-install: copied marker\nrun: bun install --frozen-lockfile'
    ).length > 0
  );
});

test('every reviewed exception disables lifecycle scripts and rejects command drift', () => {
  for (const [file, step, command] of exceptions) {
    assert.match(command, / --ignore-scripts$/);
    assert.deepEqual(
      findUnfrozenInstalls(releaseFixture(command, step), file),
      []
    );
    assert.ok(
      findUnfrozenInstalls(
        releaseFixture(command.replace(' --ignore-scripts', ''), step),
        file
      ).length > 0
    );
    assert.ok(
      findUnfrozenInstalls(releaseFixture(command + ' --force', step), file)
        .length > 0
    );
  }
});

test('retry helper freezes lockfile-backed bun installs by default', () => {
  assert.match(retryScript, /--frozen-lockfile/);
  assert.match(retryScript, /is_global_install/);
  assert.match(retryScript, /is_lockfile_only/);
});

test('retry helper passes --frozen-lockfile to the real bun invocation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-bun-'));
  try {
    const bin = path.join(directory, 'bun');
    fs.writeFileSync(bin, '#!/bin/sh\necho "bun-args:$*"\n', { mode: 0o755 });
    const run = (...args) =>
      spawnSync(
        'bash',
        [
          path.join(repoRoot, 'scripts', 'ci', 'run-with-backoff.sh'),
          'bun',
          ...args,
        ],
        {
          encoding: 'utf8',
          env: {
            PATH: `${directory}:${process.env.PATH}`,
            CI_RETRY_MAX_ATTEMPTS: '1',
          },
        }
      ).stdout;

    assert.match(run('install'), /bun-args:install .*--frozen-lockfile/);
    assert.doesNotMatch(run('install', '--global', 'x@1'), /--frozen-lockfile/);
    assert.doesNotMatch(run('install', '--lockfile-only'), /--frozen-lockfile/);
    const explicit = run('install', '--frozen-lockfile').match(
      /--frozen-lockfile/g
    );
    assert.equal(explicit?.length, 2); // echoed command line + bun args, no duplicate flag
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('safe lock-only install regenerates bumped workspace versions and prunes orphan entries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bun-lock-rewrite-'));
  const manifest = path.join(directory, 'packages/example/package.json');
  const lockfile = path.join(directory, 'bun.lock');
  const marker = path.join(directory, 'lifecycle-ran');
  const install = (...flags) => {
    const result = spawnSync('bun', ['install', '--lockfile-only', ...flags], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, BUN_INSTALL_MINIMUM_RELEASE_AGE: '0' },
    });
    assert.equal(result.status, 0, result.stderr);
    return fs.readFileSync(lockfile, 'utf8');
  };
  try {
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'lock-rewrite-fixture',
        private: true,
        workspaces: ['packages/*'],
        scripts: {
          preinstall: 'touch lifecycle-ran',
          postinstall: 'touch lifecycle-ran',
        },
      })
    );
    fs.writeFileSync(
      manifest,
      JSON.stringify({ name: 'example', version: '1.0.0' })
    );
    const original = install('--ignore-scripts');
    assert.match(original, /"version": "1.0.0"/);
    fs.writeFileSync(
      manifest,
      JSON.stringify({ name: 'example', version: '2.0.0' })
    );
    const bumped = install('--ignore-scripts');
    assert.match(bumped, /"version": "2.0.0"/);
    assert.doesNotMatch(bumped, /"version": "1.0.0"/);
    assert.equal(fs.existsSync(marker), false);
    const orphaned = bumped.replace(
      '"packages": {',
      '"packages": {"orphan": ["orphan@1.0.0", "", {}, "sha512-unused"],'
    );
    fs.writeFileSync(lockfile, orphaned);
    const safe = install('--ignore-scripts');
    assert.doesNotMatch(safe, /"orphan"/);
    assert.equal(fs.existsSync(marker), false);
    fs.writeFileSync(lockfile, orphaned);
    assert.equal(
      install(),
      safe,
      'ignore-scripts preserves canonical lockfile pruning'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
