const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');

test('reusable CI checker executes with only its declared sparse checkout', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-sparse-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci-check.yml'),
    'utf8'
  );
  const patterns = workflow
    .split('sparse-checkout: |\n')[1]
    .split('sparse-checkout-cone-mode:')[0]
    .trim()
    .split('\n')
    .map((line) => line.trim());
  for (const file of fs.globSync(patterns, { cwd: repoRoot })) {
    const destination = path.join(temporary, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, file), destination);
  }
  for (const workflowName of [
    'cron-control-cloudflare.yaml',
    'devbox-control-cloudflare.yaml',
    'rust-backend.yml',
  ]) {
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        'scripts/ci/check-workflow-config.ts',
        '--workflow',
        workflowName,
        '--event-name',
        'pull_request',
        '--changed-files',
        'tuturuuu.ts',
      ],
      {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_OUTPUT: path.join(temporary, 'github-output'),
        },
      }
    );
    assert.match(output, /Should run: (true|false)/, workflowName);
  }
});

const testPaths = [
  'apps/tools/src/app/[locale]/random/page.test.ts',
  'apps/tools/src/app/[locale]/random/random-generator.test.ts',
  'apps/tools/src/app/[locale]/random/random-generator-client.test.tsx',
];
const workspaceManifests = [
  { name: '@tuturuuu/tools', path: 'apps/tools', dependencies: [] },
];
function decision(input = {}) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `
    import { getWorkflowDecision } from './tuturuuu.ts';
    console.log(JSON.stringify(getWorkflowDecision(${JSON.stringify({
      workflowName: 'vercel-production-tools.yaml',
      eventName: 'push',
      workspaceManifests,
      ...input,
    })})));`,
      ],
      { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }
    )
  );
}

for (const filePath of testPaths) {
  test(`production skips verified test-only path ${filePath}`, () => {
    assert.equal(decision({ changedFiles: [filePath] }).shouldRun, false);
  });
}
test('production skips a nonempty verified test-only list', () => {
  assert.equal(decision({ changedFiles: testPaths }).shouldRun, false);
});
test('normalizes known test paths', () => {
  assert.equal(
    decision({ changedFiles: [`./${testPaths[0]}`] }).shouldRun,
    false
  );
  assert.equal(
    decision({ changedFiles: [testPaths[1].replaceAll('/', '\\')] }).shouldRun,
    false
  );
});
test('unknown and empty change evidence remains open', () => {
  for (const changedFiles of [undefined, null, [], ['']]) {
    assert.equal(decision({ changedFiles }).shouldRun, true);
  }
});
test('missing workspace evidence remains open', () => {
  assert.equal(
    decision({ changedFiles: testPaths, workspaceManifests: [] }).shouldRun,
    true
  );
});
test('manual dispatch remains open and disabled targets remain disabled', () => {
  assert.equal(
    decision({ changedFiles: testPaths, eventName: 'workflow_dispatch' })
      .shouldRun,
    true
  );
  assert.equal(
    decision({
      changedFiles: testPaths,
      ciConfig: { 'vercel-production-tools.yaml': false },
    }).shouldRun,
    false
  );
});
test('preview and validation CI still select test changes', () => {
  for (const workflowName of [
    'vercel-preview-tools.yaml',
    'unit-test.yaml',
    'type-check.yaml',
  ]) {
    assert.equal(
      decision({ changedFiles: testPaths, workflowName }).shouldRun,
      true
    );
  }
});
test('mixed runtime, unverified tests and build inputs still deploy', () => {
  for (const filePath of [
    'apps/tools/src/app/[locale]/random/page.tsx',
    'apps/tools/src/app/[locale]/random/new.test.ts',
    'apps/tools/src/app/[locale]/random/output.snap',
    'apps/tools/content.mdx',
    'apps/tools/data.json',
    'apps/tools/package.json',
    'apps/tools/next.config.ts',
    'apps/tools/public/manifest.json',
    'bun.lock',
    'package.json',
    'turbo.json',
    '.github/workflows/vercel-production-tools.yaml',
  ]) {
    const result = decision({ changedFiles: [...testPaths, filePath] });
    assert.equal(result.shouldRun, true, filePath);
    assert.ok(result.matchedPaths.includes(filePath), filePath);
  }
});

test('extracted planner helpers retain platform and migration gate coverage', () => {
  for (const filePath of [
    'scripts/ci/production-test-only-paths.ts',
    'scripts/ci/workspace-dependency-closure.ts',
  ]) {
    for (const workflowName of [
      'vercel-production-platform.yaml',
      'supabase-production.yaml',
      'supabase-staging.yaml',
    ]) {
      assert.equal(
        decision({
          changedFiles: [...testPaths, filePath],
          workflowName,
          ciConfig: { [workflowName]: true },
        }).shouldRun,
        true,
        `${workflowName}: ${filePath}`
      );
    }
  }
});
