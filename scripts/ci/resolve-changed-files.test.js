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
const { classifyScope } = require('./security-paths.js');

const MISSING_SHA = 'f'.repeat(40);

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
    workflowName: 'biome-check.yaml',
  });

  assert.match(resolver.output, /Changed-file source: push-compare/);
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

test('Supabase workflow runs diff from the last successful migration marker', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/database/supabase/migrations/001_example.sql',
    'select 1;\n',
    'database change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/web/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'web change'
  );
  const resolver = runChangedFileResolver({
    env: {
      DEPLOYMENT_MARKER_SHA: baseSha,
    },
    eventName: 'workflow_run',
    headSha,
    refName: 'main',
    rootDir,
    workflowName: 'supabase-staging.yaml',
  });

  assert.match(resolver.output, /Changed-file source: deployment-marker/);
  assert.deepEqual(resolver.changedFiles, [
    'apps/database/supabase/migrations/001_example.sql',
    'apps/web/src/app/page.tsx',
  ]);

  assertWorkflowDecision(
    {
      changedFiles: resolver.changedFiles,
      rootDir,
      workflowName: 'supabase-staging.yaml',
    },
    true
  );
});

test('enabled Vercel gating fails open when no successful deployment marker exists', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/storefront/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'storefront change'
  );
  const previousSha = git(rootDir, ['rev-parse', 'HEAD']);
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/github-actions-runbook.mdx',
    'docs only\n',
    'docs change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: previousSha,
    commits: [
      {
        added: [],
        modified: ['apps/docs/build/devops/github-actions-runbook.mdx'],
        removed: [],
      },
    ],
    size: 1,
  });
  const workflowName = 'vercel-production-storefront.yaml';
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName,
  });

  assert.equal(resolver.changedFiles, null);
  assert.match(
    resolver.output,
    /Changed-file source: deployment-marker-unavailable/
  );
  assert.match(resolver.output, /affected gating must fail open/);

  assertWorkflowDecision(
    {
      changedFiles: resolver.changedFiles,
      rootDir,
      workflowName,
    },
    true
  );
});

// Squash and admin merges push commits[] entries without file lists; the
// resolver must diff the pushed range instead of reporting zero paths.
test('changed-file resolver diffs before..after when push payload lists no files', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const baseSha = commitFile(
    rootDir,
    'apps/web/src/legacy.ts',
    'export {};\n',
    'seed'
  );
  commitFile(
    rootDir,
    'packages/start-bridge/src/intl/localized-path.ts',
    'export {};\n',
    'bridge change'
  );
  git(rootDir, ['rm', '-q', 'apps/web/src/legacy.ts']);
  git(rootDir, ['commit', '-m', 'remove legacy']);
  const headSha = git(rootDir, ['rev-parse', 'HEAD']);
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: baseSha,
    commits: [{ added: [], modified: [], removed: [] }],
    size: 1,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName: 'codeql.yml',
  });

  assert.match(resolver.output, /Changed-file source: push-compare/);
  assert.deepEqual(resolver.changedFiles, [
    'apps/web/src/legacy.ts',
    'packages/start-bridge/src/intl/localized-path.ts',
  ]);
  assert.deepEqual(classifyScope(resolver.changedFiles).codeqlLanguages, [
    'javascript-typescript',
  ]);
});

test('changed-file resolver uses payload file lists when the push range is not checked out', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/calendar/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'calendar change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: MISSING_SHA,
    commits: [
      { added: [], modified: ['apps/calendar/src/app/page.tsx'], removed: [] },
    ],
    size: 1,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName: 'codeql.yml',
  });

  assert.match(resolver.output, /Changed-file source: push-payload:1-commit/);
  assert.deepEqual(resolver.changedFiles, ['apps/calendar/src/app/page.tsx']);
});

test('an empty-files push payload without a resolvable range runs every scan', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/web/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'web change'
  );
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: MISSING_SHA,
    commits: [{ added: [], modified: [], removed: [] }],
    size: 1,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName: 'codeql.yml',
  });

  assert.equal(resolver.changedFiles, null);
  assert.match(resolver.output, /Changed-file state: unavailable/);
  assert.match(resolver.output, /affected gating must fail open/);

  const scope = classifyScope(resolver.changedFiles);
  assert.deepEqual(scope.codeqlLanguages, [
    'actions',
    'javascript-typescript',
    'python',
  ]);
  assert.equal(scope.dependencies, true);
  assert.equal(scope.workflows, true);
});

test('a non-empty push whose range diff is empty fails open', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  git(rootDir, ['commit', '--allow-empty', '-m', 'empty']);
  const headSha = git(rootDir, ['rev-parse', 'HEAD']);
  const eventPath = writeEventPayload(rootDir, {
    after: headSha,
    before: baseSha,
    commits: [{ added: [], modified: [], removed: [] }],
    size: 1,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName: 'security-checks.yaml',
  });

  assert.equal(resolver.changedFiles, null);
  assert.match(resolver.output, /affected gating must fail open/);
});

test('changed-file resolver does not fall back to latest commit only when push range is unavailable', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
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
    before: MISSING_SHA,
    commits: [],
    size: 2,
  });
  const resolver = runChangedFileResolver({
    eventPath,
    headSha,
    rootDir,
    workflowName: 'biome-check.yaml',
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

test('workflow gating reuses manifest indexes for equivalent arrays', () => {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { getWorkflowDecision } from './tuturuuu.ts';

        const input = {
          changedFiles: ['package.json'],
          workflowName: 'vercel-preview-calendar.yaml',
        };
        getWorkflowDecision({
          ...input,
          workspaceManifests: [
            {
              dependencies: [],
              name: '@tuturuuu/calendar',
              path: 'apps/calendar',
            },
          ],
        });

        const reads = { dependencies: 0, name: 0, path: 0 };
        const observedManifest = {
          get dependencies() {
            reads.dependencies += 1;
            return [];
          },
          get name() {
            reads.name += 1;
            return '@tuturuuu/calendar';
          },
          get path() {
            reads.path += 1;
            return 'apps/calendar';
          },
        };
        const decision = getWorkflowDecision({
          ...input,
          workspaceManifests: [observedManifest],
        });

        console.log(JSON.stringify({ decision, reads }));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  const { decision, reads } = JSON.parse(output);

  assert.equal(decision.shouldRun, true);
  assert.deepEqual(reads, { dependencies: 1, name: 1, path: 1 });
});
