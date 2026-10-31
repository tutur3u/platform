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

test('the admin token is not persisted and reaches only the push steps', () => {
  assert.match(releaseJob, /persist-credentials: false/);
  const steps = releaseJob.split(/\n {6}- name: /u);
  const withPushToken = steps.filter((step) => /PUSH_TOKEN:/u.test(step));
  assert.equal(withPushToken.length, 2);
  for (const step of withPushToken) {
    assert.match(
      step,
      /git push "https:\/\/x-access-token:\$\{PUSH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git"/u
    );
  }
  const formatStep = steps.find((step) =>
    step.startsWith('Normalize generated release formatting')
  );
  assert.doesNotMatch(formatStep, /secrets\.RELEASE_PLEASE_TOKEN|git push/u);
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
