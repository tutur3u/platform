const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const publishers = [
  'vercel-production-meet.yaml',
  'vercel-production-calendar.yaml',
  'vercel-production-mail.yaml',
  'vercel-production-apps.yaml',
  'meet-cloudflare.yaml',
  'mail-calendar-tasks-builds.yaml',
  'apps-cloudflare.yaml',
  'wave1-native-production.yaml',
];
const workflows = Object.fromEntries(
  publishers.map((name) => [name, readWorkflow(name)])
);
const secretReference = /\bsecrets(?:\.|\[)/i;

function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    strings(child, `${path}.${key}`)
  );
}

function context(ref, allowed = 'false', event = 'workflow_dispatch') {
  return {
    github: { ref, event_name: event, actor: 'trusted-author' },
    needs: {
      'production-policy': { result: 'success', outputs: { allowed } },
      'check-ci': {
        result: 'success',
        outputs: { should_run: 'true', run_checks: 'true' },
      },
      'release-relevance': {
        result: 'success',
        outputs: { run_checks: 'true' },
      },
    },
    vars: { TURBO_TEAM: '' },
    matrix: { profile: 'staging' },
    secrets: new Proxy({}, { get: (_, name) => `credential:${String(name)}` }),
    env: {},
    always: () => true,
    cancelled: () => false,
    success: () => true,
  };
}

function evaluate(expression, scope) {
  const source = expression.replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '');
  // GitHub allows hyphenated job IDs in property access; JS requires brackets.
  return vm.runInNewContext(
    source.replace(/needs\.([\w-]+)/g, 'needs["$1"]'),
    scope,
    { timeout: 100 }
  );
}

function exposesSecret(value, scope) {
  return [...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].some(
    ([, expression]) =>
      secretReference.test(expression) &&
      String(evaluate(expression, scope)).includes('credential:')
  );
}

function assertProductionCredentialsAdmitted(workflow) {
  const production = 'refs/heads/production';
  const scopes = ['true', 'false', '', undefined].map((allowed) => {
    const scope = context(production);
    scope.needs['production-policy'].outputs.allowed = allowed;
    return scope;
  });
  for (const [path, value] of strings(workflow.env)) {
    assert.equal(
      scopes.some((scope) => exposesSecret(value, scope)),
      false,
      `workflow env${path} exposes production credentials outside admission`
    );
  }
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const fields = strings(job).filter(([, value]) =>
      secretReference.test(value)
    );
    assert.notEqual(
      job.secrets,
      'inherit',
      `${name} inherits secrets before admission`
    );
    const productionFields = fields.filter(([, value]) =>
      scopes.some((scope) => exposesSecret(value, scope))
    );
    if (!productionFields.length) continue;
    assert.ok(
      [job.needs].flat().includes('production-policy'),
      `${name} references production secrets without needing admission`
    );
    for (const allowed of ['false', '', undefined]) {
      const scope = context(production);
      scope.needs['production-policy'].outputs.allowed = allowed;
      assert.equal(
        Boolean(job.if && evaluate(job.if, scope)),
        false,
        `${name} runs with production credentials when allowed=${String(allowed)}`
      );
    }
    assert.equal(
      Boolean(evaluate(job.if, context(production, 'true'))),
      true,
      `${name} must accept an admitted production invocation`
    );
  }
}

for (const name of publishers) {
  test(`${name}: production secret references require dependency and admission`, () => {
    assertProductionCredentialsAdmitted(workflows[name]);
  });
}

test('rejects the original Meet validate dependency/if at line 129', () => {
  const workflow = structuredClone(workflows['meet-cloudflare.yaml']);
  workflow.jobs.validate.needs = ['check-ci', 'release-relevance'];
  workflow.jobs.validate.if =
    "needs.check-ci.outputs.should_run == 'true' && needs.release-relevance.outputs.run_checks == 'true'";
  assert.throws(
    () => assertProductionCredentialsAdmitted(workflow),
    /validate references production secrets without needing admission/
  );
});

test('rejects consolidated Meet validation without a policy dependency', () => {
  const workflow = structuredClone(workflows['meet-cloudflare.yaml']);
  workflow.jobs.validate.needs = ['check-ci'];
  assert.throws(
    () => assertProductionCredentialsAdmitted(workflow),
    /validate references production secrets without needing admission/
  );
});

test('rejects Meet validation that waits for policy but ignores a hold', () => {
  const workflow = structuredClone(workflows['meet-cloudflare.yaml']);
  workflow.jobs.validate.if =
    "!cancelled() && needs.check-ci.outputs.should_run == 'true' && needs.check-ci.outputs.run_checks == 'true'";
  assert.throws(
    () => assertProductionCredentialsAdmitted(workflow),
    /validate runs with production credentials/
  );
});

test('rejects production credentials in job env, action inputs and step env/run', () => {
  for (const injection of [
    { env: { TURBO_TOKEN: '$' + '{{ secrets.TURBO_TOKEN }}' } },
    { steps: [{ with: { token: '$' + '{{ secrets.TURBO_TOKEN }}' } }] },
    { steps: [{ env: { TOKEN: '$' + '{{ secrets.CLOUDFLARE_API_TOKEN }}' } }] },
    { steps: [{ run: 'publish --token=$' + '{{ secrets.VERCEL_TOKEN }}' }] },
  ]) {
    const workflow = structuredClone(workflows['apps-cloudflare.yaml']);
    workflow.jobs.unguarded = injection;
    assert.throws(
      () => assertProductionCredentialsAdmitted(workflow),
      /unguarded references production secrets without needing admission/
    );
  }
});

test('rejects independent credentials even when their expression only exposes them while held', () => {
  const workflow = structuredClone(workflows['apps-cloudflare.yaml']);
  workflow.jobs.unguarded = {
    env: {
      TOKEN:
        '$' +
        "{{ needs.production-policy.outputs.allowed != 'true' && secrets.TURBO_TOKEN || '' }}",
    },
  };
  assert.throws(
    () => assertProductionCredentialsAdmitted(workflow),
    /unguarded references production secrets without needing admission/
  );
});

test('rejects production secrets in workflow env before any job admission', () => {
  const workflow = structuredClone(workflows['apps-cloudflare.yaml']);
  workflow.env = { TOKEN: '$' + '{{ secrets.TURBO_TOKEN }}' };
  assert.throws(
    () => assertProductionCredentialsAdmitted(workflow),
    /workflow env.TOKEN exposes production credentials outside admission/
  );
});

test('Meet validation still runs on PR/main when the production gate is skipped', () => {
  const job = workflows['meet-cloudflare.yaml'].jobs.validate;
  assert.match(job.if, /!cancelled\(\)|always\(\)/);
  for (const [ref, event] of [
    ['refs/heads/main', 'push'],
    ['refs/pull/6398/merge', 'pull_request'],
  ]) {
    const scope = context(ref, '', event);
    scope.needs['production-policy'].result = 'skipped';
    assert.equal(Boolean(evaluate(job.if, scope)), true);
    scope.needs['check-ci'].outputs.should_run = 'false';
    assert.equal(Boolean(evaluate(job.if, scope)), false);
    scope.needs['check-ci'].outputs.should_run = 'true';
    scope.needs['check-ci'].outputs.run_checks = 'false';
    assert.equal(Boolean(evaluate(job.if, scope)), false);
    scope.needs['check-ci'].outputs.run_checks = 'true';
    for (const dependency of ['check-ci']) {
      for (const result of ['failure', 'skipped', 'cancelled']) {
        scope.needs[dependency].result = result;
        assert.equal(Boolean(evaluate(job.if, scope)), false);
      }
      scope.needs[dependency].result = 'success';
    }
    scope.cancelled = () => true;
    assert.equal(Boolean(evaluate(job.if, scope)), false);
  }
});

test('Meet validation fails closed when production policy fails or is skipped', () => {
  const job = workflows['meet-cloudflare.yaml'].jobs.validate;
  for (const result of ['failure', 'skipped', 'cancelled']) {
    const scope = context('refs/heads/production', 'true');
    scope.needs['production-policy'].result = result;
    assert.equal(Boolean(evaluate(job.if, scope)), false);
  }
});

test('native Calendar/Mail validation receives no cache credentials on production', () => {
  for (const job of Object.values(
    workflows['mail-calendar-tasks-builds.yaml'].jobs
  )) {
    for (const step of job.steps ?? []) {
      if (!step.uses?.endsWith('/run-with-turbo-remote-cache')) continue;
      for (const field of ['token', 'team']) {
        for (const team of ['', 'configured-team']) {
          const production = context('refs/heads/production');
          production.vars.TURBO_TEAM = team;
          assert.equal(evaluate(step.with[field], production), '');
        }
        for (const [ref, event] of [
          ['refs/heads/main', 'push'],
          ['refs/pull/6398/merge', 'pull_request'],
          ['refs/heads/feature/example', 'workflow_dispatch'],
        ]) {
          for (const actor of ['trusted-author', 'dependabot[bot]']) {
            for (const team of ['', 'configured-team']) {
              const scope = context(ref, '', event);
              scope.github.actor = actor;
              scope.vars.TURBO_TEAM = team;
              const expected =
                field === 'team'
                  ? team || 'credential:TURBO_TEAM'
                  : actor !== 'dependabot[bot]' &&
                      event !== 'pull_request' &&
                      ref === 'refs/heads/main'
                    ? 'credential:TURBO_TOKEN'
                    : '';
              assert.equal(evaluate(step.with[field], scope), expected);
            }
          }
        }
      }
    }
  }
});

const stagingSecretNames = [
  'CLOUDFLARE_STAGING_API_TOKEN',
  'WAVE1_CONTROL_READ_TOKEN',
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_PUBLISHABLE_KEY',
];

function assertStagingCallerSecrets(workflow) {
  const expected = Object.fromEntries(
    stagingSecretNames.map((name) => [
      name,
      '$' +
        "{{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets." +
        name +
        " || '' }}",
    ])
  );
  assert.deepEqual(
    workflow.jobs['native-publish-staging'].secrets,
    expected,
    'caller staging secrets must match exactly'
  );
  for (const [name, otherJob] of Object.entries(workflow.jobs)) {
    if (name === 'native-publish-staging') continue;
    assert.equal(
      otherJob.secrets,
      undefined,
      `${name} must not receive secrets`
    );
  }
}

for (const name of ['calendar-cloudflare.yaml', 'mail-cloudflare.yaml']) {
  test(`${name}: caller passes exactly the admitted staging secrets`, () => {
    assertStagingCallerSecrets(readWorkflow(name));
  });

  test(`${name}: rejects changed caller secret names and expressions`, () => {
    for (const mutate of [
      (secrets) => {
        secrets.CLOUDFLARE_API_TOKEN = secrets.CLOUDFLARE_STAGING_API_TOKEN;
        delete secrets.CLOUDFLARE_STAGING_API_TOKEN;
      },
      (secrets) => {
        secrets.CLOUDFLARE_STAGING_API_TOKEN =
          secrets.CLOUDFLARE_STAGING_API_TOKEN.replace(
            'secrets.CLOUDFLARE_STAGING_API_TOKEN',
            'secrets.CLOUDFLARE_API_TOKEN'
          );
      },
      (secrets) => {
        secrets.STAGING_SUPABASE_URL =
          '$' + '{{ secrets.STAGING_SUPABASE_URL }}';
      },
    ]) {
      const workflow = readWorkflow(name);
      mutate(workflow.jobs['native-publish-staging'].secrets);
      assert.throws(
        () => assertStagingCallerSecrets(workflow),
        /caller staging secrets/
      );
    }
  });
  test(`${name}: qualification rejects forwarded publisher credentials`, () => {
    const workflow = readWorkflow(name);
    workflow.jobs['native-profiles'].secrets = structuredClone(
      workflow.jobs['native-publish-staging'].secrets
    );
    assert.throws(
      () => assertStagingCallerSecrets(workflow),
      /must not receive secrets/
    );
  });
}

function assertPublisherSecrets(job) {
  const expected = {
    '.steps.7.env.CLOUDFLARE_STAGING_API_TOKEN':
      '$' + '{{ secrets.CLOUDFLARE_STAGING_API_TOKEN }}',
    '.steps.7.env.WAVE1_CONTROL_READ_TOKEN':
      '$' + '{{ secrets.WAVE1_CONTROL_READ_TOKEN }}',
    '.steps.7.env.NEXT_PUBLIC_SUPABASE_URL':
      '$' + '{{ secrets.STAGING_SUPABASE_URL }}',
    '.steps.7.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':
      '$' + '{{ secrets.STAGING_SUPABASE_PUBLISHABLE_KEY }}',
  };
  assert.deepEqual(
    Object.fromEntries(
      strings(job).filter(([, value]) => secretReference.test(value))
    ),
    expected,
    'publisher secret fields must match exactly'
  );
}

test('publisher rejects production and indirect secret references', () => {
  for (const value of [
    '$' + '{{ secrets.CLOUDFLARE_API_TOKEN }}',
    '$' + "{{ secrets['CLOUDFLARE_STAGING_API_TOKEN'] }}",
    '$' + "{{ format('{0}', secrets.CLOUDFLARE_STAGING_API_TOKEN) }}",
  ]) {
    const workflow = readWorkflow('wave1-native-publish.yaml');
    workflow.jobs.publish.steps[7].env.CLOUDFLARE_STAGING_API_TOKEN = value;
    assert.throws(
      () => assertPublisherSecrets(workflow.jobs.publish),
      /publisher secret fields/
    );
  }
});

test('native staging callers and held profile builds withhold production credentials', () => {
  for (const name of [
    'calendar-cloudflare.yaml',
    'mail-cloudflare.yaml',
    'wave1-native-app.yaml',
  ]) {
    const workflow = readWorkflow(name);
    assertProductionCredentialsAdmitted(workflow);
    for (const profile of ['staging', 'production']) {
      for (const [ref, event] of [
        ['refs/heads/production', 'push'],
        ['refs/heads/main', 'push'],
        ['refs/heads/main', 'workflow_dispatch'],
        ['refs/pull/6399/merge', 'pull_request'],
      ]) {
        const scope = { ...context(ref, 'false', event), matrix: { profile } };
        for (const [field, value] of strings(workflow.jobs.build?.env)) {
          if (!secretReference.test(value)) continue;
          const result = String(evaluate(value, scope));
          if (profile === 'staging' && ref === 'refs/heads/main') {
            assert.match(result, /^credential:STAGING_SUPABASE_/);
          } else {
            assert.doesNotMatch(result, /credential:/, `${name}${field}`);
          }
        }
      }
    }
  }
});

test('reusable publisher admits staging main events and rejects production independently of callers', () => {
  const workflow = readWorkflow('wave1-native-publish.yaml');
  const job = workflow.jobs.publish;
  assert.equal(job.environment, 'wave1-$' + '{{ inputs.app }}-staging');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const profile of ['staging', 'production']) {
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/pull/6399/merge',
    ]) {
      for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
        const scope = {
          ...context(ref, 'false', event),
          inputs: { app: 'mail', profile },
        };
        assert.equal(
          Boolean(evaluate(job.if, scope)),
          profile === 'staging' &&
            ref === 'refs/heads/main' &&
            event !== 'pull_request'
        );
      }
    }
  }
  assertPublisherSecrets(job);
});
