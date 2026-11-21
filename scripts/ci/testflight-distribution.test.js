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
      "${{ vars.TESTFLIGHT_EXTERNAL_BETA_GROUPS || '' }}"
    );
    assert.equal(
      step.env.TESTFLIGHT_BETA_GROUPS,
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

test('review scheduler skips every job, including check-ci, without opt-in', () => {
  const queue = readWorkflow('mobile-testflight-review-queue.yaml');
  assert.equal(
    queue.jobs['check-ci'].if,
    "vars.TESTFLIGHT_EXTERNAL_BETA_GROUPS != ''"
  );
  const dispatch = queue.jobs.dispatch.steps.find(
    (step) => step.name === 'Dispatch production review retry'
  );
  assert.equal(
    dispatch.env.TESTFLIGHT_EXTERNAL_BETA_GROUPS,
    "${{ vars.TESTFLIGHT_EXTERNAL_BETA_GROUPS || '' }}"
  );
  assert.match(
    dispatch.run,
    /-z "\$\{TESTFLIGHT_EXTERNAL_BETA_GROUPS\/\/ \/\}"[\s\S]*exit 0[\s\S]*gh api/
  );
});

test('store workflow promotes opted-in Play tracks, localizes notes, and alerts', () => {
  const workflow = readWorkflow('mobile-deploy-stores.yaml');
  const android = workflow.jobs['publish-android-internal'].steps;
  const androidNames = android.map((step) => step.name);
  const promote = android.find(
    (step) =>
      step.run?.includes('play-beta.mjs') && !/--check|--upload/.test(step.run)
  );
  assert.equal(
    promote.env.GOOGLE_PLAY_BETA_TRACKS,
    "${{ vars.GOOGLE_PLAY_BETA_TRACKS || '' }}"
  );
  assert.ok(
    androidNames.indexOf(promote.name) >
      androidNames.indexOf('Verify committed Google Play internal release')
  );
  assert.ok(
    androidNames.indexOf(promote.name) <
      androidNames.indexOf('Cleanup Android release files')
  );
  const ios = workflow.jobs['publish-ios-testflight'].steps;
  assert.ok(ios.some((step) => step.run?.includes('testflight-vi-notes.mjs')));
  assert.equal(
    android.find((step) => step.run?.includes('play-beta.mjs --check')).id,
    'existing'
  );
  for (const name of [
    'Build and verify signed Android App Bundle',
    'Publish Android App Bundle to Google Play internal',
  ]) {
    assert.equal(
      android.find((step) => step.name === name).if,
      "steps.existing.outputs.present != 'true'"
    );
  }
  const viStep = ios.find((step) =>
    step.run?.includes('testflight-vi-notes.mjs')
  );
  assert.equal(viStep['continue-on-error'], true);

  const receipt = workflow.jobs['mobile-store-receipt'];
  assert.deepEqual(receipt.permissions, { contents: 'read', issues: 'write' });
  assert.equal(receipt.environment, undefined);
  assert.match(receipt.if, /^always\(\)/);
  assert.match(receipt.if, /needs\.check-ci\.result/);
  assert.deepEqual(receipt.needs, [
    'check-ci',
    'mobile-store-publish-gate',
    'mobile-credentials-preflight',
    'publish-android-internal',
    'publish-ios-testflight',
  ]);
  const names = receipt.steps.map((step) => step.name);
  const alert = receipt.steps.find(
    (step) => step.name === 'Sync the mobile-store-alert issue'
  );
  assert.equal(alert.if, "always() && steps.receipt.outcome == 'success'");
  assert.ok(
    names.indexOf('Upload the mobile store receipt') <
      names.indexOf('Sync the mobile-store-alert issue'),
    'the receipt artifact uploads before the Issues API call'
  );
  const write = receipt.steps.find((step) =>
    step.run?.includes('store-receipt.mjs write')
  );
  assert.equal(write.env.GITHUB_TOKEN, undefined);
  assert.equal(write.env.RESULT_CHECK, '${{ needs.check-ci.result }}');
});

test('a superseded mobile commit releases the production head instead', () => {
  const workflow = readWorkflow('mobile-deploy-stores.yaml');
  const job = workflow.jobs['allocate-app-version'];
  assert.deepEqual(job.permissions, { actions: 'write', contents: 'write' });
  const dispatch = job.steps.find(
    (step) => step.name === 'Release the production head instead'
  );
  assert.equal(dispatch.if, "steps.allocate.outputs.superseded == 'true'");
  assert.match(
    dispatch.run,
    /mobile-deploy-stores\.yaml\/dispatches -f ref=production -f 'inputs\[mode\]=release'/
  );
  for (const [jobId, name] of [
    ['publish-ios-testflight', 'Upload iOS IPA to TestFlight'],
    ['publish-macos-app-store', 'Upload macOS package to App Store Connect'],
  ]) {
    const upload = workflow.jobs[jobId].steps.find(
      (step) => step.name === name
    );
    assert.match(upload.if, /steps\.recheck\.outputs\.present != 'true'/);
  }
});

test('a stale review retry releases the production head once', () => {
  const workflow = readWorkflow('mobile-deploy-stores.yaml');
  const retry = workflow.jobs['retry-ios-testflight-review'];
  assert.equal(
    retry.outputs.ledger_stale,
    '${{ steps.retry.outputs.ledger_stale }}'
  );
  const recover = workflow.jobs['release-head-after-stale-retry'];
  assert.deepEqual(recover.permissions, { actions: 'write', contents: 'read' });
  assert.equal(
    recover.if,
    "always() && needs.retry-ios-testflight-review.outputs.ledger_stale == 'true'"
  );
  const run = recover.steps[0].run;
  assert.match(run, /status=\$\{status\}/);
  // Queued review retries cannot publish, so they never suppress recovery.
  assert.match(run, /endswith\(\\"\(release\)\\"\)/);
  assert.match(
    workflow['run-name'],
    /format\('Mobile Store Deployment \(\{0\}\)', inputs\.mode\)/
  );
  assert.match(run, /inputs\[mode\]=release' -f 'inputs\[force\]=true'/);
});
