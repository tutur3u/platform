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

test('CI workflows use main instead of retired staging branch filters', () => {
  const workflowsWithoutStagingBranchFilters = [
    'branch-name-check.yaml',
    'codeql.yml',
    'docker-setup-check.yaml',
    'supabase-production.yaml',
    'supabase-staging.yaml',
  ];

  for (const workflowName of workflowsWithoutStagingBranchFilters) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );

    assert.doesNotMatch(
      workflow,
      /^\s*-\s*staging\s*$/m,
      `${workflowName} must not list staging as a Git branch`
    );
    assert.doesNotMatch(
      workflow,
      /branches:\s*\[[^\]]*\bstaging\b[^\]]*\]/,
      `${workflowName} must not include staging in inline branch filters`
    );
  }

  const supabaseStagingWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-staging.yaml'),
    'utf8'
  );
  const supabaseProductionWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-production.yaml'),
    'utf8'
  );

  assert.match(supabaseStagingWorkflow, /\n {4}branches:\n {6}- main\n/);
  assert.match(
    supabaseProductionWorkflow,
    /supabase-staging\.yaml\/runs\?branch=main&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.doesNotMatch(supabaseProductionWorkflow, /runs\?branch=staging/);
});

test('Supabase production migration is bound to production deployment and staged SHA', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'supabase-production.yaml'),
    'utf8'
  );
  const evaluateJob = readWorkflowJobBlock(
    'supabase-production.yaml',
    'evaluate-prerequisites'
  );
  const deployJob = readWorkflowJobBlock('supabase-production.yaml', 'deploy');

  assert.match(
    workflow,
    /workflows:\n {6}- "Vercel Platform Production Deployment"\n/
  );
  assert.doesNotMatch(
    workflow,
    /workflow_run:[\s\S]*Supabase Staging Migration/,
    'production migration must not be triggered by main staging migration runs'
  );
  assert.match(workflow, /\n {4}branches:\n {6}- production\n/);
  assert.doesNotMatch(
    workflow,
    /\n {6}- main\n/,
    'production workflow_run branch filters must not include main'
  );

  assert.match(
    evaluateJob,
    /manual dispatches must run from the production branch/
  );
  assert.match(
    evaluateJob,
    /TRIGGER_WORKFLOW" != "Vercel Platform Production Deployment"/
  );
  assert.match(evaluateJob, /TRIGGER_BRANCH" != "production"/);
  assert.match(
    evaluateJob,
    /vercel-production-platform\.yaml\/runs\?branch=production&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.match(evaluateJob, /VERCEL_SHA" != "\$TARGET_SHA"/);
  assert.match(
    evaluateJob,
    /supabase-staging\.yaml\/runs\?branch=main&head_sha=\$TARGET_SHA&per_page=1/
  );
  assert.match(evaluateJob, /STAGING_SHA" != "\$TARGET_SHA"/);
  assert.match(
    evaluateJob,
    /Production deployment and staging migration are bound to \$TARGET_SHA/
  );

  assert.match(
    deployJob,
    /ref: \$\{\{ needs\.evaluate-prerequisites\.outputs\.target_sha \}\}/
  );
});

test('environment-scoped Vercel workflows scope deploy secrets to deploy jobs', () => {
  const environmentScopedWorkflows = {
    'vercel-preview-apps.yaml': {
      environment: 'vercel-preview-apps',
      jobName: 'Deploy-Preview',
      projectSecret: 'VERCEL_APPS_PROJECT_ID',
      refGuard: /github\.ref != 'refs\/heads\/production'/,
    },
    'vercel-production-apps.yaml': {
      environment: 'vercel-production-apps',
      jobName: 'Deploy-Production',
      projectSecret: 'VERCEL_APPS_PROJECT_ID',
      refGuard: /github\.ref == 'refs\/heads\/production'/,
    },
    'vercel-preview-learn.yaml': {
      environment: 'vercel-preview-learn',
      jobName: 'Deploy-Preview',
      projectSecret: 'VERCEL_LEARN_PROJECT_ID',
      refGuard: /github\.ref != 'refs\/heads\/production'/,
    },
    'vercel-production-learn.yaml': {
      environment: 'vercel-production-learn',
      jobName: 'Deploy-Production',
      projectSecret: 'VERCEL_LEARN_PROJECT_ID',
      refGuard: /github\.ref == 'refs\/heads\/production'/,
    },
    'vercel-preview-teach.yaml': {
      environment: 'vercel-preview-teach',
      jobName: 'Deploy-Preview',
      projectSecret: 'VERCEL_TEACH_PROJECT_ID',
      refGuard: /github\.ref != 'refs\/heads\/production'/,
    },
    'vercel-production-teach.yaml': {
      environment: 'vercel-production-teach',
      jobName: 'Deploy-Production',
      projectSecret: 'VERCEL_TEACH_PROJECT_ID',
      refGuard: /github\.ref == 'refs\/heads\/production'/,
    },
  };

  for (const [workflowName, expected] of Object.entries(
    environmentScopedWorkflows
  )) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const header = workflow.slice(0, workflow.indexOf('\njobs:'));
    const deployJob = readWorkflowJobBlock(workflowName, expected.jobName);
    const installIndex = workflow.indexOf('run: bun install\n');
    const firstSecretIndex = workflow.indexOf('secrets.');

    assert.doesNotMatch(
      header,
      /\bsecrets\./,
      `${workflowName} must not expose GitHub secrets at workflow scope`
    );
    assert.match(header, /\npermissions:\n {2}contents: read\n/);
    assert.match(deployJob, expected.refGuard);
    assert.match(deployJob, new RegExp(`environment: ${expected.environment}`));
    assert.ok(
      installIndex > -1 && installIndex < firstSecretIndex,
      `${workflowName} must install dependencies before deployment secrets are introduced`
    );
    assert.match(
      deployJob,
      /VERCEL_ORG_ID: \$\{\{ secrets\.VERCEL_ORG_ID \}\}/
    );
    assert.match(
      deployJob,
      new RegExp(
        `VERCEL_PROJECT_ID: \\$\\{\\{ secrets\\.${expected.projectSecret} \\}\\}`
      )
    );
    assert.doesNotMatch(
      workflow,
      /TURBO_TOKEN:\s*\$\{\{ secrets\.TURBO_TOKEN \}\}/
    );
    assert.doesNotMatch(
      workflow,
      /TURBO_TEAM:\s*\$\{\{ secrets\.TURBO_TEAM \}\}/
    );
    assert.doesNotMatch(
      workflow,
      /SUPABASE_SECRET_KEY:\s*\$\{\{ secrets\.PRODUCTION_SUPABASE_SECRET_KEY \}\}/
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
