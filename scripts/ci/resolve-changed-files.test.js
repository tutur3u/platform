const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  assertWorkflowDecision,
  commitFile,
  createFixtureRoot,
  git,
  initializeGitRepo,
  repoRoot,
  runChangedFileResolver,
  writeEventPayload,
} = require('./workflow-config-test-helpers.js');

test('changed-file resolver unions batched push commits before workflow gating', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const appSha = commitFile(
    rootDir,
    'apps/calendar/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'calendar change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/github-actions-runbook.mdx',
    'docs only\n',
    'docs change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: baseSha,
    commits: [
      {
        added: ['apps/calendar/src/app/page.tsx'],
        modified: [],
        removed: [],
      },
      {
        added: [],
        modified: ['apps/docs/build/devops/github-actions-runbook.mdx'],
        removed: [],
      },
    ],
    size: 2,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
  });

  assert.match(resolver.output, /Changed-file source: push-payload:2-commits/);
  assert.deepEqual(resolver.changedFiles, [
    'apps/calendar/src/app/page.tsx',
    'apps/docs/build/devops/github-actions-runbook.mdx',
  ]);
  assert.notEqual(appSha, headSha);

  assertWorkflowDecision(
    {
      changedFiles: resolver.changedFiles,
      rootDir,
      workflowName: 'vercel-preview-calendar.yaml',
    },
    true
  );
});

test('changed-file resolver uses deployment marker baseline before latest push payload', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/calendar/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'calendar change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/github-actions-runbook.mdx',
    'docs only\n',
    'docs change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: git(rootDir, ['rev-parse', 'HEAD~1']),
    commits: [
      {
        added: [],
        modified: ['apps/docs/build/devops/github-actions-runbook.mdx'],
        removed: [],
      },
    ],
    size: 1,
  });
  const workflowName = 'vercel-preview-calendar.yaml';
  const resolver = runChangedFileResolver({
    env: {
      VERCEL_DEPLOYMENT_MARKER_SHA: baseSha,
    },
    eventPath,
    headSha,
    rootDir,
    workflowName,
  });

  assert.match(resolver.output, /Changed-file source: deployment-marker/);
  assert.deepEqual(resolver.changedFiles, [
    'apps/calendar/src/app/page.tsx',
    'apps/docs/build/devops/github-actions-runbook.mdx',
  ]);

  assertWorkflowDecision(
    {
      changedFiles: resolver.changedFiles,
      rootDir,
      workflowName,
    },
    true
  );
});

test('changed-file resolver does not fall back to latest commit only when push range is unavailable', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/calendar/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'calendar change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/github-actions-runbook.mdx',
    'docs only\n',
    'docs change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: baseSha,
    commits: [],
    size: 2,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
  });

  assert.equal(resolver.changedFiles, null);
  assert.match(resolver.output, /Changed-file state: unavailable/);
  assert.doesNotMatch(resolver.output, /github-actions-runbook\.mdx/);

  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { getWorkflowDecision } from './tuturuuu.ts';
        const decision = getWorkflowDecision({
          changedFiles: null,
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

  assert.equal(decision.shouldRun, true);
  assert.match(decision.reason, /changed-file state is unavailable/);
});
