const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { repoRoot } = require('./workflow-config-test-helpers.js');

test('workflows use the repo Bun setup and install retry helpers', () => {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((fileName) => fileName.endsWith('.yaml'));
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );
  const bunVersion = packageJson.packageManager.replace(/^bun@/, '');

  const retainedPins = new Map([
    ['tanstack-route-manifest.yaml', '1.4.1'],
    ['vercel-preview-tanstack-web.yaml', '1.4.1'],
    ['vercel-production-tanstack-web.yaml', '1.4.1'],
  ]);

  for (const workflowFile of workflowFiles) {
    const workflow = fs.readFileSync(
      path.join(workflowsDir, workflowFile),
      'utf8'
    );

    assert.doesNotMatch(
      workflow,
      /oven-sh\/setup-bun/,
      `${workflowFile} must use the local Bun setup retry action`
    );
    assert.doesNotMatch(
      workflow,
      /^\s*run:\s*bun (?:install|setup)\b/m,
      `${workflowFile} must run Bun install/setup through scripts/ci/run-with-backoff.sh`
    );
    assert.doesNotMatch(
      workflow,
      /^\s*run:\s*bunx\b/m,
      `${workflowFile} must use "bun x" because the local Bun setup action only installs the bun binary`
    );

    if (workflow.includes('./.github/actions/setup-bun-with-retry')) {
      const expectedVersion = retainedPins.get(workflowFile) ?? bunVersion;
      assert.ok(
        workflow.indexOf('actions/checkout') <
          workflow.indexOf('./.github/actions/setup-bun-with-retry'),
        `${workflowFile} must checkout the repo before using the local Bun setup action`
      );
      assert.match(
        workflow,
        new RegExp(`bun-version: ${expectedVersion.replaceAll('.', '\\.')}`),
        `${workflowFile} must pin Bun to its active or retained runtime`
      );
    }
  }
});
