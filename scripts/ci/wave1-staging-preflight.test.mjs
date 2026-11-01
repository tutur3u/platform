import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { publicationAdmission } from './wave1-native-publish.mjs';
import { preflight } from './wave1-staging-preflight.mjs';

const require = createRequire(import.meta.url);
const { readWorkflow } = require('./workflow-yaml-test-helper');
const env = {
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_TOKEN: 'test-token',
  WAVE1_STAGING_PUBLISH_ENABLED: 'true',
  WAVE1_STAGING_PUBLICATION_ADMISSION: '{"admitted":true}',
};
const protectedEnvironment = (name) => ({
  name,
  protection_rules: [
    {
      type: 'required_reviewers',
      reviewers: [{ type: 'Team', reviewer: { id: 1 } }],
    },
  ],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});
const mainOnly = () => ({
  total_count: 1,
  branch_policies: [{ name: 'main', type: 'branch' }],
});
function api({
  mutateEnvironment = () => {},
  mutatePolicies = () => {},
  status = 200,
} = {}) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      const name = new URL(url).pathname.split('/')[5];
      const policies = url.includes('/deployment-branch-policies');
      const body = policies ? mainOnly() : protectedEnvironment(name);
      (policies ? mutatePolicies : mutateEnvironment)(body);
      return { status, json: async () => body };
    },
  };
}
for (const mode of ['web', 'native']) {
  test(`${mode}: protected main-only environments pass`, async () => {
    const mock = api();
    const names = await preflight({ env, mode, app: 'mail', ...mock });
    assert.deepEqual(
      names,
      mode === 'web' ? ['wave1-web-staging'] : ['wave1-mail-staging']
    );
    assert.equal(mock.calls.length, 2);
  });
}
for (const [name, options] of [
  ['missing environment', { status: 404 }],
  ['API denies access', { status: 403 }],
  [
    'no reviewers',
    {
      mutateEnvironment: (e) => {
        e.protection_rules = [];
      },
    },
  ],
  [
    'empty reviewers',
    {
      mutateEnvironment: (e) => {
        e.protection_rules[0].reviewers = [];
      },
    },
  ],
  [
    'malformed reviewers',
    {
      mutateEnvironment: (e) => {
        e.protection_rules[0].reviewers = [{}];
      },
    },
  ],
  [
    'unrestricted branches',
    {
      mutateEnvironment: (e) => {
        e.deployment_branch_policy = null;
      },
    },
  ],
  [
    'all protected branches',
    {
      mutateEnvironment: (e) => {
        e.deployment_branch_policy.protected_branches = true;
      },
    },
  ],
  [
    'wildcard branch',
    {
      mutatePolicies: (p) => {
        p.branch_policies[0].name = '*';
      },
    },
  ],
  [
    'main tag',
    {
      mutatePolicies: (p) => {
        p.branch_policies[0].type = 'tag';
      },
    },
  ],
  [
    'unknown policy type',
    {
      mutatePolicies: (p) => {
        delete p.branch_policies[0].type;
      },
    },
  ],
  [
    'extra policies beyond page',
    {
      mutatePolicies: (p) => {
        p.total_count = 101;
      },
    },
  ],
  [
    'incomplete list',
    {
      mutatePolicies: (p) => {
        p.branch_policies = [];
      },
    },
  ],
]) {
  test(`${name} refuses publication`, async () => {
    const mock = api(options);
    await assert.rejects(
      preflight({ env, mode: 'native', app: 'mail', ...mock })
    );
  });
}
test('unprotected Web environment refuses native-only publication', async () => {
  const mock = api({
    mutateEnvironment: (e) => {
      if (e.name === 'wave1-web-staging') e.protection_rules = [];
    },
  });
  await assert.rejects(preflight({ env, mode: 'web', app: 'web', ...mock }));
});
test('network failure refuses publication', async () => {
  await assert.rejects(
    preflight({
      env,
      mode: 'native',
      app: 'mail',
      fetcher: async () => {
        throw new Error('network unavailable');
      },
    })
  );
});
for (const mode of ['web', 'native']) {
  for (const key of [
    'WAVE1_STAGING_PUBLISH_ENABLED',
    'WAVE1_STAGING_PUBLICATION_ADMISSION',
  ]) {
    for (const value of [undefined, '', ' ']) {
      test(`${mode}: ${key}=${JSON.stringify(value)} refuses before API`, async () => {
        const mock = api();
        await assert.rejects(
          preflight({
            env: { ...env, [key]: value },
            mode,
            app: 'mail',
            ...mock,
          })
        );
        assert.equal(mock.calls.length, 0);
      });
    }
  }
}
test('truthy values cannot enable the staging fence', async () => {
  for (const value of ['false', 'TRUE', '1', true]) {
    await assert.rejects(
      preflight({
        env: { ...env, WAVE1_STAGING_PUBLISH_ENABLED: value },
        mode: 'native',
        app: 'mail',
        ...api(),
      })
    );
  }
});
test('policy-staging already refuses missing fences and admission', () => {
  const workflow = readWorkflow('wave1-native-app.yaml', { raw: true });
  const policy = workflow.jobs['policy-staging'].steps.find(
    (s) => s.id === 'policy'
  );
  assert.equal(
    policy.env.WAVE1_STAGING_PUBLISH_ENABLED,
    '$' + '{{ vars.WAVE1_STAGING_PUBLISH_ENABLED }}'
  );
  assert.equal(
    policy.env.WAVE1_STAGING_PUBLICATION_ADMISSION,
    '$' + '{{ vars.WAVE1_STAGING_PUBLICATION_ADMISSION }}'
  );
  assert.match(policy.run, /wave1-native-publish.mjs policy/u);
  for (const stagingEnabled of [undefined, '', 'false', 'true']) {
    for (const admissionRecord of [undefined, '']) {
      assert.equal(
        publicationAdmission({
          environment: 'staging',
          ref: 'refs/heads/main',
          event: 'push',
          app: 'mail',
          sha: 'a'.repeat(40),
          stagingEnabled,
          admissionRecord,
        }).allowed,
        false
      );
    }
  }
});

function assertGuarded(workflow) {
  const jobs = workflow.jobs;
  const gate = jobs.preflight;
  assert.ok(gate);
  assert.equal(gate.environment, undefined);
  assert.deepEqual(gate.permissions, { contents: 'read', actions: 'read' });
  const gateText = JSON.stringify(gate);
  assert.ok(!gateText.includes('continue-on-error'));
  assert.match(gateText, /node scripts\/ci\/wave1-staging-preflight.mjs/u);
  for (const secret of gateText.matchAll(/secrets\.([\w]+)/gu))
    assert.equal(secret[1], 'GITHUB_TOKEN');
  function depends(id, seen = new Set()) {
    if (id === 'preflight') return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return [jobs[id]?.needs ?? []].flat().some((dep) => depends(dep, seen));
  }
  for (const [id, job] of Object.entries(jobs)) {
    if (id === 'preflight') continue;
    if (job.environment || /secrets\.|"secrets":/u.test(JSON.stringify(job))) {
      assert.ok(depends(id), `${id} must depend on preflight`);
      assert.doesNotMatch(job.if ?? '', /always\(|!cancelled\(|failure\(/u, id);
    }
  }
  const step = gate.steps.find((s) =>
    s.run?.includes('wave1-staging-preflight')
  );
  assert.equal(
    step.env.WAVE1_STAGING_PUBLICATION_ADMISSION,
    '$' + '{{ vars.WAVE1_STAGING_PUBLICATION_ADMISSION }}'
  );
  assert.equal(
    step.env.WAVE1_STAGING_PUBLISH_ENABLED,
    '$' + '{{ vars.WAVE1_STAGING_PUBLISH_ENABLED }}'
  );
}
for (const file of ['wave1-web-staging.yaml', 'wave1-native-publish.yaml']) {
  test(`${file}: all protected or secret-bearing jobs need successful preflight`, () => {
    const workflow = readWorkflow(file, { raw: true });
    assertGuarded(workflow);
    const broken = structuredClone(workflow);
    const id = file.includes('web') ? 'publish-worker' : 'publish';
    delete broken.jobs[id].needs;
    assert.throws(() => assertGuarded(broken));
    const secret = structuredClone(workflow);
    secret.jobs.preflight.steps[0].env = {
      TOKEN: '$' + '{{ secrets.PROVIDER_TOKEN }}',
    };
    assert.throws(() => assertGuarded(secret));
  });
}
