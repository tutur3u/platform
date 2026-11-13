const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  readWorkflowJobBlock,
  repoRoot,
} = require('./workflow-config-test-helpers.js');

const workflow = fs.readFileSync(
  path.join(repoRoot, '.github/workflows/oxc-check.yaml'),
  'utf8'
);

test('overflow notes cannot attach cancelled Oxc checks to a release SHA', () => {
  const triggers = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text()).on))',
      ],
      { input: workflow, encoding: 'utf8' }
    )
  );
  // Parse the entire node so extra branches cannot hide behind YAML quoting.
  // Protected and generated refs (including overflow notes) still validate on
  // push; other branches validate through the ready-for-ci pull request gate.
  assert.deepEqual(triggers.push, {
    branches: ['main', 'production', 'release-please--branches--**'],
  });
  assert.ok(Object.hasOwn(triggers, 'workflow_dispatch'));
});

test('Oxc preserves canonical and generated commits without branch collisions', () => {
  assert.match(workflow, /group:.*github\.workflow.*github\.ref.*github\.sha/);
  assert.match(
    workflow,
    /cancel-in-progress:.*github\.ref != 'refs\/heads\/production'.*!startsWith/
  );
});

test('Release Please owns formatting its generated branches', () => {
  for (const jobName of ['apply-format', 'close-outdated-format-pr']) {
    assert.match(
      readWorkflowJobBlock('oxc-check.yaml', jobName),
      /!startsWith\(github.ref_name, 'release-please--'\)/
    );
  }
  // Generated release commits still receive the same required validation.
  for (const jobName of ['format', 'lint']) {
    assert.doesNotMatch(
      readWorkflowJobBlock('oxc-check.yaml', jobName),
      /if:.*startsWith\(github.ref_name, 'release-please--'\)/
    );
  }
});

test('cancelled or skipped validation cannot publish a misleading PR report', () => {
  const comment = readWorkflowJobBlock('oxc-check.yaml', 'comment');
  assert.match(comment, /!cancelled\(\)/);
  for (const jobName of ['format', 'lint']) {
    assert.ok(
      comment.includes(
        `(needs.${jobName}.result == 'success' || needs.${jobName}.result == 'failure')`
      )
    );
  }
  assert.doesNotMatch(comment, /if: always\(\)/);
});

test('PR-facing Oxc jobs use locked pins without PR-owned binaries or lifecycle scripts', () => {
  const lock = fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8');
  for (const [jobName, tool] of [
    ['format', 'oxfmt'],
    ['lint', 'oxlint'],
    ['apply-format', 'oxfmt'],
  ]) {
    const locked = new RegExp(`"${tool}": \\["${tool}@([0-9.]+)"`, 'u').exec(
      lock
    )?.[1];
    assert.ok(locked, `bun.lock must resolve ${tool}`);
    const job = readWorkflowJobBlock('oxc-check.yaml', jobName);
    assert.doesNotMatch(
      job,
      /node_modules\/\.bin\/(?:oxfmt|oxlint)|bun install/u
    );
    const pins = [
      ...job.matchAll(new RegExp(`npx --yes ${tool}@(\\S+) `, 'gu')),
    ];
    assert.ok(pins.length > 0, `${jobName} must use a pinned ${tool}`);
    for (const [, version] of pins) assert.equal(version, locked);
    assert.match(job, /npm_config_ignore_scripts: 'true'/u);
  }
});

const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const expectedOxcCliVersion = rootPackageJson.devDependencies['oxfmt'].replace(
  /^[^\d]*/u,
  ''
);
const expectedOxcCliVersionPattern = expectedOxcCliVersion.replaceAll(
  '.',
  '\\.'
);

test('Oxc workflow runs pinned npm Oxc CLI and prints captured output when checks fail', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'oxc-check.yaml'),
    'utf8'
  );
  const formatJob = readWorkflowJobBlock('oxc-check.yaml', 'format');
  const lintJob = readWorkflowJobBlock('oxc-check.yaml', 'lint');
  const applyFormatJob = readWorkflowJobBlock('oxc-check.yaml', 'apply-format');
  for (const job of [formatJob, lintJob, applyFormatJob]) {
    assert.match(job, /npm_config_ignore_scripts: 'true'/u);
    assert.doesNotMatch(
      job,
      /node_modules\/\.bin\/(?:oxfmt|oxlint)|bun install/u
    );
  }

  for (const job of [formatJob, lintJob]) {
    assert.match(job, /uses: actions\/setup-node@[0-9a-f]{40} # v7\b/u);
    assert.match(job, /node-version: 24/u);
    assert.match(job, /printf '%s\\n' "\$oxc_output"/u);
    assert.match(job, /if \[ "\$oxc_exit_code" -ne 0 \]/u);
    assert.match(job, /exit "\$oxc_exit_code"/u);
    assert.doesNotMatch(job, /total_issues/u);
  }

  assert.doesNotMatch(workflow, /oxcjs\/setup-oxc@v2/u);
  assert.match(
    formatJob,
    new RegExp(
      `npx --yes oxfmt@${expectedOxcCliVersionPattern} --check \\. 2>&1`,
      'u'
    )
  );
  assert.match(
    lintJob,
    new RegExp(
      `npx --yes oxlint@1\\.93\\.0 --deny-warnings --threads 2 \\. 2>&1`,
      'u'
    )
  );
  assert.match(
    applyFormatJob,
    new RegExp(
      `npx --yes oxfmt@${expectedOxcCliVersionPattern} --write \\.`,
      'u'
    )
  );
});
