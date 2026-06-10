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
      changedFiles: ['apps/qr/src/app/page.tsx'],
      rootDir,
      workflowName: 'vercel-preview-qr.yaml',
    },
    true
  );
  assertWorkflowDecision(
    {
      changedFiles: ['apps/qr/src/app/page.tsx'],
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

  assert.match(workflow, /run-with-backoff\.sh bun install --frozen-lockfile/);
  assert.match(setupAction, /setup-bun-with-backoff\.sh/);
  assert.match(setupScript, /BUN_SETUP_MAX_ATTEMPTS/);
  assert.match(setupScript, /delay=\$\(\(delay \* 2\)\)/);
  assert.match(retryScript, /CI_RETRY_MAX_ATTEMPTS/);
  assert.match(retryScript, /bun pm cache rm/);
  assert.match(retryScript, /delay=\$\(\(delay \* 2\)\)/);
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
