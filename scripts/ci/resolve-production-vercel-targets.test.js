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
  platformEnabled,
  includeEvidence = false,
}) {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { resolveProductionVercelTargets } from './scripts/ci/resolve-production-vercel-targets.ts';
        import { ci } from './tuturuuu.ts';
        if (${JSON.stringify(platformEnabled)} !== undefined) {
          ci['vercel-production-platform.yaml'] = ${JSON.stringify(platformEnabled)};
        }
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
        const decisions = await resolveProductionVercelTargets({
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

test('exact package recovery retains push subset while normal manual dispatch selects all', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/storefront/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'storefront change'
  );
  const push = resolveFixtureTargets({ baseSha, headSha, rootDir });
  const recovery = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
    packageResume: true,
    expectedSha: headSha,
  });
  assert.deepEqual(recovery, push);
  assert.equal(recovery.filter((decision) => decision.shouldRun).length, 1);
  const manual = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
  });
  assert.equal(manual.filter((decision) => decision.shouldRun).length, 3);
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

test('recovery skips exact-marker targets while an older platform marker still deploys', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'packages/ui/src/changed.ts',
    'export const changed = true;\n',
    'shared package release'
  );
  const eventPath = writeEventPayload(rootDir, {
    inputs: { package_resume: 'true', expected_sha: headSha },
  });
  const recovery = (marker, targets) =>
    resolveFixtureTargets({
      baseSha: marker,
      headSha,
      rootDir,
      eventName: 'workflow_dispatch',
      packageResume: true,
      expectedSha: headSha,
      targets,
      eventPath,
    });
  assert.deepEqual(
    recovery(headSha, [
      ...controlTargets,
      { productionWorkflow: 'vercel-production-calendar.yaml' },
    ]).map(({ shouldRun }) => shouldRun),
    [false, false, false]
  );
  assert.deepEqual(
    recovery(baseSha, [
      { productionWorkflow: 'vercel-production-platform.yaml' },
    ]).map(({ shouldRun }) => shouldRun),
    [true]
  );
  assert.deepEqual(
    recovery(headSha, [
      { productionWorkflow: 'vercel-production-platform.yaml' },
    ]).map(({ shouldRun }) => shouldRun),
    [false]
  );
});

for (const markerPayload of ['automatic', 'build']) {
  test(`package recovery never accepts ${markerPayload} platform environment as promotion proof`, () => {
    const rootDir = createFixtureRoot();
    const headSha = initializeGitRepo(rootDir);
    const decisions = resolveFixtureTargets({
      baseSha: headSha,
      headSha,
      rootDir,
      eventName: 'workflow_dispatch',
      packageResume: true,
      expectedSha: headSha,
      targets: [{ productionWorkflow: 'vercel-production-platform.yaml' }],
      markerPayload,
    });
    assert.deepEqual(
      decisions.map(({ shouldRun }) => shouldRun),
      [true]
    );
  });
}

const platformWorkflow = 'vercel-production-platform.yaml';
const migrationWorkflow = 'supabase-production.yaml';

function migrationFixture() {
  const rootDir = createFixtureRoot();
  const migrationBase = initializeGitRepo(rootDir);
  const platformBase = commitFile(
    rootDir,
    'apps/database/supabase/migrations/20261007010000_pending.sql',
    '-- fixture migration source only\n',
    'migration source'
  );
  const headSha = commitFile(
    rootDir,
    'apps/docs/build/devops/notes.mdx',
    'unrelated docs\n',
    'later docs'
  );
  const resolve = (migrationSha, options = {}) =>
    resolveFixtureTargets({
      baseSha: headSha, // Must not override distinct per-workflow API baselines.
      headSha,
      rootDir,
      targets: [{ productionWorkflow: platformWorkflow }, ...testTargets],
      workflowMarkers: {
        [platformWorkflow]: { sha: platformBase },
        [migrationWorkflow]: { sha: migrationSha },
        ...Object.fromEntries(
          testTargets.map(({ productionWorkflow }) => [
            productionWorkflow,
            { sha: platformBase },
          ])
        ),
      },
      includeEvidence: true,
      ...options,
    });
  return { rootDir, migrationBase, platformBase, headSha, resolve };
}

test('distinct migration marker selects platform despite its newer unaffected deployment range', () => {
  const { migrationBase, platformBase, resolve } = migrationFixture();
  const decisions = resolve(migrationBase);
  assert.deepEqual(
    decisions.map(({ shouldRun }) => shouldRun),
    [true, false, false, false]
  );
  assert.equal(decisions[0].changeResult.baseSha, platformBase);
  assert.equal(decisions[0].migrationChangeResult.baseSha, migrationBase);
  assert.equal(decisions[0].migrationChangeResult.source, 'deployment-marker');
  assert.match(decisions[0].reason, /production database migrations/);
});

test('covered migration range leaves unrelated platform and other targets skipped', () => {
  const { platformBase, resolve } = migrationFixture();
  const decisions = resolve(platformBase);
  assert.deepEqual(
    decisions.map(({ shouldRun }) => shouldRun),
    [false, false, false, false]
  );
  assert.equal(decisions[0].migrationChangeResult.baseSha, platformBase);
});

for (const state of ['missing', 'nonancestor']) {
  test(`${state} migration range conservatively requires platform`, () => {
    const { rootDir, platformBase, resolve } = migrationFixture();
    const migrationSha =
      state === 'missing'
        ? ''
        : commitFile(
            rootDir,
            'apps/docs/future.mdx',
            'future branch\n',
            'future nonancestor'
          );
    const decisions = resolve(migrationSha);
    assert.equal(decisions[0].shouldRun, true);
    assert.equal(decisions[0].changeResult.baseSha, platformBase);
    assert.equal(decisions[0].migrationChangeResult.available, false);
  });
}

test('disabled platform and ordinary all-enabled dispatch retain configuration semantics', () => {
  const { migrationBase, resolve } = migrationFixture();
  assert.equal(
    resolve(migrationBase, { platformEnabled: false })[0].shouldRun,
    false
  );
  assert.deepEqual(
    resolve(migrationBase, { eventName: 'workflow_dispatch' }).map(
      ({ shouldRun }) => shouldRun
    ),
    [true, true, true, true]
  );
});

for (const kind of ['explicit', 'build', 'automatic']) {
  test(`exact ${kind} platform marker retains genuine prerequisite coverage semantics`, () => {
    const { migrationBase, headSha, resolve } = migrationFixture();
    const decisions = resolve(migrationBase, {
      workflowMarkers: {
        [platformWorkflow]: { sha: headSha, kind },
        [migrationWorkflow]: { sha: migrationBase },
      },
      targets: [{ productionWorkflow: platformWorkflow }],
    });
    assert.equal(decisions[0].shouldRun, kind !== 'explicit');
  });
}

test('package resume also consults independent pending migration range', () => {
  const { migrationBase, headSha, resolve } = migrationFixture();
  assert.equal(
    resolve(migrationBase, {
      eventName: 'workflow_dispatch',
      packageResume: true,
      expectedSha: headSha,
    })[0].shouldRun,
    true
  );
});

test('pending migration selection leaves Contacts on its own deployment range', () => {
  const { migrationBase, platformBase, resolve } = migrationFixture();
  const contacts = 'vercel-production-contacts.yaml';
  const decisions = resolve(migrationBase, {
    targets: [
      { productionWorkflow: platformWorkflow },
      { productionWorkflow: contacts },
    ],
    workflowMarkers: {
      [platformWorkflow]: { sha: platformBase },
      [migrationWorkflow]: { sha: migrationBase },
      [contacts]: { sha: platformBase },
    },
  });
  assert.deepEqual(
    decisions.map(({ shouldRun }) => shouldRun),
    [true, false]
  );
  assert.equal(decisions[1].changeResult.baseSha, platformBase);
  assert.equal(decisions[1].migrationChangeResult, undefined);
});
