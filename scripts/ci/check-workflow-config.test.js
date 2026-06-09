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
