const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  readWorkflowJobBlock,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

test('production Vercel workflows serialize deployments without cancellation', () => {
  const productionWorkflows = vercelWorkflows.filter((workflowName) =>
    workflowName.startsWith('vercel-production-')
  );
  const concurrencyGroups = new Set();

  for (const workflowName of productionWorkflows) {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', workflowName),
      'utf8'
    );
    const header = workflow.slice(0, workflow.indexOf('\njobs:'));
    const workflowId = workflowName.replace(/\.yaml$/u, '');
    const concurrencyGroup = `group: ${workflowId}-\${{ github.ref }}`;

    assert.ok(
      header.includes(
        `\nconcurrency:\n  ${concurrencyGroup}\n  cancel-in-progress: false\n`
      ),
      `${workflowName} must serialize deployment runs`
    );
    assert.ok(
      !concurrencyGroups.has(concurrencyGroup),
      `${workflowName} must not cancel a different app's reusable deployment`
    );
    concurrencyGroups.add(concurrencyGroup);
    assert.doesNotMatch(
      workflow,
      /Check for newer commits|check_commits|skip_build/,
      `${workflowName} must not report a superseded deployment as a successful no-op`
    );
    assert.doesNotMatch(
      header,
      /\n {2}push:/,
      `${workflowName} must be called by the shared production planner`
    );
    assert.match(header, /\n {2}workflow_call:/);
    if (workflowName === 'vercel-production-tasks.yaml') {
      assert.doesNotMatch(header, /\n {2}workflow_dispatch:/);
      assert.match(
        readWorkflowJobBlock(workflowName, 'Deploy-Production'),
        /^ {4}if: github\.ref == 'refs\/heads\/production' && false$/m
      );
    } else {
      assert.match(header, /\n {2}workflow_dispatch:/);
    }
    assert.doesNotMatch(
      workflow,
      /uses: \.\/\.github\/workflows\/ci-check\.yml/
    );
    assert.doesNotMatch(workflow, /needs\.check-ci|needs: \[check-ci\]/);
  }
});

test('production Vercel planner resolves once and calls affected apps in the push run', () => {
  const workflowName = 'vercel-production.yaml';
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', workflowName),
    'utf8'
  );
  const plannerJob = readWorkflowJobBlock(workflowName, 'plan');
  const productionWorkflows = vercelWorkflows.filter((name) =>
    name.startsWith('vercel-production-')
  );

  assert.match(workflow, /\n {2}push:\n {4}branches:\n {6}- production\n/);
  assert.match(workflow, /\n {2}workflow_dispatch:/);
  assert.ok(
    workflow.includes(
      `\nconcurrency:\n  group: production-deployment-planner-\${{ github.ref }}\n  cancel-in-progress: false\n`
    ),
    'the production planner must not be canceled by main commits or manual recovery runs'
  );
  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /deployments:\s*write/);
  assert.match(
    plannerJob,
    /node --experimental-strip-types scripts\/ci\/resolve-production-vercel-targets\.ts/
  );
  assert.doesNotMatch(workflow, /gh workflow run/);
  for (const productionWorkflow of productionWorkflows) {
    const appId = productionWorkflow
      .replace(/^vercel-production-/u, '')
      .replace(/\.yaml$/u, '');
    if (productionWorkflow === 'vercel-production-tasks.yaml') continue;
    const reusableJob = readWorkflowJobBlock(workflowName, `deploy-${appId}`);

    assert.match(
      reusableJob,
      new RegExp(
        `uses: \\.\\/\\.github\\/workflows\\/${productionWorkflow.replaceAll('.', '\\.')}`
      ),
      `${productionWorkflow} must be called as a reusable job from the production push run`
    );
    assert.match(
      reusableJob.match(/^ {4}if:.*(?:\n {6}.*)*/mu)?.[0] ?? '',
      new RegExp(
        `contains\\(fromJSON\\(needs\\.plan\\.outputs\\.workflows_json\\), '${productionWorkflow.replaceAll('.', '\\.')}'\\)`
      ),
      `${productionWorkflow} must stay skipped when the planner does not select it`
    );
  }
  const tasksJob = readWorkflowJobBlock(workflowName, 'deploy-tasks');
  assert.match(
    tasksJob,
    /uses: \.\/\.github\/workflows\/tasks-cloudflare\.yaml/
  );
  assert.match(
    tasksJob,
    /contains\(fromJSON\(needs\.plan\.outputs\.workflows_json\), 'tasks-cloudflare\.yaml'\)/
  );
  assert.doesNotMatch(tasksJob, /secrets: inherit|vercel-production-tasks/);
  const tasksPublish = readWorkflowJobBlock('tasks-cloudflare.yaml', 'publish');
  assert.match(tasksPublish, /needs: \[production-policy, artifact\]/);
  assert.match(
    tasksPublish,
    /if: github\.ref == 'refs\/heads\/production' && needs\.production-policy\.outputs\.allowed == 'true'/
  );
  assert.match(
    tasksPublish,
    /concurrency:\n      group: tasks-cloudflare-production-deploy\n      cancel-in-progress: false\n      queue: max/
  );
  assert.match(tasksPublish, /deployments: write/);
  assert.match(
    tasksPublish,
    /DEPLOYMENT_MARKER_WORKFLOW_NAME: tasks-cloudflare\.yaml/
  );
  assert.match(tasksPublish, /node scripts\/ci\/record-deployment-marker\.ts/);
  for (const appId of ['colab', 'coordination', 'lettin', 'meet', 'parley']) {
    const productionWorkflow = `${appId}-cloudflare.yaml`;
    const reusableJob = readWorkflowJobBlock(
      workflowName,
      `deploy-${appId}-cloudflare`
    );
    const cloudflareWorkflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', productionWorkflow),
      'utf8'
    );

    assert.match(
      reusableJob,
      new RegExp(`uses: \\.\\/\\.github\\/workflows\\/${productionWorkflow}`)
    );
    assert.match(
      reusableJob,
      new RegExp(
        `if: contains\\(fromJSON\\(needs\\.plan\\.outputs\\.workflows_json\\), '${productionWorkflow}'\\)`
      )
    );
    assert.match(cloudflareWorkflow, /\n {2}workflow_call:/);
    assert.doesNotMatch(cloudflareWorkflow, /branches: \[main, production\]/);
    assert.match(cloudflareWorkflow, /DEPLOYMENT_MARKER_WORKFLOW_NAME:/);
    assert.match(
      cloudflareWorkflow,
      /\n {2}deploy:\n(?:.|\n)*? {4}permissions:\n {6}contents: read\n {6}deployments: write\n/
    );
  }
  assert.doesNotMatch(
    plannerJob,
    /uses: \.\/\.github\/workflows\/ci-check\.yml/
  );
});
