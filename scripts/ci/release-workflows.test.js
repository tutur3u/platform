const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readWorkflowJobBlock,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

test('Vercel workflows grant marker permissions and record successful runs', () => {
  for (const workflowName of vercelWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const checkCiJob = readWorkflowJobBlock(workflowName, 'check-ci');
    const deployJob = readWorkflowJobBlock(
      workflowName,
      workflowName.startsWith('vercel-preview-')
        ? 'Deploy-Preview'
        : 'Deploy-Production'
    );

    assert.match(checkCiJob, /deployments:\s*read/);
    assert.match(deployJob, /deployments:\s*write/);
    assert.match(workflow, /Record successful Vercel deployment marker/);
    assert.match(workflow, new RegExp(`VERCEL_WORKFLOW_NAME: ${workflowName}`));
    assert.match(
      workflow,
      /bun run --silent scripts\/ci\/record-vercel-deployment\.ts/
    );
  }
});

test('SDK trusted publishing keeps OIDC isolated to artifact publish job', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'release-sdk-package.yaml'),
    'utf8'
  );
  const rejectJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'reject-non-production-ref'
  );
  const checkCiJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'check-ci'
  );
  const checkVersionBumpJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'check-version-bump'
  );
  const buildJob = readWorkflowJobBlock('release-sdk-package.yaml', 'build');
  const prepareJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'prepare-publish-npm'
  );
  const publishJob = readWorkflowJobBlock(
    'release-sdk-package.yaml',
    'publish-npm'
  );

  assert.match(workflow, /\n {2}push:\n/);
  assert.match(workflow, /branches:\s*\[production\]/);
  assert.match(workflow, /"packages\/sdk\/package\.json"/);
  assert.match(workflow, /"\.github\/workflows\/release-sdk-package\.yaml"/);
  assert.doesNotMatch(workflow, /\bsecrets\./);
  assert.doesNotMatch(workflow, /github\.event\.pull_request/);
  assert.doesNotMatch(workflow, /pull_request\.title/);

  assert.match(rejectJob, /if: github\.ref != 'refs\/heads\/production'/);
  assert.match(rejectJob, /permissions:\s*\{\}/);
  assert.match(
    rejectJob,
    /SDK releases can only run from refs\/heads\/production/
  );

  assert.match(checkCiJob, /if: github\.ref == 'refs\/heads\/production'/);
  assert.match(
    checkVersionBumpJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.check-ci\.outputs\.should_run == 'true'/
  );

  assert.match(
    buildJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.check-version-bump\.outputs\.should_release == 'true'/
  );
  assert.match(buildJob, /Build SDK workspace dependencies/);
  assert.match(buildJob, /bun run --filter @tuturuuu\/types build/);
  assert.match(buildJob, /bun run --filter @tuturuuu\/internal-api build/);
  assert.match(buildJob, /working-directory: packages\/sdk/);
  assert.match(buildJob, /run: bun run test/);

  assert.match(prepareJob, /if: github\.ref == 'refs\/heads\/production'/);
  assert.doesNotMatch(prepareJob, /id-token:\s*write/);
  assert.match(prepareJob, /Build SDK workspace dependencies/);
  assert.match(
    prepareJob,
    /steps\.version-check\.outputs\.should_publish == 'true'/
  );
  assert.match(prepareJob, /bun run --filter @tuturuuu\/types build/);
  assert.match(prepareJob, /bun run --filter @tuturuuu\/internal-api build/);
  assert.match(prepareJob, /npm pack --pack-destination/);
  assert.match(prepareJob, /actions\/upload-artifact@/);

  assert.match(
    publishJob,
    /if: github\.ref == 'refs\/heads\/production' && needs\.prepare-publish-npm\.outputs\.should_publish == 'true'/
  );
  assert.match(publishJob, /environment: sdk-release-production/);
  assert.match(publishJob, /id-token:\s*write/);
  assert.match(publishJob, /actions\/download-artifact@/);
  assert.match(publishJob, /Verify package artifact/);
  assert.match(
    publishJob,
    /echo "path=\.\/\$\{PACKAGE_TARBALL\}" >> "\$GITHUB_OUTPUT"/
  );
  assert.match(
    publishJob,
    /npm publish "\$\{\{ steps\.artifact\.outputs\.path \}\}" --ignore-scripts/
  );
  assert.doesNotMatch(publishJob, /actions\/checkout@/);
  assert.doesNotMatch(publishJob, /setup-bun/);
  assert.doesNotMatch(publishJob, /\bbun install\b/);
  assert.doesNotMatch(publishJob, /\bnpm install\b/);
});
