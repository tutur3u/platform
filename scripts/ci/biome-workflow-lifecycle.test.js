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
  path.join(repoRoot, '.github/workflows/biome-check.yaml'),
  'utf8'
);

test('overflow notes cannot attach cancelled Biome checks to a release SHA', () => {
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
  assert.deepEqual(triggers.push, {
    'branches-ignore': ['release-please--branches--**--release-notes'],
  });
  assert.ok(Object.hasOwn(triggers, 'workflow_dispatch'));
});

test('Biome supersedes obsolete commits without cancelling other branches', () => {
  assert.match(
    workflow,
    /concurrency:\s+group: biome-\$\{\{ github.ref \}\}\s+cancel-in-progress: true/
  );
});

test('Release Please owns formatting its generated branches', () => {
  for (const jobName of ['apply-format', 'close-outdated-format-pr']) {
    assert.match(
      readWorkflowJobBlock('biome-check.yaml', jobName),
      /!startsWith\(github.ref_name, 'release-please--'\)/
    );
  }
  // Generated release commits still receive the same required validation.
  for (const jobName of ['format', 'lint']) {
    assert.doesNotMatch(
      readWorkflowJobBlock('biome-check.yaml', jobName),
      /release-please--/
    );
  }
});

test('cancelled or skipped validation cannot publish a misleading PR report', () => {
  const comment = readWorkflowJobBlock('biome-check.yaml', 'comment');
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
