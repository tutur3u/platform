const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  readWorkflowJobBlock,
  repoRoot,
} = require('./workflow-config-test-helpers.js');

const releaseJob = readWorkflowJobBlock(
  'release-please.yaml',
  'release-please'
);

test('trusted formatting copy loads its policy without generated branch code', () => {
  const copyStart = releaseJob.indexOf('cp -R scripts ');
  const switchIndex = releaseJob.indexOf('git switch --detach');
  assert.ok(copyStart >= 0 && switchIndex > copyStart);
  const copyCommands = releaseJob.slice(copyStart, switchIndex).trim();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'release-trusted-copy-')
  );
  const load = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const ci = path.join(process.argv[1], 'scripts/ci');
    assert.equal(typeof require(path.join(ci, 'release-docs-inventory.js')).resolveProof, 'function');
    assert.equal(typeof require(path.join(ci, 'release-workspace-lock.js')).validateWorkspaceLock, 'function');
    const { normalizeReleaseNotes } = require(path.join(ci, 'normalize-release-notes.js'));
    assert.equal(normalizeReleaseNotes('## [1.0.0]\\n* merge main into production\\n* add calendar view\\n', ''),
      '## [1.0.0]\\n* add calendar view\\n');
  `;
  try {
    // Control: the preserved scripts-only copy reproduces the real missing module.
    fs.cpSync(path.join(repoRoot, 'scripts'), path.join(directory, 'scripts'), {
      recursive: true,
    });
    const before = spawnSync(process.execPath, ['-e', load, directory], {
      cwd: directory,
      encoding: 'utf8',
      env: {},
    });
    assert.notEqual(before.status, 0);
    assert.match(before.stderr, /MODULE_NOT_FOUND/);
    assert.match(
      before.stderr,
      /Cannot find module '..\/..\/packages\/utils\/src\/release-note-policy-core.cjs'/
    );

    fs.rmSync(path.join(directory, 'scripts'), { recursive: true });
    // Execute only the trusted copy block, never the checkout or release commands.
    execFileSync('bash', ['-euo', 'pipefail', '-c', copyCommands], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, trusted_scripts: directory },
    });
    assert.deepEqual(
      fs.readdirSync(path.join(directory, 'packages/utils/src')).sort(),
      ['release-note-policy-core.cjs', 'release-note-policy.json']
    );
    execFileSync(process.execPath, ['-e', load, directory], {
      cwd: directory,
      env: {},
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Release Please normalizes generated files before approving the PR', () => {
  const createIndex = releaseJob.indexOf('Create or update release PR');
  const formatIndex = releaseJob.indexOf(
    'Normalize generated release formatting'
  );
  const approveIndex = releaseJob.indexOf('Approve untouched release PR');

  assert.ok(createIndex >= 0);
  assert.ok(formatIndex > createIndex);
  assert.ok(approveIndex > formatIndex);
  assert.match(releaseJob, /ref: production/);
  assert.match(releaseJob, /fetch-depth: 0/);
  assert.match(
    releaseJob,
    /uses: actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7/
  );
});

test('generated formatting is path-scoped and race-safe', () => {
  const formatIndex = releaseJob.indexOf(
    'Normalize generated release formatting'
  );
  const formatStep = releaseJob.slice(
    formatIndex,
    releaseJob.indexOf('Delete tagged overflow release notes')
  );

  assert.doesNotMatch(releaseJob, /npx\b[^\n]*biome/u);
  assert.match(
    releaseJob,
    /run-with-backoff\.sh bun install --frozen-lockfile --ignore-scripts/
  );
  assert.match(formatStep, /"\$\{biome_bin\}" format --write/);
  assert.match(
    formatStep,
    /git diff --name-only -z origin\/production\.\.\.HEAD/
  );
  assert.match(
    formatStep,
    /trap 'git switch --detach origin\/production >\/dev\/null; rm -rf -- "\$\{trusted_scripts\}"' EXIT/
  );
  assert.match(formatStep, /git add -- "\$\{changed_files\[@\]\}"/);
  assert.doesNotMatch(formatStep, /git add --all|git add \./);
  assert.match(formatStep, /git commit --amend --no-edit/);
  assert.match(
    formatStep,
    /--force-with-lease="refs\/heads\/\$\{RELEASE_BRANCH\}:\$\{RELEASE_SHA\}"/
  );
});

const releaseSteps = releaseJob.split(/\n {6}- name: /u);
const stepNamed = (name) => releaseSteps.find((step) => step.startsWith(name));

test('the admin token is not persisted and reaches only the push steps', () => {
  assert.match(releaseJob, /persist-credentials: false/);
  const withPushToken = releaseSteps.filter((step) =>
    /PUSH_TOKEN:/u.test(step)
  );
  assert.equal(withPushToken.length, 2);
  for (const step of withPushToken) {
    // The token travels only through the helper's environment, never a URL.
    assert.match(step, /bash scripts\/ci\/github-token-push\.sh /u);
    assert.doesNotMatch(step, /x-access-token|\$\{?PUSH_TOKEN\b|git push/u);
  }
  const formatStep = stepNamed('Normalize generated release formatting');
  assert.doesNotMatch(formatStep, /secrets\.RELEASE_PLEASE_TOKEN|git push/u);
});

test('only the reviewed steps receive the admin token, each in its own step env', () => {
  // SR-393: the two Node API scripts still need the admin token; pin the set so
  // no other step (or a job-level env) can gain it without a reviewed change.
  const header = releaseJob.slice(0, releaseJob.indexOf('\n    steps:'));
  assert.doesNotMatch(header, /RELEASE_PLEASE_TOKEN \|\||^ {4}env:/mu);
  const tokenSteps = releaseSteps
    .slice(1)
    .filter((step) => /secrets\.RELEASE_PLEASE_TOKEN/u.test(step))
    .map((step) => step.split('\n')[0]);
  assert.deepEqual(tokenSteps, [
    'Checkout release automation',
    'Recover overflow release notes',
    'Create or update release PR',
    'Push normalized release branch',
    'Normalize generated release description',
    'Delete tagged overflow release notes',
  ]);
  assert.doesNotMatch(
    stepNamed('Approve untouched release PR'),
    /RELEASE_PLEASE_TOKEN \|\|/u
  );
});

test('the token push helper keeps the token out of every process argv', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'token-push-'));
  try {
    const log = path.join(directory, 'git.log');
    const bin = path.join(directory, 'git');
    fs.writeFileSync(
      bin,
      '#!/bin/sh\n{ printf "argv:%s\\n" "$*"; env | grep "^GIT_CONFIG_"; } >> "$GIT_LOG"\n',
      { mode: 0o755 }
    );
    // Deliberately not PAT-shaped: the helper treats the token as opaque.
    const token = 'fixture-push-token-not-a-real-credential-0123456789';
    const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
    const run = (env, ...args) =>
      spawnSync(
        'bash',
        [path.join(repoRoot, 'scripts/ci/github-token-push.sh'), ...args],
        {
          encoding: 'utf8',
          env: {
            PATH: `${directory}:${process.env.PATH}`,
            GIT_LOG: log,
            GITHUB_REPOSITORY: 'example/repo',
            ...env,
          },
        }
      );
    const result = run(
      { PUSH_TOKEN: token, GITHUB_ACTIONS: 'true' },
      'abc:refs/heads/x',
      '--force-with-lease=refs/heads/x:def'
    );
    assert.equal(result.status, 0, result.stderr);
    const recorded = fs.readFileSync(log, 'utf8');
    const argv = recorded.split('\n').filter((l) => l.startsWith('argv:'));
    assert.deepEqual(argv, [
      'argv:push https://github.com/example/repo.git abc:refs/heads/x --force-with-lease=refs/heads/x:def',
    ]);
    assert.match(
      recorded,
      /^GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader$/mu
    );
    assert.ok(
      recorded.includes(`GIT_CONFIG_VALUE_0=AUTHORIZATION: basic ${encoded}\n`)
    );
    assert.ok(!argv.join('\n').includes(token));
    assert.ok(!argv.join('\n').includes(encoded));
    assert.ok(result.stdout.includes(`::add-mask::${encoded}`));
    assert.ok(!result.stdout.includes(token));

    const missing = run({}, '--delete', 'x');
    assert.notEqual(missing.status, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('generated lock refresh is bounded, version-only, and preserves authors', () => {
  assert.match(releaseJob, /bun-version: 1\.4\.4/);
  assert.match(releaseJob, /bun install --lockfile-only --ignore-scripts/);
  assert.match(
    releaseJob,
    /node "\$\{trusted_scripts\}\/scripts\/ci\/release-workspace-lock\.js" origin\/production HEAD --working/
  );
  assert.match(releaseJob, /changed_files\+=\("bun\.lock"\)/);
  assert.doesNotMatch(releaseJob, /--reset-author|git add --all/);
  const guardIndex = releaseJob.indexOf(
    'release-workspace-lock.js" origin/production HEAD --working'
  );
  const normalizeIndex = releaseJob.indexOf(
    'normalize-release-notes.js" origin/production'
  );
  assert.ok(guardIndex >= 0 && normalizeIndex > guardIndex);
  assert.match(releaseJob, /cp -R scripts "\$\{trusted_scripts\}\/scripts"/);
});
