const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  commitFile,
  createFixtureRoot,
  initializeGitRepo,
  repoRoot,
} = require('./workflow-config-test-helpers.js');

const testTargets = [
  {
    app: 'meet',
    appPath: 'apps/meet',
    additionalPaths: ['apps/meet-realtime/'],
    packageName: '@tuturuuu/meet',
    productionWorkflow: 'meet-cloudflare.yaml',
  },
  {
    app: 'calendar',
    appPath: 'apps/calendar',
    packageName: '@tuturuuu/calendar',
    previewWorkflow: 'vercel-preview-calendar.yaml',
    productionWorkflow: 'vercel-production-calendar.yaml',
  },
  {
    app: 'storefront',
    appPath: 'apps/storefront',
    packageName: '@tuturuuu/storefront',
    previewWorkflow: 'vercel-preview-storefront.yaml',
    productionWorkflow: 'vercel-production-storefront.yaml',
  },
];

function resolveFixtureTargets({ baseSha, headSha, rootDir }) {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { resolveProductionVercelTargets } from './scripts/ci/resolve-production-vercel-targets.ts';
        const decisions = await resolveProductionVercelTargets({
          eventName: 'push',
          headSha: ${JSON.stringify(headSha)},
          refName: 'production',
          rootDir: ${JSON.stringify(rootDir)},
          targets: ${JSON.stringify(testTargets)},
        });
        console.log(JSON.stringify(decisions.map(({ shouldRun, workflowName }) => ({ shouldRun, workflowName }))));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        VERCEL_DEPLOYMENT_MARKER_SHA: baseSha,
      },
    }
  );

  return JSON.parse(output);
}

test('production planner evaluates every app from its deployment baseline in one process', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/storefront/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'storefront change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/github-actions-runbook.mdx',
    'docs only\n',
    'later docs change'
  );
  const decisions = resolveFixtureTargets({ baseSha, headSha, rootDir });

  assert.deepEqual(decisions, [
    {
      shouldRun: false,
      workflowName: 'meet-cloudflare.yaml',
    },
    {
      shouldRun: false,
      workflowName: 'vercel-production-calendar.yaml',
    },
    {
      shouldRun: true,
      workflowName: 'vercel-production-storefront.yaml',
    },
  ]);
});

test('production planner includes Cloudflare for shared Meet runtime changes', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/meet-realtime/src/worker.ts',
    'export const changed = true;\n',
    'meet realtime change'
  );

  assert.deepEqual(resolveFixtureTargets({ baseSha, headSha, rootDir }), [
    { shouldRun: true, workflowName: 'meet-cloudflare.yaml' },
    { shouldRun: false, workflowName: 'vercel-production-calendar.yaml' },
    { shouldRun: false, workflowName: 'vercel-production-storefront.yaml' },
  ]);
});

test('production planner retries Cloudflare when no successful marker exists', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/notes.mdx',
    'docs only\n',
    'docs change'
  );

  const decisions = resolveFixtureTargets({ baseSha: '', headSha, rootDir });
  assert.equal(decisions[0].workflowName, 'meet-cloudflare.yaml');
  assert.equal(decisions[0].shouldRun, true);
});
