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
      workflowName: 'vercel-production-calendar.yaml',
    },
    {
      shouldRun: true,
      workflowName: 'vercel-production-storefront.yaml',
    },
  ]);
});
