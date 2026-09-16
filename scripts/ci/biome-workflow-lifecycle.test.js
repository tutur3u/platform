const assert = require('node:assert/strict');
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
  const push = workflow.match(/\n {2}push:\n([\s\S]*?)(?=\n {2}\w)/)?.[1];
  assert.ok(push);
  const ignoredBranches = [...push.matchAll(/^ {6}- '([^']+)'$/gm)].map(
    (match) => match[1]
  );
  // Only metadata branches are excluded: actual release PRs still validate.
  assert.deepEqual(ignoredBranches, [
    'release-please--branches--**--release-notes',
  ]);
  assert.match(push, /branches-ignore:/);
  assert.doesNotMatch(push, /(?:^|\n) {4}branches:/);
  assert.match(workflow, /\n {2}workflow_dispatch:/);
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
