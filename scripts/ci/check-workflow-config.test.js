const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const targetApps = [
  ['calendar', '@tuturuuu/calendar'],
  ['cms', '@tuturuuu/cms'],
  ['finance', '@tuturuuu/finance'],
  ['meet', '@tuturuuu/meet'],
  ['nova', '@tuturuuu/nova'],
  ['rewise', '@tuturuuu/rewise'],
  ['shortener', '@tuturuuu/shortener'],
  ['tasks', '@tuturuuu/tasks'],
  ['teach', '@tuturuuu/teach'],
  ['track', '@tuturuuu/track'],
  ['learn', '@tuturuuu/learn'],
];

const vercelWorkflows = [
  'calendar',
  'cms',
  'finance',
  'meet',
  'nova',
  'platform',
  'rewise',
  'shortener',
  'tasks',
  'teach',
  'track',
  'learn',
].flatMap((app) => [
  `vercel-preview-${app}.yaml`,
  `vercel-production-${app}.yaml`,
]);

function writePackageJson(rootDir, workspacePath, packageJson) {
  const packageDir = path.join(rootDir, workspacePath);
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

function workspaceDependencies(names) {
  return Object.fromEntries(names.map((name) => [name, 'workspace:*']));
}

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-config-'));

  writePackageJson(rootDir, 'apps/web', {
    dependencies: workspaceDependencies([
      '@tuturuuu/internal-api',
      '@tuturuuu/ui',
    ]),
    name: '@tuturuuu/web',
  });

  for (const [app, packageName] of targetApps) {
    const dependenciesByApp = {
      calendar: ['@tuturuuu/ui'],
      cms: ['@tuturuuu/satellite'],
      finance: ['@tuturuuu/satellite'],
      meet: ['@tuturuuu/satellite'],
      nova: ['@tuturuuu/types'],
      rewise: ['@tuturuuu/satellite'],
      shortener: ['@tuturuuu/vercel'],
      tasks: ['@tuturuuu/internal-api'],
      teach: ['@tuturuuu/ui'],
      track: ['@tuturuuu/satellite'],
      learn: ['@tuturuuu/ui'],
    };

    writePackageJson(rootDir, `apps/${app}`, {
      dependencies: workspaceDependencies(dependenciesByApp[app]),
      name: packageName,
    });
  }

  const packageDefinitions = {
    auth: ['@tuturuuu/supabase'],
    icons: [],
    'internal-api': ['@tuturuuu/types'],
    satellite: ['@tuturuuu/auth', '@tuturuuu/ui'],
    supabase: ['@tuturuuu/types'],
    types: [],
    ui: ['@tuturuuu/icons'],
    unused: [],
    vercel: [],
  };

  for (const [packageDir, dependencies] of Object.entries(packageDefinitions)) {
    writePackageJson(rootDir, `packages/${packageDir}`, {
      dependencies: workspaceDependencies(dependencies),
      name: `@tuturuuu/${packageDir}`,
    });
  }

  return rootDir;
}

function readWorkflowJobBlock(workflowName, jobName) {
  const source = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', workflowName),
    'utf8'
  );
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${jobName}:`);

  assert.notEqual(start, -1, `Expected ${workflowName} to define ${jobName}`);

  const nextJob = lines.findIndex(
    (line, index) => index > start && /^ {2}[A-Za-z0-9_-]+:$/.test(line)
  );
  const end = nextJob === -1 ? lines.length : nextJob;

  return lines.slice(start, end).join('\n');
}

function runWorkflowDecision({
  changedFiles,
  eventName = 'push',
  rootDir,
  workflowName,
}) {
  const output = execFileSync(
    'bun',
    [
      'run',
      '--silent',
      'scripts/ci/check-workflow-config.ts',
      '--workflow',
      workflowName,
      '--event-name',
      eventName,
      '--root-dir',
      rootDir,
      '--changed-files',
      changedFiles.join('\n'),
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );

  return {
    output,
    shouldRun: /Should run: true/.test(output),
  };
}

function assertWorkflowDecision(options, expectedShouldRun) {
  const decision = runWorkflowDecision(options);

  assert.equal(
    decision.shouldRun,
    expectedShouldRun,
    `${options.workflowName} output:\n${decision.output}`
  );

  return decision;
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

test('SDK trusted publishing keeps OIDC isolated to artifact publish job', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'release-sdk-package.yaml'),
    'utf8'
  );
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
  assert.doesNotMatch(workflow, /github\.event\.pull_request/);
  assert.doesNotMatch(workflow, /pull_request\.title/);

  assert.doesNotMatch(prepareJob, /id-token:\s*write/);
  assert.match(prepareJob, /npm pack --pack-destination/);
  assert.match(prepareJob, /actions\/upload-artifact@/);

  assert.match(publishJob, /id-token:\s*write/);
  assert.match(publishJob, /actions\/download-artifact@/);
  assert.match(publishJob, /Verify package artifact/);
  assert.match(
    publishJob,
    /npm publish "\$\{\{ steps\.artifact\.outputs\.path \}\}" --ignore-scripts/
  );
  assert.doesNotMatch(publishJob, /actions\/checkout@/);
  assert.doesNotMatch(publishJob, /setup-bun/);
  assert.doesNotMatch(publishJob, /\bbun install\b/);
  assert.doesNotMatch(publishJob, /\bnpm install\b/);
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
