const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  readWorkflowJobBlock,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const remoteCredentialNames = new Set([
  'TURBO_API',
  'TURBO_REMOTE_CACHE_SIGNATURE_KEY',
  'TURBO_TEAM',
  'TURBO_TOKEN',
]);
const activeVercelProjects = {
  apps: '@tuturuuu/apps',
  calendar: '@tuturuuu/calendar',
  chat: '@tuturuuu/chat',
  cms: '@tuturuuu/cms',
  contacts: '@tuturuuu/contacts',
  drive: '@tuturuuu/drive',
  finance: '@tuturuuu/finance',
  infrastructure: '@tuturuuu/infrastructure',
  inventory: '@tuturuuu/inventory',
  learn: '@tuturuuu/learn',
  mail: '@tuturuuu/mail',
  meet: '@tuturuuu/meet',
  mind: '@tuturuuu/mind',
  nova: '@tuturuuu/nova',
  pay: '@tuturuuu/pay',
  platform: '@tuturuuu/web',
  rewise: '@tuturuuu/rewise',
  shortener: '@tuturuuu/shortener',
  storefront: '@tuturuuu/storefront',
  'tanstack-web': '@tuturuuu/tanstack-web',
  tasks: '@tuturuuu/tasks',
  teach: '@tuturuuu/teach',
  tools: '@tuturuuu/tools',
  track: '@tuturuuu/track',
};

function readWorkflow(workflowName) {
  return fs.readFileSync(path.join(workflowsDir, workflowName), 'utf8');
}

function listWorkflowFiles() {
  return fs
    .readdirSync(workflowsDir)
    .filter((fileName) => /\.ya?ml$/u.test(fileName))
    .sort();
}

function readStepBlocks(source) {
  const starts = [...source.matchAll(/^\s+- (?:name|uses):/gmu)].map(
    (match) => match.index
  );

  return starts.map((start, index) =>
    source.slice(start, starts[index + 1] ?? source.length)
  );
}

function findBroadEnvCredentials(source) {
  const lines = source.split('\n');
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.match(/^ */u)[0].length;

    if (indent > 4 || line.trim() !== 'env:') {
      continue;
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      const candidateIndent = candidate.match(/^ */u)[0].length;

      if (candidate.trim() && candidateIndent <= indent) {
        break;
      }

      const key = candidate.trim().match(/^([A-Z0-9_]+):/u)?.[1];
      if (key && remoteCredentialNames.has(key)) {
        violations.push(`${key} at line ${cursor + 1}`);
      }
    }
  }

  return violations;
}

test('all 24 active Vercel projects cache their full Turbo build', () => {
  assert.equal(Object.keys(activeVercelProjects).length, 24);
  assert.equal(vercelWorkflows.length, 48);

  for (const [project, workspace] of Object.entries(activeVercelProjects)) {
    const appDirectory = project === 'platform' ? 'web' : project;
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'apps', appDirectory, 'vercel.json'),
        'utf8'
      )
    );

    assert.equal(
      config.buildCommand,
      `cd ../.. && bun turbo:local run build --filter=${workspace}`,
      `${project} must build through root Turbo`
    );

    for (const target of ['preview', 'production']) {
      const workflowName = `vercel-${target}-${project}.yaml`;
      const workflow = readWorkflow(workflowName);

      assert.ok(vercelWorkflows.includes(workflowName));
      assert.match(
        workflow,
        /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/u
      );
      assert.match(workflow, /command: vercel build/u);
      assert.match(
        workflow,
        /PLATFORM_BUILD_ENVIRONMENT: (?:preview|production)/u
      );
      assert.match(workflow, /PLATFORM_BUILD_REF_NAME:/u);
      assert.match(workflow, /NODE_OPTIONS: --max-old-space-size=8192/u);
      assert.match(workflow, /TURBO_CONCURRENCY: "2"/u);
      assert.doesNotMatch(workflow, /Build workspace dependencies/u);
      assert.doesNotMatch(workflow, /^\s+run:\s+vercel build/mu);
    }
  }

  for (const inactiveProject of ['external', 'playground']) {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'apps', inactiveProject, 'vercel.json'),
        'utf8'
      )
    );
    assert.equal(config.buildCommand, undefined);
  }
});

test('Turbo hashes output inputs without treating credentials as task env', () => {
  const turbo = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'turbo.json'), 'utf8')
  );

  for (const credential of remoteCredentialNames) {
    assert.ok(!turbo.globalPassThroughEnv.includes(credential));
  }

  assert.deepEqual(turbo.tasks.transit.dependsOn, ['^transit']);
  assert.deepEqual(turbo.tasks.test.dependsOn, ['transit']);
  assert.ok(turbo.tasks.test.outputs.includes('coverage/**'));

  for (const taskName of ['build', 'build:docker']) {
    const task = turbo.tasks[taskName];
    assert.ok(task.env.includes('NEXT_PUBLIC_*'));
    assert.ok(task.env.includes('VERCEL_ENV'));
    assert.ok(!task.env.includes('PLATFORM_BUILD_DEPLOYMENT_STAMP'));
    assert.ok(!task.env.includes('PLATFORM_BUILD_DEPLOYMENT_URL'));
    assert.ok(task.outputs.includes('.output/**'));
    assert.ok(task.outputs.includes('*.tsbuildinfo'));
  }

  for (const control of [
    'DOCKER_WEB_BUILD_CPUS',
    'DOCKER_WEB_BUILD_MAX_PARALLELISM',
    'DOCKER_WEB_BUILD_MEMORY',
    'DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE',
    'DOCKER_WEB_TURBO_CONCURRENCY',
    'NODE_OPTIONS',
  ]) {
    assert.ok(turbo.tasks['build:docker'].passThroughEnv.includes(control));
  }
});

test('workflow remote-cache credentials stay narrow and untrusted jobs get none', () => {
  const trustedOnly = new Set([
    ...vercelWorkflows,
    ...listWorkflowFiles().filter((fileName) =>
      /^release-.+-package\.yaml$/u.test(fileName)
    ),
  ]);

  for (const workflowName of listWorkflowFiles()) {
    const workflow = readWorkflow(workflowName);

    assert.deepEqual(
      findBroadEnvCredentials(workflow),
      [],
      `${workflowName} has workflow/job-scoped Turbo credentials`
    );
    assert.doesNotMatch(
      workflow,
      /(?:echo|printf)[^\n]*TURBO_(?:TOKEN|TEAM|API|REMOTE_CACHE_SIGNATURE_KEY)[^\n]*GITHUB_ENV/iu,
      `${workflowName} must not persist remote credentials through GITHUB_ENV`
    );

    for (const line of workflow.split('\n')) {
      if (!line.includes('token:') || !line.includes('secrets.TURBO_TOKEN')) {
        continue;
      }

      assert.match(
        line,
        /github\.actor != 'dependabot\[bot\]'/u,
        `${workflowName} must not expose a cache token to Dependabot`
      );

      if (trustedOnly.has(workflowName)) {
        assert.doesNotMatch(
          workflow.slice(0, workflow.indexOf('\njobs:')),
          /\bpull_request\b/u,
          `${workflowName} must not expose an unconditional cache token to PR jobs`
        );
        continue;
      }

      assert.match(line, /github\.event_name != 'pull_request'/u, workflowName);
      assert.match(line, /refs\/heads\/main/u, workflowName);
    }
  }
});

test('cacheable JavaScript workflow commands use the remote-cache wrapper', () => {
  for (const workflowName of listWorkflowFiles()) {
    for (const step of readStepBlocks(readWorkflow(workflowName))) {
      if (!/^\s+run:/mu.test(step)) {
        continue;
      }

      assert.doesNotMatch(
        step,
        /\bbun turbo:local run (?:build|test|type-check)\b/u,
        `${workflowName} has an unwrapped Turbo task`
      );
      assert.doesNotMatch(
        step,
        /\bbun(?: run)? (?:build|type-check)(?=[:\s])/u,
        `${workflowName} has an unwrapped cacheable root task`
      );
      assert.doesNotMatch(
        step,
        /\bbun(?: run)? test(?=\s)/u,
        `${workflowName} has an unwrapped cacheable test task`
      );
      assert.doesNotMatch(
        step,
        /\bbun run --filter[^\n]*\b(?:build|test|type-check)\b/u,
        `${workflowName} has an unwrapped filtered workspace task`
      );
      assert.doesNotMatch(
        step,
        /\bvercel build\b/u,
        `${workflowName} has an unwrapped Vercel build`
      );
    }
  }
});

test('package release caches and tarball handoffs follow the release policy', () => {
  const releaseWorkflows = listWorkflowFiles().filter((fileName) =>
    /^release-.+-package\.yaml$/u.test(fileName)
  );

  assert.equal(releaseWorkflows.length, 13);

  for (const workflowName of releaseWorkflows) {
    const workflow = readWorkflow(workflowName);
    const wrapperSteps = readStepBlocks(workflow).filter((step) =>
      /uses: \.\/\.github\/actions\/run-with-turbo-remote-cache/u.test(step)
    );

    for (const step of wrapperSteps) {
      assert.match(step, /--concurrency=4/u, workflowName);
    }

    assert.match(workflow, /npm pack --ignore-scripts --pack-destination/u);
    assert.doesNotMatch(workflow, /npm pack --pack-destination/u);

    const uploadSteps = readStepBlocks(workflow).filter((step) =>
      /uses: actions\/upload-artifact@/u.test(step)
    );
    assert.equal(uploadSteps.length, 1, workflowName);
    assert.match(uploadSteps[0], /path: .*\/\*\.tgz/u, workflowName);
    assert.match(uploadSteps[0], /retention-days: 1/u, workflowName);
    assert.match(uploadSteps[0], /if-no-files-found: error/u, workflowName);
    assert.match(uploadSteps[0], /compression-level: 0/u, workflowName);
  }

  for (const [workflowName, workspace] of [
    ['release-devbox-package.yaml', '@tuturuuu/devbox'],
    ['release-internal-api-package.yaml', '@tuturuuu/internal-api'],
    ['release-sdk-package.yaml', 'tuturuuu'],
  ]) {
    assert.match(
      readWorkflow(workflowName),
      new RegExp(
        `command: bun turbo:local run build[^\\n]*--filter=${workspace}`
      ),
      `${workflowName} must prepare lifecycle build output before script-free packing`
    );
  }
});

test('Actions caches use stable platform keys and mobile caches omit outputs', () => {
  for (const workflowName of listWorkflowFiles()) {
    for (const step of readStepBlocks(readWorkflow(workflowName))) {
      if (!/uses: actions\/cache(?:\/restore|\/save)?@/u.test(step)) {
        continue;
      }

      assert.doesNotMatch(
        step,
        /github\.(?:run_id|run_attempt)/u,
        workflowName
      );
      assert.match(step, /runner\.os/u, `${workflowName} cache key needs OS`);
      assert.match(
        step,
        /runner\.arch/u,
        `${workflowName} cache key needs arch`
      );

      if (workflowName.startsWith('mobile')) {
        assert.doesNotMatch(
          step,
          /apps\/mobile\/(?:build|\.dart_tool)|\.(?:aab|apk|ipa)\b/u,
          `${workflowName} must cache dependencies, not final outputs`
        );
      }
    }
  }
});

test('manual BuildKit GHA cache jobs expose the pinned runtime context', () => {
  const runtimeAction =
    /crazy-max\/ghaction-github-runtime@04d248b84655b509d8c44dc1d6f990c879747487 # v4\.0\.0/u;

  for (const [workflowName, jobName] of [
    ['docker-setup-check.yaml', 'verify'],
    ['e2e-tests.yaml', 'e2e'],
    ['e2e-tests.yaml', 'migration-e2e'],
    ['rust-backend.yml', 'docker'],
  ]) {
    const job = readWorkflowJobBlock(workflowName, jobName);
    assert.match(job, /type=gha/u, `${workflowName}:${jobName}`);
    assert.match(job, runtimeAction, `${workflowName}:${jobName}`);
  }
});

test('every uploaded artifact declares retention and missing-file behavior', () => {
  for (const workflowName of listWorkflowFiles()) {
    for (const step of readStepBlocks(readWorkflow(workflowName))) {
      if (!/uses: actions\/upload-artifact@/u.test(step)) {
        continue;
      }

      assert.match(step, /retention-days:/u, workflowName);
      assert.match(
        step,
        /if-no-files-found: (?:error|ignore|warn)/u,
        workflowName
      );
    }
  }
});
