const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

const apps = [
  'lms',
  'forms',
  'inventory',
  'nova',
  'mind',
  'finance',
  'meet',
  'calendar',
  'mail',
  'apps',
  'workspace',
  'git',
  'shortener',
  'mastermind',
  'contacts',
];
test('preview-only apps remain scoped and are absent from the production plan', async () => {
  const {
    getWorkflowDecision,
    vercelProductionWorkflowTargets,
    vercelWorkflowTargets,
  } = await import('../../tuturuuu.ts');
  const previewOnly = vercelWorkflowTargets.filter(
    ({ productionWorkflow }) => productionWorkflow === null
  );
  assert.ok(previewOnly.length > 0);
  const { productionPublicationHold } =
    await import('./production-publication-policy.ts');
  const planner = readWorkflow('vercel-production.yaml');
  for (const { app, appPath, packageName, previewWorkflow } of previewOnly) {
    assert.ok(
      !vercelProductionWorkflowTargets.some((target) => target.app === app)
    );
    assert.ok(!Object.hasOwn(planner.jobs, `deploy-${app}`));
    assert.match(
      productionPublicationHold(`vercel-production-${app}.yaml`),
      /publisher retired/
    );
    assert.ok(
      !existsSync(
        join(repoRoot, '.github/workflows', `vercel-production-${app}.yaml`)
      )
    );
    assert.ok(existsSync(join(repoRoot, '.github/workflows', previewWorkflow)));
    const decide = (file) =>
      getWorkflowDecision({
        changedFiles: [file],
        eventName: 'push',
        workflowName: previewWorkflow,
        workspaceManifests: [
          { name: packageName, path: appPath, dependencies: [] },
        ],
      }).shouldRun;
    assert.equal(decide(`${appPath}/src/app/page.tsx`), true, previewWorkflow);
    assert.equal(decide('apps/web/src/unrelated.ts'), false, previewWorkflow);
  }
});

const heldPolicy = Object.fromEntries(
  apps.map((app) => [
    app,
    {
      state: 'held',
      reason: `held for wave-${app === 'shortener' ? 2 : 1} cutover`,
    },
  ])
);
const heldReason = /held for wave-\d cutover/;

const hasPublicationCommand = (publicationStepCommand) =>
  /vercel (?:pull|build|deploy)|wrangler (?:deploy|secret)|void-cf-publisher\.mjs (?:publish|assign)|'deploy', '--prebuilt'|cf deploy --prebuilt/.test(
    publicationStepCommand
  );

function publicationWrites(jobs) {
  return Object.entries(jobs).filter(([, value]) =>
    value.steps?.some(
      (step) =>
        hasPublicationCommand(step.run ?? step.with?.command ?? '') &&
        !/--dry-run/.test(step.run ?? step.with?.command ?? '')
    )
  );
}

function fixture(t, policy) {
  const root = mkdtempSync(join(tmpdir(), 'publication-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'scripts/safe-fs.js',
    'tuturuuu.ts',
    'tuturuuu.ci.ts',
    'scripts/ci/production-publication-policy.ts',
    'scripts/ci/wave1-native-publish.mjs',
    // The real ingress preflight and its imports; never a stub.
    'scripts/ci/wave1-ingress-preflight.mjs',
    'scripts/ci/wave1-ingress-topology.mjs',
    'scripts/ci/wave1-ingress-policies.mjs',
    'scripts/native-cutover/route-pattern.mjs',
    'scripts/wave1-staging/readback-probes.mjs',
    'scripts/ci/wave1-native-upload-error.mjs',
    'scripts/ci/wave1-native-upload-limits.mjs',
    'scripts/ci/wave1-native-admission.mjs',
    'scripts/ci/wave1-native-attempt.mjs',
    'scripts/ci/wave1-native-profile.mjs',
    'scripts/ci/release-recipe-config.mjs',
    'scripts/ci/wave1-source-admissions.mjs',
    'scripts/ci/wave1-native-profiles.json',
    'scripts/ci/wave1-native-artifact.mjs',
    'scripts/ci/wave1-native-source-maps.mjs',
    'scripts/ci/mail-node-imports.mjs',
    'scripts/ci/mail-node-scopes.mjs',
    'scripts/ci/calendar-native-inventory.mjs',
    'scripts/ci/mobile-build-selection.ts',
    'scripts/ci/production-test-only-paths.ts',
    'scripts/ci/tasks-production-inputs.ts',
    'scripts/ci/mastermind-production-target.ts',
    'scripts/ci/workspace-dependency-closure.ts',
    'scripts/ci/resolve-production-vercel-targets.ts',
    'scripts/ci/resolve-changed-files-core.ts',
    'scripts/ci/github-deployment-markers.ts',
    'scripts/ci/workflow-config-core.ts',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repoRoot, file), join(root, file));
  }
  // Fixtures assert publication-policy states, so the deny-list entries for
  // the policy-governed apps are cleared in the fixture copy.
  const exclusionConfig = join(root, 'tuturuuu.ci.ts');
  let exclusionSource = readFileSync(exclusionConfig, 'utf8');
  for (const app of ['meet', 'mail', 'calendar', 'tasks']) {
    exclusionSource = exclusionSource.replace(
      new RegExp(`\\n  ${app}:\\s*'[^']*',`),
      ''
    );
  }
  writeFileSync(exclusionConfig, exclusionSource);
  if (policy !== undefined) {
    const config = join(root, 'tuturuuu.ci.ts');
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        /export const productionPublicationPolicy = [\s\S]*$/,
        `export const productionPublicationPolicy = ${JSON.stringify(policy)};\n`
      )
    );
  }
  return root;
}

function plan(root, workflows, eventName = 'workflow_dispatch') {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '--eval',
        `
    import { resolveProductionVercelTargets } from './scripts/ci/resolve-production-vercel-targets.ts';
    const result = await resolveProductionVercelTargets({
      eventName: ${JSON.stringify(eventName)}, refName: 'production',
      rootDir: ${JSON.stringify(root)}, workspaceManifests: [],
      targets: ${JSON.stringify(workflows.map((productionWorkflow) => ({ productionWorkflow })))},
    });
    console.log(JSON.stringify(result));
  `,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_TOKEN: '',
          GITHUB_REPOSITORY: '',
          GITHUB_EVENT_PATH: '',
        },
      }
    )
  );
}

function runPolicy(root, workflow, command) {
  const output = join(root, 'output');
  const summary = join(root, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const env = {
    ...process.env,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary,
  };
  const stdout = command
    ? execFileSync('bash', ['-eu', '-c', command], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 10000,
      })
    : execFileSync(
        process.execPath,
        ['scripts/ci/production-publication-policy.ts', workflow, summary],
        { cwd: root, env, encoding: 'utf8', timeout: 10000 }
      );
  return {
    stdout,
    output: readFileSync(output, 'utf8'),
    summary: readFileSync(summary, 'utf8'),
  };
}

const mutations = {
  missing(policy, app) {
    delete policy[app];
  },
  empty(policy, app) {
    policy[app] = '';
  },
  malformed(policy, app) {
    policy[app] = { state: 'admitted', reason: 'reviewed' };
  },
  'removed hold without admission'(policy, app) {
    policy[app] = {};
  },
  'explicit hold'() {},
};
for (const app of apps.filter((name) => name !== 'mind')) {
  for (const [label, mutate] of Object.entries(mutations)) {
    test(`${app}: ${label} holds native/legacy planner targets and CLI`, (t) => {
      const policy = structuredClone(heldPolicy);
      mutate(policy, app);
      const workflows = [
        `${app}-cloudflare.yaml`,
        `vercel-production-${app}.yaml`,
      ];
      const root = fixture(t, policy);
      const decisions = plan(root, workflows);
      assert.deepEqual(plan(root, workflows, 'push'), decisions);
      assert.equal(decisions.length, 2);
      for (const [index, workflow] of workflows.entries()) {
        assert.equal(decisions[index].workflowName, workflow);
        assert.equal(decisions[index].shouldRun, false);
        assert.equal(decisions[index].held, true);
        assert.equal(decisions[index].changeResult.source, 'publication-hold');
        const expectedReason =
          workflow === 'vercel-production-forms.yaml' ||
          workflow === 'vercel-production-finance.yaml' ||
          workflow === 'vercel-production-nova.yaml' ||
          workflow === 'vercel-production-git.yaml'
            ? /publisher retired/
            : heldReason;
        assert.match(decisions[index].reason, expectedReason);
        const result = runPolicy(root, workflow);
        assert.equal(result.output, 'allowed=false\n');
        assert.match(result.stdout, expectedReason);
        assert.match(result.summary, expectedReason);
      }
    });
  }
}

for (const workflow of [
  'meet-cloudflare.yml',
  'vercel-production-meet.yml',
  'unknown.yaml',
  'supabase-production.yaml',
]) {
  test(`unknown publisher ${workflow} holds in planner and CLI`, (t) => {
    const root = fixture(t, heldPolicy);
    const [decision] = plan(root, [workflow]);
    assert.equal(decision.shouldRun, false);
    assert.equal(decision.held, true);
    assert.match(decision.reason, /unknown production workflow/);
    assert.equal(runPolicy(root, workflow).output, 'allowed=false\n');
  });
}

for (const invalidPolicy of [
  null,
  '',
  [],
  {},
  { ...heldPolicy, typo: { state: 'held', reason: 'held' } },
  { ...heldPolicy, mail: { state: 'held', reason: ' ' } },
  { ...heldPolicy, mail: { state: 'held', reason: 'held\nallowed=true' } },
  { ...heldPolicy, mail: { state: 'held', reason: 'held', allowed: true } },
  {
    ...heldPolicy,
    mail: { state: 'admitted', reason: 'reviewed', surfaces: ['unknown'] },
  },
  {
    ...heldPolicy,
    meet: {
      state: 'admitted',
      reason: 'frontend only',
      surfaces: ['frontend'],
    },
  },
]) {
  test(`invalid policy schema holds protected publication: ${JSON.stringify(invalidPolicy)}`, (t) => {
    const root = fixture(t, invalidPolicy);
    const [decision] = plan(root, ['meet-cloudflare.yaml']);
    assert.equal(decision.shouldRun, false);
    assert.equal(decision.held, true);
    assert.equal(
      runPolicy(root, 'meet-cloudflare.yaml').output,
      'allowed=false\n'
    );
  });
}

for (const app of apps.filter((name) => name !== 'mind')) {
  test(`${app}: explicit reviewed admission permits planner selection and native CLI`, (t) => {
    const policy = structuredClone(heldPolicy);
    policy[app] = {
      state: 'admitted',
      reason: 'qualified cutover reviewed',
      surfaces: app === 'meet' ? ['frontend', 'realtime-do'] : ['frontend'],
    };
    const workflow = `${app}-cloudflare.yaml`;
    const cloudflareCutover = {
      finance: 'finance-cloudflare.yaml',
      nova: 'nova-cloudflare.yaml',
      git: 'git-cloudflare.yaml',
    };
    const target =
      cloudflareCutover[app] ??
      ([
        'meet',
        'calendar',
        'mail',
        'apps',
        'forms',
        'workspace',
        'lms',
      ].includes(app)
        ? workflow
        : `vercel-production-${app}.yaml`);
    const root = fixture(t, policy);
    const [decision] = plan(root, [target]);
    assert.equal(decision.shouldRun, true);
    assert.notEqual(decision.held, true);
    assert.equal(runPolicy(root, workflow).output, 'allowed=true\n');
  });
}

const retiredSatelliteVercel = [
  'vercel-production-ai.yaml',
  'vercel-production-finance.yaml',
  'vercel-production-git.yaml',
  'vercel-production-infrastructure.yaml',
  'vercel-production-learn.yaml',
  'vercel-production-nova.yaml',
  'vercel-production-pay.yaml',
  'vercel-production-rewise.yaml',
  'vercel-production-storefront.yaml',
];
test('retired Vercel satellites stay held when protected policy is malformed', (t) => {
  const root = fixture(t, {});
  for (const workflow of retiredSatelliteVercel) {
    const [decision] = plan(root, [workflow]);
    assert.equal(decision.shouldRun, false, workflow);
    assert.equal(decision.held, true, workflow);
    assert.match(decision.reason, /publisher retired/);
    assert.equal(runPolicy(root, workflow).output, 'allowed=false\n');
  }
  const [inventory] = plan(root, ['vercel-production-inventory.yaml']);
  assert.doesNotMatch(inventory.reason, /publisher retired/);
});
test('Cloudflare-served satellites leave the Vercel planner and inventory stays', (t) => {
  const root = fixture(t);
  for (const workflow of retiredSatelliteVercel) {
    const [decision] = plan(root, [workflow]);
    assert.equal(decision.shouldRun, false, workflow);
    assert.match(decision.reason, /publisher retired/);
  }
  const [inventory] = plan(root, ['vercel-production-inventory.yaml']);
  assert.equal(inventory.shouldRun, true);
  assert.notEqual(inventory.held, true);
  assert.equal(runPolicy(root, 'git-cloudflare.yaml').output, 'allowed=true\n');
  const switchboard = readFileSync(join(repoRoot, 'tuturuuu.ci.ts'), 'utf8');
  for (const workflow of [
    ...retiredSatelliteVercel,
    'vercel-production-inventory.yaml',
    'git-cloudflare.yaml',
    'finance-cloudflare.yaml',
  ]) {
    assert.ok(switchboard.includes(`'${workflow}': true,`), workflow);
  }
  assert.equal(
    runPolicy(root, 'finance-cloudflare.yaml').output,
    'allowed=true\n'
  );
});

test('Calendar, Meet, Mail and Apps admissions open only their publishers while Shortener remains held', (t) => {
  const root = fixture(t);
  for (const workflow of ['calendar-cloudflare.yaml', 'meet-cloudflare.yaml'])
    assert.equal(runPolicy(root, workflow).output, 'allowed=true\n');
  for (const event of ['push', 'workflow_dispatch']) {
    const [native, legacy] = plan(
      root,
      ['calendar-cloudflare.yaml', 'vercel-production-calendar.yaml'],
      event
    );
    assert.equal(native.shouldRun, true);
    assert.equal(legacy.shouldRun, false);
    const [meetNative, meetLegacy] = plan(
      root,
      ['meet-cloudflare.yaml', 'vercel-production-meet.yaml'],
      event
    );
    // Admission opens the native publisher. Without a success marker, a
    // commit-driven push still fails closed; operator dispatch selects it.
    if (event === 'push') {
      assert.equal(meetNative.shouldRun, false);
      assert.equal(meetNative.held, true);
      assert.match(meetNative.reason, /fails closed/u);
    } else assert.equal(meetNative.shouldRun, true);
    assert.equal(meetLegacy.shouldRun, false);
  }
  for (const app of ['mail', 'apps'])
    assert.equal(
      runPolicy(root, `${app}-cloudflare.yaml`).output,
      'allowed=true\n'
    );
  assert.equal(
    runPolicy(root, 'shortener-cloudflare.yaml').output,
    'allowed=false\n'
  );
});

test('admitted apps refuse a dispatch of their switched-off Vercel publishers', (t) => {
  const root = fixture(t);
  const disabled = /disabled in the tuturuuu\.ci\.ts switchboard/;
  for (const app of ['calendar', 'meet', 'mail', 'apps']) {
    const legacy = runPolicy(root, `vercel-production-${app}.yaml`);
    assert.equal(legacy.output, 'allowed=false\n');
    assert.match(legacy.stdout, disabled);
    assert.match(legacy.summary, disabled);
    assert.equal(
      runPolicy(root, `${app}-cloudflare.yaml`).output,
      'allowed=true\n'
    );
  }
});

test('a known publisher switched off in the switchboard holds on dispatch', (t) => {
  const root = fixture(t);
  // Inventory stays on Vercel, so this is the publisher the switchboard still gates.
  const workflow = 'vercel-production-inventory.yaml';
  assert.equal(runPolicy(root, workflow).output, 'allowed=true\n');
  const config = join(root, 'tuturuuu.ci.ts');
  const source = readFileSync(config, 'utf8');
  assert.ok(source.includes(`'${workflow}': true,`));
  writeFileSync(
    config,
    source.replace(`'${workflow}': true,`, `'${workflow}': false,`)
  );
  const [decision] = plan(root, [workflow]);
  assert.equal(decision.shouldRun, false);
  assert.equal(decision.held, true);
  assert.match(decision.reason, /switchboard/);
  assert.equal(runPolicy(root, workflow).output, 'allowed=false\n');
});

test('Workspace admission opens only its route-free seal workflow and adds no publisher', (t) => {
  const root = fixture(t);
  assert.equal(
    runPolicy(root, 'workspace-cloudflare.yaml').output,
    'allowed=true\n'
  );
  // Admission is route-free upload only: no gateway routes, no Vercel publisher.
  assert.equal(
    existsSync(
      join(repoRoot, '.github/workflows/vercel-production-workspace.yaml')
    ),
    false
  );
  const { jobs } = readWorkflow('workspace-cloudflare.yaml');
  assert.deepEqual(
    publicationWrites(jobs).map(([name]) => name),
    []
  );
  assert.match(
    jobs['workspace-cutover-artifact'].if,
    /github\.event_name == 'workflow_dispatch'/
  );
  for (const app of ['shortener'])
    assert.equal(
      runPolicy(root, `${app}-cloudflare.yaml`).output,
      'allowed=false\n'
    );
});

test('Git admission opens its route-free upload and adds no Cloudflare publisher', (t) => {
  const root = fixture(t);
  assert.equal(runPolicy(root, 'git-cloudflare.yaml').output, 'allowed=true\n');
  const vercel = runPolicy(root, 'vercel-production-git.yaml');
  assert.equal(vercel.output, 'allowed=false\n');
  assert.match(vercel.stdout, /publisher retired/);
  assert.match(vercel.summary, /publisher retired/);
  // The sealed artifact job never writes to a provider.
  const { jobs } = readWorkflow('git-cloudflare.yaml');
  assert.deepEqual(
    publicationWrites(jobs).map(([name]) => name),
    []
  );
  for (const app of ['shortener'])
    assert.equal(
      runPolicy(root, `${app}-cloudflare.yaml`).output,
      'allowed=false\n'
    );
});

const publishers = [
  ...apps
    // Some protected apps publish only on Cloudflare.
    // Git's Vercel publisher predates the policy gate and stays outside it.
    .filter(
      (app) => !['forms', 'git', 'lms', 'mastermind', 'workspace'].includes(app)
    )
    .map((app) => ({
      workflow: `vercel-production-${app}.yaml`,
      job: 'Deploy-Production',
    })),
  { workflow: 'meet-cloudflare.yaml', job: 'deploy' },
  { workflow: 'mastermind-cloudflare.yaml', job: 'deploy' },
];
for (const { workflow, job } of publishers) {
  test(`${workflow}: every production write depends on the early shared policy gate`, (t) => {
    const { jobs } = readWorkflow(workflow);
    const gate = jobs['production-policy'];
    assert.match(gate.if, /github\.ref == 'refs\/heads\/production'/);
    assert.equal(
      gate.outputs.allowed,
      workflow === 'meet-cloudflare.yaml'
        ? "${{ steps.admission.outputs.superseded != 'true' && steps.policy.outputs.allowed == 'true' }}"
        : '$' + '{{ steps.policy.outputs.allowed }}'
    );
    assert.equal(gate['continue-on-error'], undefined);
    const policy = gate.steps.find((step) => step.id === 'policy');
    assert.equal(
      policy.run,
      `node scripts/ci/production-publication-policy.ts ${workflow} "$GITHUB_STEP_SUMMARY"`
    );
    assert.equal(policy.if, undefined);
    assert.equal(policy['continue-on-error'], undefined);
    assert.ok(
      gate.steps.findIndex((step) =>
        step.uses?.startsWith('actions/checkout@')
      ) < gate.steps.indexOf(policy)
    );
    assert.ok(
      gate.steps.findIndex((step) =>
        step.uses?.startsWith('actions/setup-node@')
      ) < gate.steps.indexOf(policy)
    );
    assert.ok(jobs[job].needs.includes('production-policy'));
    assert.equal(
      jobs[job].if,
      workflow === 'meet-cloudflare.yaml'
        ? "(github.ref == 'refs/heads/production' || (github.event_name == 'workflow_dispatch' && inputs.release == true)) && needs.production-policy.outputs.allowed == 'true'"
        : "github.ref == 'refs/heads/production' && needs.production-policy.outputs.allowed == 'true'"
    );
    const writes = publicationWrites(jobs);
    assert.deepEqual(
      writes.map(([name]) => name),
      [job]
    );
    const result = runPolicy(fixture(t, heldPolicy), workflow, policy.run);
    assert.equal(result.output, 'allowed=false\n');
    assert.match(
      result.summary,
      workflow === 'vercel-production-mind.yaml'
        ? /held: Mind stays with its dedicated owner/
        : workflow === 'vercel-production-finance.yaml' ||
            workflow === 'vercel-production-nova.yaml'
          ? /publisher retired/
          : heldReason
    );
  });
}

test('all unrelated real production targets retain planner selection with invalid wave-1 policy', (t) => {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
    import { cloudflareProductionTargets, vercelProductionWorkflowTargets } from './tuturuuu.ts';
    console.log(JSON.stringify([...vercelProductionWorkflowTargets, ...cloudflareProductionTargets]
      .filter(({app}) => !${JSON.stringify(apps)}.includes(app))
      .map(({productionWorkflow}) => productionWorkflow)));
  `,
    ],
    { cwd: repoRoot, encoding: 'utf8', timeout: 10000 }
  );
  const workflows = JSON.parse(output);
  const original = plan(fixture(t, heldPolicy), workflows);
  const invalid = plan(fixture(t, {}), workflows);
  assert.deepEqual(invalid, original);
  assert.ok(original.some(({ shouldRun }) => shouldRun));
});

for (const app of ['calendar', 'mail', 'apps']) {
  test(`${app}: native staging policy allows trusted staging while shared production policy holds`, (t) => {
    const directory = fixture(t, heldPolicy);
    assert.equal(
      runPolicy(directory, `${app}-cloudflare.yaml`).output,
      'allowed=false\n'
    );
    const profilesPath = join(
      directory,
      'scripts/ci/wave1-native-profiles.json'
    );
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8'));
    profiles.productionHold = null;
    writeFileSync(profilesPath, JSON.stringify(profiles));
    const output = join(directory, 'staging-output');
    for (const [profile, ref, event, enabled, allowed] of [
      ['staging', 'refs/heads/main', 'push', 'true', true],
      ['staging', 'refs/heads/main', 'workflow_dispatch', 'true', true],
      ['staging', 'refs/heads/main', 'push', '', false],
      ['staging', 'refs/heads/production', 'push', 'true', false],
      ['production', 'refs/heads/production', 'push', 'true', false],
    ]) {
      writeFileSync(output, '');
      execFileSync(
        process.execPath,
        [
          'scripts/ci/wave1-native-publish.mjs',
          'policy',
          app,
          profile,
          'a'.repeat(40),
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            GITHUB_REF: ref,
            GITHUB_EVENT_NAME: event,
            WAVE1_STAGING_PUBLISH_ENABLED: enabled,
            WAVE1_STAGING_PUBLICATION_ADMISSION: JSON.stringify({
              schema: 1,
              app,
              sourceSha: 'a'.repeat(40),
              artifactSha256: 'b'.repeat(64),
              ...profiles.stagingAdmission,
            }),
          },
          timeout: 10000,
        }
      );
      assert.equal(readFileSync(output, 'utf8'), `allowed=${allowed}\n`);
    }
  });
}

test('Mastermind publishes only its sealed artifact from the gated deploy job', () => {
  assert.equal(
    existsSync(
      join(repoRoot, '.github/workflows/vercel-production-mastermind.yaml')
    ),
    false
  );
  const { jobs } = readWorkflow('mastermind-cloudflare.yaml');
  assert.deepEqual(Object.keys(jobs), [
    'affected-gate',
    'artifact',
    'production-policy',
    'deploy',
  ]);
  assert.match(jobs.artifact.env.MASTERMIND_SOURCE_SHA, /github\.sha/);
  assert.deepEqual(jobs.deploy.needs, ['artifact', 'production-policy']);
  assert.equal(jobs.deploy.environment, 'mastermind-production');
  assert.equal(jobs.deploy.env.SOURCE_SHA, '${{ github.sha }}');
  // The artifact job never writes to a provider.
  assert.deepEqual(
    publicationWrites(jobs).map(([name]) => name),
    ['deploy']
  );
  const secrets = jobs.deploy.steps.find((step) => step.id === 'secrets');
  assert.match(secrets.run, /workers\/scripts\/tuturuuu-mastermind\/secrets/);
  for (const name of [
    'CF_ACCESS_TEAM_DOMAIN',
    'CF_ACCESS_AUD',
    'MASTERMIND_OWNER_EMAIL',
    'OWNER_IDS',
    'TUTURUUU_APP_COORDINATION_SECRET',
  ])
    assert.match(secrets.run, new RegExp(name));
  assert.match(secrets.run, /missing required secret names/);
  assert.match(secrets.run, /exists=false/);
  assert.doesNotMatch(secrets.run, /bun x --no-install/);
});

test('the production app deny-list holds exactly the listed apps and never web', () => {
  const listed = execFileSync(
    'bun',
    [
      '--eval',
      `import { productionAppExclusions } from './tuturuuu.ci.ts';
       const keys = Object.keys(productionAppExclusions).sort();
       if (keys.includes('web') || keys.includes('platform')) throw new Error(keys.join(','));
       console.log(keys.join(','));`,
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(listed.trim(), 'colab,lettin,mind,parley,track');
});
