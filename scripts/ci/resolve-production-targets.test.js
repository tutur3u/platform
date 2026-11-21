const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  commitFile,
  createFixtureRoot,
  initializeGitRepo,
  repoRoot,
  writeEventPayload,
} = require('./workflow-config-test-helpers.js');

const testTargets = [
  {
    app: 'meet',
    appPath: 'apps/meet',
    additionalPaths: ['apps/meet-realtime/'],
    packageName: '@tuturuuu/meet',
    productionWorkflow: 'meet-cloudflare.yaml',
  },
];

function resolveFixtureTargets({
  baseSha,
  headSha,
  rootDir,
  eventName = 'push',
  packageResume = false,
  expectedSha = '',
  targets = testTargets,
  eventPath = '',
  markerPayload = 'explicit',
  workflowMarkers,
  includeEvidence = false,
  liftExclusions = ['meet', 'mail', 'calendar', 'tasks'],
  // Hold semantics are exercised against Meet; admission has its own test.
  publicationPolicy = { meet: { state: 'held', reason: 'held for test' } },
}) {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { resolveProductionTargets } from './scripts/ci/resolve-production-targets.ts';
        import { productionAppExclusions, productionPublicationPolicy } from './tuturuuu.ci.ts';
        for (const app of ${JSON.stringify(liftExclusions)}) delete productionAppExclusions[app];
        const publicationPolicy = ${JSON.stringify(publicationPolicy)};
        if (publicationPolicy) Object.assign(productionPublicationPolicy, publicationPolicy);
        const markers = ${JSON.stringify(workflowMarkers)};
        globalThis.fetch = async (url) => {
          const parsed = new URL(url);
          const workflowName = parsed.searchParams.get('environment') + '.yaml';
          const marker = markers ? markers[workflowName]?.sha : ${JSON.stringify(baseSha)};
          const payloadType = markers?.[workflowName]?.kind ?? ${JSON.stringify(markerPayload)};
          const payload = payloadType === 'explicit'
            ? { workflowName, markerKind: 'deployment', refName: 'production' }
            : payloadType === 'build'
              ? { workflowName, markerKind: 'build', refName: 'production' }
              : {};
          const rows = parsed.pathname.endsWith('/deployments')
            ? (marker ? [{ id: 1, sha: marker, payload, statuses_url: 'https://api.example.test/statuses/1' }] : [])
            : [{ state: 'success' }];
          return { ok: true, json: async () => rows };
        };
        const decisions = await resolveProductionTargets({
          eventName: ${JSON.stringify(eventName)},
          packageResume: ${JSON.stringify(packageResume)},
          expectedSha: ${JSON.stringify(expectedSha)},
          headSha: ${JSON.stringify(headSha)},
          refName: 'production',
          rootDir: ${JSON.stringify(rootDir)},
          targets: ${JSON.stringify(targets)},
        });
        console.log(JSON.stringify(${JSON.stringify(includeEvidence)} ? decisions : decisions.map(({ shouldRun, workflowName }) => ({ shouldRun, workflowName }))));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        GITHUB_TOKEN: 'fixture-token',
        GITHUB_REPOSITORY: 'fixture/repo',
        GITHUB_EVENT_PATH: eventPath,
        DEPLOYMENT_MARKER_SHA: '',
        VERCEL_DEPLOYMENT_MARKER_SHA: workflowMarkers ? '' : baseSha,
      },
    }
  );

  return JSON.parse(output);
}

const controlTargets = [
  { productionWorkflow: 'cron-control-cloudflare.yaml' },
  { productionWorkflow: 'devbox-control-cloudflare.yaml' },
];

for (const [changedPath, expectedSelection] of [
  ['apps/cron-control/src/worker.ts', [true, false]],
  ['packages/sdk/src/platform-devbox/client.ts', [false, true]],
  ['apps/docs/build/devops/notes.mdx', [false, false]],
]) {
  test(`package recovery selects control Workers from markers for ${changedPath}`, () => {
    const rootDir = createFixtureRoot();
    const baseSha = initializeGitRepo(rootDir);
    const headSha = commitFile(
      rootDir,
      changedPath,
      'changed\n',
      'target change'
    );
    // Real recovery has dispatch inputs, not a push before/after range.
    const eventPath = writeEventPayload(rootDir, {
      inputs: { package_resume: 'true', expected_sha: headSha },
    });
    const decisions = resolveFixtureTargets({
      baseSha,
      headSha,
      rootDir,
      eventName: 'workflow_dispatch',
      packageResume: true,
      expectedSha: headSha,
      targets: controlTargets,
      eventPath,
    });
    assert.deepEqual(
      decisions.map(({ shouldRun }) => shouldRun),
      expectedSelection
    );
  });
}

const secretSyncTargets = [
  { productionWorkflow: 'lettin-cloudflare.yaml' },
  { productionWorkflow: 'parley-cloudflare.yaml' },
  { productionWorkflow: 'devbox-control-cloudflare.yaml' },
  { productionWorkflow: 'cron-control-cloudflare.yaml' },
];

test('commit-driven selection fails closed for Cloudflare Workers without a success marker', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/lettin/src/app/page.tsx',
    'export default function Page() {}\n',
    'runtime change after a failed release'
  );
  const decisions = resolveFixtureTargets({
    baseSha: '',
    headSha,
    rootDir,
    targets: secretSyncTargets,
    workflowMarkers: {},
    includeEvidence: true,
  });
  assert.equal(decisions.length, secretSyncTargets.length);
  for (const decision of decisions) {
    assert.equal(decision.shouldRun, false, decision.workflowName);
    assert.equal(decision.held, true, decision.workflowName);
    if (
      decision.workflowName === 'lettin-cloudflare.yaml' ||
      decision.workflowName === 'parley-cloudflare.yaml'
    ) {
      assert.equal(decision.changeResult.source, 'publication-hold');
      assert.match(decision.reason, /^held: /u);
      continue;
    }
    assert.equal(
      decision.changeResult.source,
      'deployment-marker-unavailable',
      decision.workflowName
    );
    assert.match(decision.reason, /fails closed/u);
  }
});

test('a recorded success marker restores commit-driven Cloudflare selection', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/devbox-control/src/app/page.tsx',
    'export default function Page() {}\n',
    'runtime change after a recorded release'
  );
  const decisions = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    targets: [{ productionWorkflow: 'devbox-control-cloudflare.yaml' }],
    workflowMarkers: { 'devbox-control-cloudflare.yaml': { sha: baseSha } },
  });
  assert.deepEqual(decisions, [
    { shouldRun: true, workflowName: 'devbox-control-cloudflare.yaml' },
  ]);
});

test('operator dispatch remains an explicit admission without Cloudflare markers', () => {
  const rootDir = createFixtureRoot();
  const headSha = initializeGitRepo(rootDir);
  const decisions = resolveFixtureTargets({
    baseSha: '',
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
    targets: secretSyncTargets,
    workflowMarkers: {},
  });
  assert.deepEqual(
    decisions.map(({ shouldRun, workflowName }) => ({
      shouldRun,
      workflowName,
    })),
    [
      { shouldRun: false, workflowName: 'lettin-cloudflare.yaml' },
      { shouldRun: false, workflowName: 'parley-cloudflare.yaml' },
      { shouldRun: true, workflowName: 'devbox-control-cloudflare.yaml' },
      { shouldRun: true, workflowName: 'cron-control-cloudflare.yaml' },
    ]
  );
});

const slotExclusions = [
  ['lettin', 'lettin-cloudflare.yaml', 'apps/lettin/src/app/page.tsx'],
  ['parley', 'parley-cloudflare.yaml', 'apps/parley/src/app/page.tsx'],
  ['colab', 'colab-cloudflare.yaml', 'apps/colab/src/app/page.tsx'],
];

for (const [app, workflow, changedPath] of slotExclusions) {
  test(`${app} affected change stays held on push and dispatch until its exclusion line is removed`, () => {
    const rootDir = createFixtureRoot();
    const baseSha = initializeGitRepo(rootDir);
    const headSha = commitFile(
      rootDir,
      changedPath,
      'export default function Page() {}\n',
      `${app} affected change`
    );
    const targets = [{ productionWorkflow: workflow }];
    const workflowMarkers = { [workflow]: { sha: baseSha } };
    for (const eventName of ['push', 'workflow_dispatch']) {
      const [decision] = resolveFixtureTargets({
        baseSha,
        headSha,
        rootDir,
        eventName,
        targets,
        workflowMarkers,
        includeEvidence: true,
      });
      assert.equal(decision.shouldRun, false, eventName);
      assert.equal(decision.held, true, eventName);
      assert.equal(decision.changeResult.source, 'publication-hold', eventName);
      assert.match(
        decision.reason,
        new RegExp(`^held: ${app[0].toUpperCase()}${app.slice(1)} `, 'u')
      );
    }
    const [liftedPush] = resolveFixtureTargets({
      baseSha,
      headSha,
      rootDir,
      targets,
      workflowMarkers,
      liftExclusions: [app],
    });
    assert.deepEqual(liftedPush, { shouldRun: true, workflowName: workflow });
    const [liftedDispatch] = resolveFixtureTargets({
      baseSha,
      headSha,
      rootDir,
      eventName: 'workflow_dispatch',
      targets,
      workflowMarkers,
      liftExclusions: [app],
    });
    assert.deepEqual(liftedDispatch, {
      shouldRun: true,
      workflowName: workflow,
    });
  });
}

test('control recovery without deployment markers still fails open safely', () => {
  const rootDir = createFixtureRoot();
  const headSha = initializeGitRepo(rootDir);
  const decisions = resolveFixtureTargets({
    baseSha: '',
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
    packageResume: true,
    expectedSha: headSha,
    targets: controlTargets,
    eventPath: writeEventPayload(rootDir, {
      inputs: { package_resume: 'true' },
    }),
  });
  assert.deepEqual(
    decisions.map(({ shouldRun }) => shouldRun),
    [true, true]
  );
});

test('planner summary visibly distinguishes publication holds from unchanged apps', () => {
  const { mkdtempSync, readFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const summary = join(
    mkdtempSync(join(tmpdir(), 'hold-summary-')),
    'summary.md'
  );
  execFileSync(
    'bun',
    [
      '--eval',
      `
    import { appendStepSummary } from './scripts/ci/resolve-production-targets.ts';
    appendStepSummary([{ workflowName: 'meet-cloudflare.yaml', held: true,
      shouldRun: false, reason: 'held for wave-1 cutover',
      changeResult: { source: 'publication-hold' } }], ${JSON.stringify(summary)});
  `,
    ],
    { cwd: repoRoot }
  );
  assert.match(readFileSync(summary, 'utf8'), /Held.*held for wave-1 cutover/);
  const { readWorkflowJobBlock } = require('./workflow-config-test-helpers.js');
  assert.match(
    readWorkflowJobBlock('meet-cloudflare.yaml', 'deploy'),
    /needs.production-policy.outputs.allowed == 'true'/
  );
});

test('recovery mode refuses an unpinned or mismatched SHA', () => {
  const rootDir = createFixtureRoot();
  const headSha = initializeGitRepo(rootDir);
  for (const expectedSha of ['', 'a'.repeat(40)]) {
    assert.throws(
      () =>
        resolveFixtureTargets({
          baseSha: headSha,
          headSha,
          rootDir,
          eventName: 'workflow_dispatch',
          packageResume: true,
          expectedSha,
        }),
      /Package recovery requires the exact production dispatch SHA/
    );
  }
});
