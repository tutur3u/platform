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
  liftExclusions = [],
  // Hold semantics are exercised against Meet; admission has its own test.
  publicationPolicy = { meet: { state: 'held', reason: 'held for test' } },
}) {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
        import { resolveProductionVercelTargets } from './scripts/ci/resolve-production-vercel-targets.ts';
        import { ci } from './tuturuuu.ts';
        import { productionAppExclusions, productionPublicationPolicy } from './tuturuuu.ci.ts';
        for (const app of ${JSON.stringify(liftExclusions)}) delete productionAppExclusions[app];
        const publicationPolicy = ${JSON.stringify(publicationPolicy)};
        if (publicationPolicy) Object.assign(productionPublicationPolicy, publicationPolicy);
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

test('production planner holds Cloudflare for shared Meet runtime changes', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/meet-realtime/src/worker.ts',
    'export const changed = true;\n',
    'meet realtime change'
  );

  assert.deepEqual(resolveFixtureTargets({ baseSha, headSha, rootDir }), [
    { shouldRun: false, workflowName: 'meet-cloudflare.yaml' },
    { shouldRun: false, workflowName: 'vercel-production-calendar.yaml' },
    { shouldRun: false, workflowName: 'vercel-production-storefront.yaml' },
  ]);
});

test('the Meet exclusion holds an admitted Meet on push and dispatch until that line is removed', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/meet/src/app/page.tsx',
    'export default function Page() {}\n',
    'meet frontend change'
  );
  const publicationPolicy = {
    meet: {
      state: 'admitted',
      reason: 'reviewed cutover',
      surfaces: ['frontend', 'realtime-do'],
    },
  };
  const targets = [
    {
      app: 'meet',
      appPath: 'apps/meet',
      additionalPaths: ['apps/meet-realtime/'],
      productionWorkflow: 'meet-cloudflare.yaml',
    },
  ];
  const workflowMarkers = { 'meet-cloudflare.yaml': { sha: baseSha } };
  for (const eventName of ['push', 'workflow_dispatch']) {
    const [meet] = resolveFixtureTargets({
      baseSha,
      headSha,
      rootDir,
      eventName,
      targets,
      publicationPolicy,
      workflowMarkers,
      includeEvidence: true,
    });
    assert.equal(meet.shouldRun, false, eventName);
    assert.equal(meet.held, true, eventName);
    assert.equal(meet.changeResult.source, 'publication-hold', eventName);
    assert.match(
      meet.reason,
      /^held: Meet excluded until the frontend startup failure is tested$/u,
      eventName
    );
  }
  for (const eventName of ['push', 'workflow_dispatch']) {
    const [meet] = resolveFixtureTargets({
      baseSha,
      headSha,
      rootDir,
      eventName,
      targets,
      publicationPolicy,
      workflowMarkers,
      liftExclusions: ['meet'],
    });
    assert.deepEqual(meet, {
      shouldRun: true,
      workflowName: 'meet-cloudflare.yaml',
    });
  }
});

test('production hold overrides missing Cloudflare deployment markers', () => {
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
  assert.equal(decisions[0].shouldRun, false);
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
  assert.equal(manual.filter((decision) => decision.shouldRun).length, 1);
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
    decisions.map(({ shouldRun, workflowName }) => ({ shouldRun, workflowName })),
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
  ['track', 'vercel-production-track.yaml', 'apps/track/src/app/page.tsx'],
  ['mind', 'vercel-production-mind.yaml', 'apps/mind/src/app/page.tsx'],
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
      assert.match(decision.reason, new RegExp(`^held: ${app[0].toUpperCase()}${app.slice(1)} `, 'u'));
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
    assert.deepEqual(liftedDispatch, { shouldRun: true, workflowName: workflow });
  });
}

test('a non-held app still runs beside the slot exclusions, and Web is not listed', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/lettin/src/app/page.tsx',
    'export default function Page() {}\n',
    'lettin change'
  );
  const headSha = commitFile(
    rootDir,
    'apps/storefront/src/app/page.tsx',
    'export default function Page() { return null; }\n',
    'storefront change'
  );
  const decisions = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    targets: [
      { productionWorkflow: 'lettin-cloudflare.yaml' },
      { productionWorkflow: 'vercel-production-storefront.yaml' },
    ],
    workflowMarkers: { 'lettin-cloudflare.yaml': { sha: baseSha } },
    includeEvidence: true,
  });
  assert.equal(decisions[0].shouldRun, false);
  assert.equal(decisions[0].changeResult.source, 'publication-hold');
  assert.equal(decisions[1].shouldRun, true);
  assert.equal(decisions[1].workflowName, 'vercel-production-storefront.yaml');
  const [web] = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
    targets: [{ productionWorkflow: 'vercel-production-platform.yaml' }],
  });
  assert.deepEqual(web, {
    shouldRun: true,
    workflowName: 'vercel-production-platform.yaml',
  });
  const listed = execFileSync(
    'bun',
    [
      '--eval',
      `import { ci, productionAppExclusions } from './tuturuuu.ci.ts';
       const keys = Object.keys(productionAppExclusions).sort();
       if (keys.includes('web') || keys.includes('platform') || keys.includes('finance') || keys.includes('storefront')) throw new Error(keys.join(','));
       if (ci['meet-cloudflare.yaml'] !== true) throw new Error('meet switchboard flipped');
       console.log(keys.join(','));`,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(listed.trim(), 'colab,lettin,meet,mind,parley,track');
});

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
    [true, false, false, true]
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

const toolsTarget = [
  {
    app: 'tools',
    appPath: 'apps/tools',
    packageName: '@tuturuuu/tools',
    previewWorkflow: 'vercel-preview-tools.yaml',
    productionWorkflow: 'vercel-production-tools.yaml',
  },
];

test('production planner skips verified tests since the deployment marker', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/tools/src/app/[locale]/random/page.test.ts',
    '// test only\n',
    'test-only change'
  );
  const decisions = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    targets: toolsTarget,
  });
  assert.deepEqual(decisions, [
    { shouldRun: false, workflowName: 'vercel-production-tools.yaml' },
  ]);
});

test('test-only head does not hide earlier undeployed runtime changes', () => {
  const rootDir = createFixtureRoot();
  const baseSha = initializeGitRepo(rootDir);
  commitFile(
    rootDir,
    'apps/tools/src/app/[locale]/random/page.tsx',
    'export default function Page() { return null; }\n',
    'pending runtime'
  );
  const headSha = commitFile(
    rootDir,
    'apps/tools/src/app/[locale]/random/page.test.ts',
    '// test only\n',
    'test-only head'
  );
  const decisions = resolveFixtureTargets({
    baseSha,
    headSha,
    rootDir,
    targets: toolsTarget,
  });
  assert.deepEqual(decisions, [
    { shouldRun: true, workflowName: 'vercel-production-tools.yaml' },
  ]);
});

test('test-only changes cannot close a missing production baseline', () => {
  const rootDir = createFixtureRoot();
  initializeGitRepo(rootDir);
  const headSha = commitFile(
    rootDir,
    'apps/tools/src/app/[locale]/random/page.test.ts',
    '// test only\n',
    'test-only change without marker'
  );
  const decisions = resolveFixtureTargets({
    baseSha: '',
    headSha,
    rootDir,
    targets: toolsTarget,
  });
  assert.deepEqual(decisions, [
    { shouldRun: true, workflowName: 'vercel-production-tools.yaml' },
  ]);
});

for (const eventName of ['push', 'workflow_dispatch']) {
  test(`wave-1 publication holds override ${eventName} including unknown baselines`, () => {
    const rootDir = createFixtureRoot();
    const headSha = initializeGitRepo(rootDir);
    const workflows = [
      'meet-cloudflare.yaml',
      'calendar-cloudflare.yaml',
      'mail-cloudflare.yaml',
      'apps-cloudflare.yaml',
      ...['meet', 'calendar', 'mail', 'apps'].map(
        (app) => `vercel-production-${app}.yaml`
      ),
    ];
    const decisions = resolveFixtureTargets({
      baseSha: '',
      headSha,
      rootDir,
      eventName,
      targets: workflows.map((productionWorkflow) => ({ productionWorkflow })),
      publicationPolicy: Object.fromEntries(
        ['meet', 'calendar', 'mail', 'apps', 'shortener'].map((app) => [
          app,
          { state: 'held', reason: 'held for wave-1 cutover' },
        ])
      ),
      includeEvidence: true,
    });
    assert.equal(decisions.length, workflows.length);
    for (const decision of decisions) {
      assert.equal(decision.shouldRun, false);
      assert.equal(decision.held, true);
      assert.equal(
        decision.reason,
        decision.workflowName.includes('meet')
          ? 'held: Meet excluded until the frontend startup failure is tested'
          : 'held for wave-1 cutover'
      );
    }
  });
}

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
    import { appendStepSummary } from './scripts/ci/resolve-production-vercel-targets.ts';
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

test('every other production app retains switchboard dispatch behavior', () => {
  const rootDir = createFixtureRoot();
  const headSha = initializeGitRepo(rootDir);
  const decisions = resolveFixtureTargets({
    baseSha: '',
    headSha,
    rootDir,
    eventName: 'workflow_dispatch',
    targets: undefined,
    includeEvidence: true,
  });
  // Explicitly exercise the complete real production target inventory.
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
    import { cloudflareProductionTargets, vercelWorkflowTargets, getWorkflowDecision } from './tuturuuu.ts';
    import { productionPublicationHold } from './scripts/ci/production-publication-policy.ts';
    import { resolveProductionVercelTargets } from './scripts/ci/resolve-production-vercel-targets.ts';
    const targets = [...vercelWorkflowTargets, ...cloudflareProductionTargets];
    const decisions = await resolveProductionVercelTargets({ rootDir: ${JSON.stringify(rootDir)},
      targets, eventName: 'workflow_dispatch', refName: 'production' });
    for (const d of decisions) {
      if (productionPublicationHold(d.workflowName)) continue;
      const expected = getWorkflowDecision({ workflowName: d.workflowName,
        eventName: 'workflow_dispatch', changedFiles: null, workspaceManifests: [] });
      if (d.shouldRun !== expected.shouldRun) throw new Error(d.workflowName);
    }
    console.log('unchanged');
  `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        GITHUB_REPOSITORY: '',
        GITHUB_EVENT_PATH: '',
      },
    }
  );
  assert.match(output, /unchanged/);
  assert.ok(decisions.length);
});
