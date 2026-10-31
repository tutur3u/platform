const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const { readWorkflow } = require('./workflow-yaml-test-helper.js');

const internal = {
  id: 'i',
  attributes: { name: 'Staff', isInternalGroup: true },
};
const external = {
  id: 'e',
  attributes: { name: 'Customers', isInternalGroup: false },
};
const groups = [internal, external];
const verifier = () => import('../mobile-deployment/verify-store.mjs');

test('default and legacy all select only explicitly internal groups', async () => {
  const { selectBetaGroups } = await verifier();
  const unknown = { id: 'unknown', attributes: { name: 'Unknown' } };
  assert.deepEqual(selectBetaGroups([...groups, unknown], 'true'), [internal]);
  assert.deepEqual(selectBetaGroups(groups, 'true', 'all'), [internal]);
  assert.deepEqual(selectBetaGroups(groups, 'true', 'Staff'), [internal]);
  assert.deepEqual(selectBetaGroups(groups, 'true', 'Customers'), []);
});

test('external all is rejected and exact external names or IDs opt in', async () => {
  const { selectBetaGroups } = await verifier();
  for (const value of ['all', ' ALL ', 'Customers,all']) {
    assert.throws(
      () => selectBetaGroups(groups, 'true', '', value),
      /forbidden/
    );
  }
  for (const value of ['Customers', 'e', ' Customers, e ']) {
    assert.deepEqual(selectBetaGroups(groups, 'true', '', value), groups);
  }
  for (const value of ['missing', 'Staff']) {
    assert.throws(
      () => selectBetaGroups(groups, 'true', '', value),
      /Unknown external/
    );
  }
});

test('default distribution assigns internal groups without external review or notifications', async () => {
  const { distributeTestFlightBuild } = await verifier();
  const assigned = new Set();
  const apple = async (resource, options = {}) => {
    if (resource === '/v1/apps/app/betaGroups?limit=200')
      return { data: groups };
    if (resource === '/v1/builds/build?include=betaGroups') {
      return {
        data: {
          relationships: {
            betaGroups: { data: [...assigned].map((id) => ({ id })) },
          },
        },
      };
    }
    if (resource === '/v1/builds/build/relationships/betaGroups') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body).data, [
        { type: 'betaGroups', id: 'i' },
      ]);
      assigned.add('i');
      return {};
    }
    assert.fail(`Unexpected external operation: ${resource}`);
  };
  assert.deepEqual(
    await distributeTestFlightBuild(apple, 'app', 'build', { enabled: 'true' }),
    [internal]
  );
  assert.deepEqual([...assigned], ['i']);
});

test('review retry makes no Apple calls without external opt-in', async () => {
  const { retryDeferredTestFlightReview } = await verifier();
  for (const externalGroups of [undefined, '', '  ']) {
    assert.equal(
      await retryDeferredTestFlightReview(
        () => assert.fail('Unexpected API call'),
        'app',
        { enabled: 'true', groups: 'all', externalGroups }
      ),
      'no-external-groups'
    );
  }
});

test('review scheduler skips dispatch without repository opt-in', () => {
  const queue = readWorkflow('mobile-testflight-review-queue.yaml');
  const evaluate = Function(
    'needs',
    'vars',
    `return (${queue.jobs.dispatch.if.replaceAll('needs.check-ci', "needs['check-ci']")});`
  );
  for (const optIn of ['', 'Customers']) {
    for (const enabled of ['true', 'false']) {
      assert.equal(
        evaluate(
          { 'check-ci': { outputs: { should_run: enabled } } },
          { TESTFLIGHT_EXTERNAL_BETA_GROUPS: optIn }
        ),
        enabled === 'true' && optIn !== ''
      );
    }
  }
});

test('upload and retry workflows pass the same external repository opt-in', () => {
  const workflow = readWorkflow('mobile-deploy-stores.yaml');
  for (const jobId of [
    'publish-ios-testflight',
    'retry-ios-testflight-review',
  ]) {
    const step = workflow.jobs[jobId].steps.find((entry) =>
      entry.run?.includes('verify-store.mjs')
    );
    assert.equal(
      step.env.TESTFLIGHT_EXTERNAL_BETA_GROUPS,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Actions expression
      "${{ vars.TESTFLIGHT_EXTERNAL_BETA_GROUPS || '' }}"
    );
    assert.equal(
      step.env.TESTFLIGHT_BETA_GROUPS,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal Actions expression
      "${{ vars.TESTFLIGHT_BETA_GROUPS || '' }}"
    );
  }
});

test('review CLI exits without credentials when external opt-in is absent', () => {
  for (const externalGroups of [undefined, '', '  ']) {
    const env =
      externalGroups === undefined
        ? {}
        : { TESTFLIGHT_EXTERNAL_BETA_GROUPS: externalGroups };
    assert.equal(
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'scripts/mobile-deployment/verify-store.mjs'),
          'ios-pending',
        ],
        { env, encoding: 'utf8' }
      ),
      ''
    );
  }
});
