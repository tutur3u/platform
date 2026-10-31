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

// An unfrozen `bun install` can resolve outside the reviewed bun.lock. Every
// unfrozen install, including global tools, needs a reason comment
// on the line directly above it.
const JUSTIFICATION = /#\s*unfrozen-bun-install:\s*\S+/;

function findUnfrozenInstalls(text) {
  const lines = text.replace(/\\\n[ \t]*/g, ' ').split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    const installs = [...line.matchAll(/\bbun[ \t]+install\b([^#;&|]*)/g)];
    if (installs.length === 0) return;

    const trimmed = line.trim();
    // Prose, echo and error messages that merely mention the command.
    if (trimmed.startsWith('#') || /^(?:run:\s*)?echo\s/.test(trimmed)) return;

    if (
      installs.every((match) =>
        /(?:^|\s)--frozen-lockfile(?:\s|$)/.test(match[1])
      )
    )
      return;
    // The retry wrapper also freezes installs, but the explicit flag keeps the
    // workflow self-describing, so wrapper calls are not exempt.
    if (JUSTIFICATION.test(lines[index - 1] ?? '')) return;

    violations.push(`${index + 1}: ${trimmed}`);
  });

  return violations;
}

test('workflows never run an unfrozen bun install', () => {
  const failures = [];

  for (const file of fs.readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/.test(file)) continue;
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const violation of findUnfrozenInstalls(text)) {
      failures.push(`${file}:${violation}`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    'add --frozen-lockfile or an `# unfrozen-bun-install: <reason>` comment above the line'
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
  assert.equal(
    findUnfrozenInstalls(
      '# unfrozen-bun-install: refreshes the lock\nbun install --lockfile-only'
    ).length,
    0
  );
  assert.equal(
    findUnfrozenInstalls('# unfrozen-bun-install:\nbun install --lockfile-only')
      .length,
    1
  );
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
