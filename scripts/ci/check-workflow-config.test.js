const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertWorkflowDecision,
  createFixtureRoot,
  repoRoot,
  vercelWorkflows,
} = require('./workflow-config-test-helpers.js');

function readWorkflowYaml(workflowName) {
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    workflowName
  );
  const workflowJson = execFileSync(
    'ruby',
    [
      '-e',
      "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV.fetch(0)))",
      workflowPath,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  return JSON.parse(workflowJson);
}

function githubExpression(expression) {
  return `${String.fromCharCode(36)}{{ ${expression} }}`;
}

function readCompositeStep(action, name) {
  const marker = `    - name: ${name}\n`;
  const start = action.indexOf(marker);
  assert.notEqual(start, -1, `missing composite step: ${name}`);
  const next = action.indexOf('\n    - name:', start + marker.length);
  return action.slice(start, next === -1 ? undefined : next);
}

test('docs-only changes skip all Vercel deploy workflows', () => {
  const rootDir = createFixtureRoot();

  for (const workflowName of vercelWorkflows) {
    assertWorkflowDecision(
      {
        changedFiles: ['apps/docs/build/devops/github-actions-runbook.mdx'],
        rootDir,
        workflowName,
      },
      false
    );
  }
});

test('app-only changes run only that app', () => {
  const rootDir = createFixtureRoot();

  assertWorkflowDecision(
    {
      changedFiles: ['apps/calendar/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/calendar/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-production-calendar.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/calendar/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-finance.yaml',
    },
    false
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/drive/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-drive.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/drive/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-production-drive.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/drive/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    false
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/apps/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-apps.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/apps/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    false
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/tools/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-tools.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/tools/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-apps.yaml',
    },
    false
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/mail/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-mail.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/mail/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-production-mail.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/mail/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-teach.yaml',
    },
    false
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/infrastructure/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-infrastructure.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/infrastructure/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-production-infrastructure.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/infrastructure/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    false
  );
});

test('shared package changes fan out through transitive workspace dependencies', () => {
  const rootDir = createFixtureRoot();
  const changedFiles = ['packages/icons/src/index.ts'];

  assertWorkflowDecision(
    {
      changedFiles,
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles,
      rootDir,
      workflowName: 'vercel-preview-track.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles,
      rootDir,
      workflowName: 'vercel-preview-shortener.yaml',
    },
    false
  );

  const paymentChangedFiles = ['packages/payment/src/polar/index.ts'];
  assertWorkflowDecision(
    {
      changedFiles: paymentChangedFiles,
      rootDir,
      workflowName: 'vercel-preview-infrastructure.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: paymentChangedFiles,
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    false
  );
});

test('unrelated package changes do not deploy apps that do not consume them', () => {
  const rootDir = createFixtureRoot();

  assertWorkflowDecision(
    {
      changedFiles: ['packages/unused/src/index.ts'],
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    false
  );
});

test('bun.lock-only changes run all Vercel app deploys', () => {
  const rootDir = createFixtureRoot();

  for (const workflowName of vercelWorkflows) {
    assertWorkflowDecision(
      {
        changedFiles: ['bun.lock'],
        rootDir,
        workflowName,
      },
      true
    );
  }
});

test('shared remote-cache and metadata changes run Vercel workflows', () => {
  const rootDir = createFixtureRoot();

  for (const changedFile of [
    '.github/actions/run-with-turbo-remote-cache/action.yml',
    '.github/actions/setup-bun-with-retry/action.yml',
    'scripts/ci/generate-build-metadata.ts',
  ]) {
    assertWorkflowDecision(
      {
        changedFiles: [changedFile],
        rootDir,
        workflowName: 'vercel-preview-calendar.yaml',
      },
      true
    );
  }
});

test('workflow_dispatch bypasses affected gating', () => {
  const rootDir = createFixtureRoot();

  assertWorkflowDecision(
    {
      changedFiles: ['apps/docs/build/devops/github-actions-runbook.mdx'],
      eventName: 'workflow_dispatch',
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    true
  );
});

test('release-please workflow uses static switchboard gating', () => {
  const rootDir = createFixtureRoot();
  const decision = assertWorkflowDecision(
    {
      changedFiles: ['apps/docs/build/devops/github-actions-runbook.mdx'],
      rootDir,
      workflowName: 'release-please.yaml',
    },
    true
  );

  assert.match(
    decision.output,
    /release-please\.yaml uses static tuturuuu\.ts gating/
  );
});

test('Vercel app projects disable Vercel-owned GitHub builds', () => {
  const appsRoot = path.join(repoRoot, 'apps');
  const vercelJsonPaths = fs
    .readdirSync(appsRoot)
    .map((appName) => path.join(appsRoot, appName, 'vercel.json'))
    .filter((vercelJsonPath) => fs.existsSync(vercelJsonPath));

  assert.ok(vercelJsonPaths.length > 0, 'expected app Vercel configs');

  for (const vercelJsonPath of vercelJsonPaths) {
    const relativePath = path.relative(repoRoot, vercelJsonPath);
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    assert.equal(
      vercelConfig.git?.deploymentEnabled,
      false,
      `${relativePath} must let GitHub Actions own deployments`
    );
    assert.equal(
      vercelConfig.github?.enabled,
      false,
      `${relativePath} must disable Vercel GitHub auto-builds`
    );
  }
});

test('mobile store deployment workflow is production-push beta delivery only', () => {
  const workflowName = 'mobile-deploy-stores.yaml';
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    workflowName
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const ciConfig = fs.readFileSync(path.join(repoRoot, 'tuturuuu.ts'), 'utf8');

  assert.match(
    ciConfig,
    /["']mobile-deploy-stores\.yaml["']:\s*true/,
    'mobile store deployment workflow must be registered in tuturuuu.ts'
  );

  execFileSync(
    'ruby',
    ['-e', "require 'yaml'; YAML.load_file(ARGV.fetch(0))", workflowPath],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  );

  assert.match(workflow, /^on:\n {2}push:\n/m);
  assert.match(workflow, /branches:\n\s+- production/);
  assert.match(workflow, /environment: mobile-store-beta/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /mobile-credentials-preflight:/);
  assert.match(workflow, /name: Check mobile deployment credentials/);
  assert.match(
    workflow,
    /has_ci_token: \$\{\{ steps\.credentials\.outputs\.has_ci_token \}\}/
  );
  assert.match(workflow, /echo "has_ci_token=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    workflow,
    /::notice title=Mobile store deployment skipped::MOBILE_DEPLOYMENT_CI_TOKEN is not configured/
  );
  assert.match(workflow, /echo "has_ci_token=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    workflow,
    /publish-android-internal:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.outputs\.has_ci_token == 'true'/
  );
  assert.match(
    workflow,
    /publish-ios-testflight:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.outputs\.has_ci_token == 'true'/
  );
  assert.match(workflow, /MOBILE_DEPLOYMENT_CI_TOKEN/);
  assert.match(workflow, /audience=tuturuuu-mobile-deployment/);
  assert.match(
    workflow,
    /https:\/\/tuturuuu\.com\/api\/v1\/mobile-deployment\/bundle\?environment=production&platform=android/
  );
  assert.match(
    workflow,
    /https:\/\/tuturuuu\.com\/api\/v1\/mobile-deployment\/bundle\?environment=production&platform=ios/
  );
  assert.match(workflow, /X-GitHub-OIDC-Token/);
  assert.match(workflow, /hydrate-bundle\.mjs/);
  assert.match(workflow, /--dart-define-from-file=\.env\.github/);
  assert.match(
    workflow,
    /serviceAccountJson: \$\{\{ env\.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH \}\}/
  );
  assert.match(workflow, /track:\s*internal/);
  assert.match(workflow, /status: completed/);
  assert.match(workflow, /xcrun altool --upload-app/);
  assert.match(workflow, /--type ios/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /tracks?:\s*production/i);
  assert.doesNotMatch(workflow, /MOBILE_ENV_PRODUCTION_B64/);
  assert.doesNotMatch(workflow, /MOBILE_ANDROID_GOOGLE_SERVICES_JSON_B64/);
  assert.doesNotMatch(workflow, /MOBILE_IOS_GOOGLE_SERVICE_INFO_PLIST_B64/);
  assert.doesNotMatch(workflow, /ANDROID_UPLOAD_KEYSTORE_B64/);
  assert.doesNotMatch(workflow, /secrets\.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(
    workflow,
    /secrets\.APPLE_DISTRIBUTION_CERTIFICATE_P12_B64/
  );
  assert.doesNotMatch(workflow, /secrets\.APP_STORE_CONNECT_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /apple-actions\/upload-testflight-build/);

  for (const match of workflow.matchAll(/uses:\s*([^\s]+)/g)) {
    const action = match[1];
    if (!action || action.startsWith('./')) {
      continue;
    }

    const [, ref] = action.split('@');
    assert.match(
      ref || '',
      /^[0-9a-f]{40}$/,
      `${action} must be pinned to a full commit SHA`
    );
  }

  assert.match(
    workflow,
    /path: apps\/mobile\/build\/app\/outputs\/bundle\/productionRelease\/app-production-release\.aab/
  );
  assert.match(workflow, /path: \$\{\{ steps\.ios-ipa\.outputs\.path \}\}/);
  assert.doesNotMatch(workflow, /path: .*mobile-deployment/i);
});

test('closed PR cancellation workflow is registered and avoids PR head code', () => {
  const workflowName = 'cancel-pr-runs-on-close.yaml';
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', workflowName),
    'utf8'
  );
  const ciConfig = fs.readFileSync(path.join(repoRoot, 'tuturuuu.ts'), 'utf8');

  assert.match(
    ciConfig,
    /["']cancel-pr-runs-on-close\.yaml["']:\s*true/,
    'closed PR cancellation workflow must be registered in tuturuuu.ts'
  );
  assert.ok(readWorkflowYaml(workflowName));
  assert.match(
    workflow,
    /^on:\n {2}pull_request_target:\n {4}types:\n {6}- closed\n/m
  );
  assert.match(workflow, /^ {2}actions:\s*write\b/m);
  assert.match(workflow, /^ {2}contents:\s*read\b/m);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ci-check\.yml/);
  assert.match(workflow, /workflow_name: cancel-pr-runs-on-close\.yaml/);
  assert.match(workflow, /^ {6}deployments:\s*read\b/m);
  assert.match(workflow, /uses: actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /uses: actions\/setup-node@[a-f0-9]{40}/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /node --experimental-strip-types scripts\/ci\/cancel-closed-pr-runs\.ts/
  );
  assert.doesNotMatch(workflow, /actions\/github-script/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/);
  assert.doesNotMatch(workflow, /\bgithub\.head_ref\b/);
  assert.doesNotMatch(workflow, /refs\/pull/);
});

test('workflows use the repo Bun setup and install retry helpers', () => {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((fileName) => fileName.endsWith('.yaml'));
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );
  const bunVersion = packageJson.packageManager.replace(/^bun@/, '');

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
      assert.ok(
        workflow.indexOf('actions/checkout') <
          workflow.indexOf('./.github/actions/setup-bun-with-retry'),
        `${workflowFile} must checkout the repo before using the local Bun setup action`
      );
      assert.match(
        workflow,
        new RegExp(`bun-version: ${bunVersion.replaceAll('.', '\\.')}`),
        `${workflowFile} must pin Bun to packageManager`
      );
    }
  }
});

test('Bun workflow helpers use bounded exponential backoff', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'type-check.yaml'),
    'utf8'
  );
  const setupAction = fs.readFileSync(
    path.join(
      repoRoot,
      '.github',
      'actions',
      'setup-bun-with-retry',
      'action.yml'
    ),
    'utf8'
  );
  const setupScript = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'ci', 'setup-bun-with-backoff.sh'),
    'utf8'
  );
  const retryScript = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'ci', 'run-with-backoff.sh'),
    'utf8'
  );
  const runtimeSaveStep = readCompositeStep(
    setupAction,
    'Restore and save trusted Bun runtime cache'
  );
  const runtimeRestoreStep = readCompositeStep(
    setupAction,
    'Restore Bun runtime cache without saving'
  );
  const packageSaveStep = readCompositeStep(
    setupAction,
    'Restore and save trusted Bun package cache'
  );
  const packageRestoreStep = readCompositeStep(
    setupAction,
    'Restore Bun package cache without saving'
  );

  assert.match(workflow, /run-with-backoff\.sh bun install --frozen-lockfile/);
  assert.match(setupAction, /setup-bun-with-backoff\.sh/);
  assert.match(setupAction, /uses: actions\/cache@v6/);
  assert.match(setupAction, /uses: actions\/cache\/restore@v6/);
  assert.match(
    setupAction,
    /bun-runtime-v1-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ inputs\.bun-version \}\}-\$\{\{ hashFiles\('bun\.lock'\) \}\}/
  );
  assert.match(
    setupAction,
    /bun-deps-v1-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ inputs\.bun-version \}\}-\$\{\{ hashFiles\('bun\.lock'\) \}\}/
  );
  for (const saveStep of [runtimeSaveStep, packageSaveStep]) {
    assert.match(saveStep, /github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(saveStep, /refs\/heads\/production/);
  }
  for (const restoreStep of [runtimeRestoreStep, packageRestoreStep]) {
    assert.match(restoreStep, /github\.ref != 'refs\/heads\/main'/);
    assert.match(restoreStep, /github\.event_name == 'pull_request'/);
    assert.match(restoreStep, /github\.actor == 'dependabot\[bot\]'/);
  }
  assert.doesNotMatch(setupAction, /node_modules/);
  assert.match(setupScript, /BUN_SETUP_MAX_ATTEMPTS/);
  assert.match(setupScript, /Using cached Bun/);
  assert.match(setupScript, /installed_version=.*--version/);
  assert.match(setupScript, /delay=\$\(\(delay \* 2\)\)/);
  assert.match(retryScript, /CI_RETRY_MAX_ATTEMPTS/);
  assert.match(retryScript, /bun pm cache rm/);
  assert.match(retryScript, /delay=\$\(\(delay \* 2\)\)/);
});

test('secretless Turbo fallback caches are task-scoped and trusted-write only', () => {
  const setupAction = fs.readFileSync(
    path.join(
      repoRoot,
      '.github',
      'actions',
      'setup-turbo-fallback-cache',
      'action.yml'
    ),
    'utf8'
  );

  assert.match(setupAction, /uses: actions\/cache@v6/);
  assert.match(setupAction, /uses: actions\/cache\/restore@v6/);
  assert.match(setupAction, /\$\{\{ inputs\.family \}\}/);
  assert.match(setupAction, /hashFiles\('bun\.lock', 'turbo\.json'\)/);
  assert.match(setupAction, /runner\.os/);
  assert.match(setupAction, /runner\.arch/);
  assert.match(setupAction, /github\.event\.pull_request\.base\.sha/);
  assert.match(setupAction, /github\.event\.repository\.default_branch/);
  assert.match(setupAction, /github\.event_name == 'pull_request'/);
  assert.match(setupAction, /github\.actor == 'dependabot\[bot\]'/);
  assert.doesNotMatch(setupAction, /TURBO_TOKEN|TURBO_TEAM|node_modules/);
});

test('TanStack migration E2E workflow keeps dual-stack and compare coverage', () => {
  const workflow = readWorkflowYaml('e2e-tests.yaml');
  const job = workflow.jobs?.['migration-e2e'];

  assert.ok(job, 'e2e-tests.yaml must define the migration-e2e job');
  assert.deepEqual(job.needs, ['check-ci', 'prepare-e2e-images']);
  assert.match(job.if, /always\(\)/u);
  assert.match(job.if, /needs\.check-ci\.outputs\.should_run == 'true'/u);
  assert.equal(job['timeout-minutes'], 60);
  assert.equal(job.strategy?.['fail-fast'], false);

  const matrixRows = job.strategy?.matrix?.include;
  assert.ok(Array.isArray(matrixRows));
  assert.equal(matrixRows.length, 2);

  const rowByMode = new Map(matrixRows.map((row) => [row.mode, row]));
  assert.deepEqual([...rowByMode.keys()].sort(), [
    'compare-smoke',
    'tanstack-dual-stack',
  ]);
  assert.deepEqual(rowByMode.get('tanstack-dual-stack'), {
    bundle_frontend: 'tanstack',
    command: 'bun test:e2e:tanstack:docker -- -- --project=chromium',
    mode: 'tanstack-dual-stack',
    playwright_workdir: 'apps/tanstack-web',
    setup_supabase: 'false',
  });
  assert.deepEqual(rowByMode.get('compare-smoke'), {
    bundle_frontend: 'both',
    command:
      'bun test:e2e:web:docker:compare -- public-marketing-routes.noauth.spec.ts --project=chromium-no-auth',
    mode: 'compare-smoke',
    playwright_workdir: 'apps/web',
    setup_supabase: 'true',
  });

  const steps = job.steps || [];
  assert.ok(
    steps.some(
      (step) =>
        step.name === 'Run migration E2E' &&
        step.run === githubExpression('matrix.command')
    ),
    'migration-e2e must execute the matrix command'
  );

  const artifactStep = steps.find(
    (step) => step.name === 'Upload migration E2E artifacts'
  );
  assert.ok(artifactStep, 'migration-e2e must upload diagnostics artifacts');
  assert.equal(artifactStep.uses, 'actions/upload-artifact@v7');
  assert.equal(artifactStep.if, githubExpression('failure()'));
  assert.equal(
    artifactStep.with?.name,
    `migration-e2e-${githubExpression('matrix.mode')}`
  );
  assert.match(
    artifactStep.with?.path || '',
    /apps\/tanstack-web\/playwright-report\//
  );
  assert.match(artifactStep.with?.path || '', /apps\/web\/blob-report\//);
  assert.match(
    artifactStep.with?.path || '',
    /tmp\/e2e\/web-migration\/\*\.json/
  );
  assert.equal(artifactStep.with?.['if-no-files-found'], 'ignore');
  assert.equal(artifactStep.with?.['retention-days'], 7);

  const cacheExportStep = steps.find(
    (step) => step.name === 'Configure trusted migration BuildKit cache exports'
  );
  assert.equal(
    cacheExportStep,
    undefined,
    'migration E2E must restore shared BuildKit scopes without racing their owners'
  );
  assert.equal(
    job.env?.DOCKER_WEB_CACHE_BACKEND_FROM,
    'type=gha,scope=docker-backend,timeout=10m'
  );
  assert.equal(
    job.env?.DOCKER_WEB_CACHE_TANSTACK_FROM,
    'type=gha,scope=docker-tanstack-web-prod,timeout=10m'
  );

  const cleanupStep = steps.find(
    (step) => step.name === 'Stop migration E2E stacks'
  );
  assert.ok(cleanupStep, 'migration-e2e must clean up both Docker stacks');
  assert.equal(cleanupStep.if, 'always()');
  assert.match(
    cleanupStep.run || '',
    /docker compose -f docker-compose\.tanstack-dual\.yml down \|\| true/
  );
  assert.match(
    cleanupStep.run || '',
    /node scripts\/docker-web\.js down --mode prod --strategy blue-green --env-file tmp\/e2e\/web\.env \|\| true/
  );
  assert.match(cleanupStep.run || '', /bun sb:stop \|\| true/);
});

test('E2E image bundle completes before private, bounded, optional consumers', () => {
  const workflow = readWorkflowYaml('e2e-tests.yaml');
  const producer = workflow.jobs?.['prepare-e2e-images'];
  const e2e = workflow.jobs?.e2e;
  const migration = workflow.jobs?.['migration-e2e'];
  const cleanup = workflow.jobs?.['cleanup-e2e-images'];

  assert.ok(producer);
  assert.ok(e2e);
  assert.ok(migration);
  assert.ok(cleanup);
  assert.deepEqual(producer.needs, ['check-ci']);
  assert.deepEqual(e2e.needs, ['check-ci', 'prepare-e2e-images']);
  assert.deepEqual(migration.needs, ['check-ci', 'prepare-e2e-images']);
  assert.match(e2e.if, /always\(\)/u);
  assert.match(migration.if, /always\(\)/u);
  assert.equal(producer['continue-on-error'], true);
  assert.equal(producer.permissions?.contents, 'read');
  assert.equal(producer.permissions?.packages, 'write');
  assert.equal(e2e.permissions?.packages, 'read');
  assert.equal(migration.permissions?.packages, 'read');
  assert.equal(cleanup.permissions?.packages, 'write');
  assert.equal(
    workflow.env?.E2E_IMAGE_BUNDLE_REPOSITORY,
    'ghcr.io/tutur3u/platform-e2e'
  );
  assert.equal(workflow.env?.E2E_IMAGE_BUNDLE_WAIT_SECONDS, '10');
  assert.equal(workflow.env?.E2E_DOCKER_SUPABASE_RESET, '0');
  assert.equal(
    workflow.env?.E2E_SUPABASE_IMAGE_TRANSPORT,
    githubExpression("inputs.supabase_image_transport || 'cache'")
  );
  assert.deepEqual(
    workflow.true?.workflow_dispatch?.inputs?.supabase_image_transport?.options,
    ['cache', 'registry']
  );
  assert.equal(
    workflow.env?.E2E_IMAGE_BUNDLE_TAG_PREFIX,
    `${githubExpression('github.run_id')}-${githubExpression(
      'github.run_attempt'
    )}-${githubExpression('github.sha')}`
  );

  assert.ok(
    e2e.steps.some(
      (step) =>
        step.name === 'Reuse prepared E2E image bundle' &&
        step.run === 'node scripts/ci/e2e-image-bundle.js pull --frontend next'
    )
  );
  assert.ok(
    migration.steps.some(
      (step) =>
        step.name === 'Reuse prepared E2E image bundle' &&
        step.run ===
          `node scripts/ci/e2e-image-bundle.js pull --frontend ${githubExpression('matrix.bundle_frontend')}`
    )
  );
  assert.deepEqual(
    migration.strategy.matrix.include.map((entry) => entry.bundle_frontend),
    ['tanstack', 'both']
  );

  assert.deepEqual(cleanup.needs, [
    'check-ci',
    'prepare-e2e-images',
    'e2e',
    'migration-e2e',
  ]);
  assert.match(cleanup.if, /always\(\)/u);
  assert.ok(
    cleanup.steps.some(
      (step) =>
        step.name === "Delete this run's E2E image bundle" &&
        step.run.includes('cleanup --tag-prefix')
    )
  );
  assert.ok(
    producer.steps.some(
      (step) =>
        step.name === 'Remove abandoned E2E image bundles' &&
        step.run.endsWith('cleanup --stale-hours 24')
    )
  );
  assert.ok(
    producer.steps.some(
      (step) =>
        step.name === 'Build and publish E2E image bundle' &&
        step.run === 'node scripts/ci/e2e-image-bundle.js publish'
    )
  );
});

test('Supabase CLI workflows use tokenized retry setup', () => {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((fileName) => fileName.endsWith('.yaml'));
  const setupAction = fs.readFileSync(
    path.join(
      repoRoot,
      '.github',
      'actions',
      'setup-supabase-cli-with-retry',
      'action.yml'
    ),
    'utf8'
  );

  assert.match(
    setupAction,
    /BUN_INSTALL: \$\{\{ runner\.temp \}\}\/supabase-cli-bun/,
    'Supabase CLI setup must isolate its transient Bun install from repo Bun setup'
  );

  for (const workflowFile of workflowFiles) {
    const workflow = fs.readFileSync(
      path.join(workflowsDir, workflowFile),
      'utf8'
    );

    assert.doesNotMatch(
      workflow,
      /uses: supabase\/setup-cli@v2/,
      `${workflowFile} must use the local Supabase CLI setup retry action`
    );

    if (workflow.includes('./.github/actions/setup-supabase-cli-with-retry')) {
      assert.ok(
        workflow.indexOf('actions/checkout') <
          workflow.indexOf('./.github/actions/setup-supabase-cli-with-retry'),
        `${workflowFile} must checkout the repo before using the local Supabase CLI setup action`
      );
      assert.match(
        workflow,
        /github-token: \$\{\{ github\.token \}\}/,
        `${workflowFile} must pass github.token to avoid anonymous Supabase CLI release API limits`
      );
      assert.doesNotMatch(
        workflow,
        /version: latest/,
        `${workflowFile} must not resolve the Supabase CLI through the unauthenticated latest-release path`
      );
    }
  }

  assert.match(setupAction, /uses: supabase\/setup-cli@v2/);
  assert.match(setupAction, /github-token: \$\{\{ inputs\.github-token \}\}/);
  assert.match(setupAction, /continue-on-error: true/);
  assert.match(setupAction, /run: sleep 5/);
  assert.match(setupAction, /run: sleep 10/);
  assert.match(setupAction, /run: sleep 20/);
});

test('ci configuration gate runs TypeScript scripts with Node strip-types', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'ci-check.yml'),
    'utf8'
  );

  assert.match(workflow, /uses: actions\/setup-node@v6/);
  assert.match(workflow, /node-version: 24/);
  assert.match(
    workflow,
    /node --experimental-strip-types scripts\/ci\/resolve-changed-files\.ts/
  );
  assert.match(
    workflow,
    /node --experimental-strip-types scripts\/ci\/check-workflow-config\.ts/
  );
  assert.doesNotMatch(workflow, /oven-sh\/setup-bun@v2/);
  assert.doesNotMatch(
    workflow,
    /bun run --silent scripts\/ci\/(?:resolve-changed-files|check-workflow-config)\.ts/
  );
});

test('restricted ci-check callers grant deployment marker read access', () => {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((fileName) => /\.ya?ml$/.test(fileName));

  for (const workflowFile of workflowFiles) {
    const workflow = fs.readFileSync(
      path.join(workflowsDir, workflowFile),
      'utf8'
    );

    if (!workflow.includes('uses: ./.github/workflows/ci-check.yml')) {
      continue;
    }

    const jobsIndex = workflow.indexOf('\njobs:');
    const preamble = jobsIndex === -1 ? workflow : workflow.slice(0, jobsIndex);
    const restrictsTokenPermissions = /^permissions:\s*(?:\n|\{)/m.test(
      preamble
    );
    const workflowCanReadDeployments = /^ {2}deployments:\s*read\b/m.test(
      preamble
    );

    if (!restrictsTokenPermissions || workflowCanReadDeployments) {
      continue;
    }

    assert.match(
      workflow,
      /^ {2}check-ci:\n(?: {4}.*\n)* {4}permissions:\n(?: {6}.*\n)* {6}deployments:\s*read\b/m,
      `${workflowFile} check-ci job must grant deployments: read when top-level permissions restrict the token`
    );
  }
});

test('disabled ci entries still skip regardless of affected status', () => {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { getWorkflowDecision } from './tuturuuu.ts';
        const decision = getWorkflowDecision({
          changedFiles: ['apps/calendar/src/app/page.tsx'],
          ciConfig: { 'vercel-preview-calendar.yaml': false },
          workflowName: 'vercel-preview-calendar.yaml',
          workspaceManifests: [
            {
              dependencies: [],
              name: '@tuturuuu/calendar',
              path: 'apps/calendar',
            },
          ],
        });
        console.log(JSON.stringify(decision));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  const decision = JSON.parse(output);

  assert.equal(decision.shouldRun, false);
  assert.match(decision.reason, /disabled in tuturuuu\.ts/);
});
