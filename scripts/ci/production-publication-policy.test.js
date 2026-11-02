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

const apps = ['meet', 'calendar', 'mail', 'apps', 'shortener', 'mastermind'];
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
    'scripts/ci/wave1-native-profiles.json',
    'scripts/ci/wave1-native-artifact.mjs',
    'scripts/ci/mail-node-imports.mjs',
    'scripts/ci/calendar-native-inventory.mjs',
    'scripts/ci/mobile-build-selection.ts',
    'scripts/ci/production-test-only-paths.ts',
    'scripts/ci/workspace-dependency-closure.ts',
    'scripts/ci/resolve-production-vercel-targets.ts',
    'scripts/ci/resolve-changed-files-core.ts',
    'scripts/ci/github-deployment-markers.ts',
    'scripts/ci/workflow-config-core.ts',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repoRoot, file), join(root, file));
  }
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
for (const app of apps) {
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
        assert.match(decisions[index].reason, heldReason);
        const result = runPolicy(root, workflow);
        assert.equal(result.output, 'allowed=false\n');
        assert.match(result.stdout, heldReason);
        assert.match(result.summary, heldReason);
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

for (const app of apps) {
  test(`${app}: explicit reviewed admission permits planner selection and native CLI`, (t) => {
    const policy = structuredClone(heldPolicy);
    policy[app] = {
      state: 'admitted',
      reason: 'qualified cutover reviewed',
      surfaces: app === 'meet' ? ['frontend', 'realtime-do'] : ['frontend'],
    };
    const workflow = `${app}-cloudflare.yaml`;
    const target = ['meet', 'calendar'].includes(app)
      ? workflow
      : `vercel-production-${app}.yaml`;
    const root = fixture(t, policy);
    const [decision] = plan(root, [target]);
    assert.equal(decision.shouldRun, true);
    assert.notEqual(decision.held, true);
    assert.equal(runPolicy(root, workflow).output, 'allowed=true\n');
  });
}

test('known unrelated publisher retains normal selection even with malformed protected policy', (t) => {
  const root = fixture(t, {});
  const [decision] = plan(root, ['vercel-production-storefront.yaml']);
  assert.equal(decision.shouldRun, true);
  assert.notEqual(decision.held, true);
  assert.equal(
    runPolicy(root, 'vercel-production-storefront.yaml').output,
    'allowed=true\n'
  );
});

test('Calendar admission opens only its frontend while other wave-1 apps remain held', (t) => {
  const root = fixture(t);
  assert.equal(
    runPolicy(root, 'calendar-cloudflare.yaml').output,
    'allowed=true\n'
  );
  for (const event of ['push', 'workflow_dispatch']) {
    const [native, legacy] = plan(
      root,
      ['calendar-cloudflare.yaml', 'vercel-production-calendar.yaml'],
      event
    );
    assert.equal(native.shouldRun, true);
    assert.equal(legacy.shouldRun, false);
  }
  for (const app of ['meet', 'mail', 'apps']) {
    assert.equal(
      runPolicy(
        root,
        app === 'meet' ? 'meet-cloudflare.yaml' : `${app}-cloudflare.yaml`
      ).output,
      'allowed=false\n'
    );
  }
});

const publishers = [
  ...apps
    .filter((app) => app !== 'mastermind')
    .map((app) => ({
      workflow: `vercel-production-${app}.yaml`,
      job: 'Deploy-Production',
    })),
  { workflow: 'meet-cloudflare.yaml', job: 'deploy' },
];
for (const { workflow, job } of publishers) {
  test(`${workflow}: every production write depends on the early shared policy gate`, (t) => {
    const { jobs } = readWorkflow(workflow);
    const gate = jobs['production-policy'];
    assert.equal(gate.if, "github.ref == 'refs/heads/production'");
    assert.equal(
      gate.outputs.allowed,
      '$' + '{{ steps.policy.outputs.allowed }}'
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
      "github.ref == 'refs/heads/production' && needs.production-policy.outputs.allowed == 'true'"
    );
    const writes = Object.entries(jobs).filter(([, value]) =>
      value.steps?.some(
        (step) =>
          /vercel (?:pull|build|deploy)|wrangler (?:deploy|secret)/.test(
            step.run ?? step.with?.command ?? ''
          ) && !/--dry-run/.test(step.run ?? step.with?.command ?? '')
      )
    );
    assert.deepEqual(
      writes.map(([name]) => name),
      [job]
    );
    const result = runPolicy(fixture(t, heldPolicy), workflow, policy.run);
    assert.equal(result.output, 'allowed=false\n');
    assert.match(result.summary, heldReason);
  });
}

test('all unrelated real production targets retain planner selection with invalid wave-1 policy', (t) => {
  const output = execFileSync(
    'bun',
    [
      '--eval',
      `
    import { cloudflareProductionTargets, vercelWorkflowTargets } from './tuturuuu.ts';
    console.log(JSON.stringify([...vercelWorkflowTargets, ...cloudflareProductionTargets]
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

test('Mastermind has qualification jobs only and no production publisher', () => {
  assert.equal(
    existsSync(
      join(repoRoot, '.github/workflows/vercel-production-mastermind.yaml')
    ),
    false
  );
  const { jobs } = readWorkflow('mastermind-cloudflare.yaml');
  assert.deepEqual(Object.keys(jobs), ['check-ci', 'native']);
  assert.equal(jobs.native.uses, './.github/workflows/native-start-app.yaml');
  assert.equal(jobs.native.with.app, 'mastermind');
});
