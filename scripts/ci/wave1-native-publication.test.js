const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { fixture } = require('./wave1-native-test-fixture.cjs');
const { readWorkflow } = require('./workflow-yaml-test-helper');
const {
  newId,
  oldId,
  publisher,
  sha,
} = require('./wave1-native-publication-harness.cjs');

async function assertStopped(p, main) {
  await assert.rejects(() => (main ? main(p.options) : p.run()));
  assert.equal(
    p.state.writes,
    0,
    'Fresh real publisher fence must prevent uploads'
  );
}
for (const stop of ['disabled', 'deleted', 'denied', 'timeout', 'admission']) {
  test(`real publish entrypoint stops ${stop} after preflight and on restart`, async (t) => {
    const p = await publisher(t);
    p.state.stop = stop;
    await assertStopped(p);
    await assertStopped(p);
    assert.ok(p.state.flagReads >= 2);
  });
}
test('negative control: removing the real final fence fails the same zero-upload assertion', async (t) => {
  const p = await publisher(t);
  p.state.stop = 'disabled';
  const source = fs.readFileSync(
    path.join(__dirname, 'wave1-native-publish.mjs'),
    'utf8'
  );
  const needle = '    await assertEnabled();';
  assert.equal(source.split(needle).length, 2, 'One final fence expected');
  const mutant = source
    .replace(needle, '')
    .replace(
      /(['"])\.\/(wave1-[^'"]+|production-publication-policy\.ts)\1/g,
      (_, _quote, file) =>
        JSON.stringify(pathToFileURL(path.join(__dirname, file)).href)
    );
  const file = path.join(p.dir, 'publisher-without-final-fence.mjs');
  fs.writeFileSync(file, mutant);
  const { main } = await import(pathToFileURL(file).href);
  await assert.rejects(() => assertStopped(p, main), assert.AssertionError);
  assert.equal(
    p.state.writes,
    1,
    'Negative control must reach the forbidden upload'
  );
});
for (const outcome of [
  'timeout',
  'lost-receipt',
  'lost-marker-receipt',
  'crash-before-upload',
]) {
  test(`durable ${outcome} attempt cannot replay on a fresh runner`, async (t) => {
    const p = await publisher(t);
    p.state.failUpload = outcome === 'timeout';
    p.state.loseReceipt = outcome === 'lost-receipt';
    p.state.loseMarkerReceipt = outcome === 'lost-marker-receipt';
    if (outcome === 'crash-before-upload') {
      const originalExec = p.options.exec;
      p.options.exec = (command, args, options) => {
        if (args.includes('--dry-run'))
          return originalExec(command, args, options);
        throw new Error('crash');
      };
    }
    await assert.rejects(p.run);
    const writes = p.state.writes;
    fs.rmSync(path.join(p.dir, 'mail-staging-publication.json'), {
      force: true,
    });
    p.state.loseMarkerReceipt = false;
    if (outcome === 'lost-receipt') await p.run();
    else await assert.rejects(p.run);
    assert.equal(p.state.writes, writes);
    assert.equal(p.getLedger().entries.length, 1);
  });
}
test('inactive matching uploaded version blocks reupload and reconciles only after activation', async (t) => {
  const p = await publisher(t);
  p.state.failUpload = true;
  await assert.rejects(p.run);
  await assert.rejects(p.run);
  assert.equal(p.getLedger().entries[0].state, 'uploaded');
  p.state.active = newId;
  await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(p.getLedger().entries[0].state, 'activated');
});
test('rerunning an activated publication re-verifies without downgrading the ledger', async (t) => {
  const p = await publisher(t);
  await p.run();
  const writes = p.state.ledgerWrites;
  await p.run();
  assert.equal(p.state.ledgerWrites, writes);
  p.state.active = oldId;
  await assert.rejects(p.run);
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.ledgerWrites, writes);
  assert.equal(p.getLedger().entries[0].state, 'activated');
  assert.equal(p.getLedger().entries[0].versionId, newId);
});
test('finite admission rejects later main pushes, changed bytes, and consumed identities', async (t) => {
  const p = await publisher(t);
  await p.run();
  await p.run();
  assert.equal(p.state.writes, 1);
  for (const sourceSha of ['b'.repeat(40), 'c'.repeat(40)]) {
    p.options.argv[3] = sourceSha;
    await assert.rejects(p.run, /admission/);
  }
  p.options.argv[3] = sha;
  p.env.WAVE1_STAGING_PUBLICATION_ADMISSION = JSON.stringify({
    ...p.admission,
    artifactSha256: 'f'.repeat(64),
  });
  await assert.rejects(p.run, /artifact digest/);
  assert.equal(p.state.writes, 1);
  assert.equal(p.getLedger().entries.length, 1);
});
for (const field of [
  'CLOUDFLARE_STAGING_API_TOKEN',
  'CLOUDFLARE_STAGING_ACCOUNT_ID',
  'WAVE1_STAGING_PUBLICATION_ADMISSION',
  'WAVE1_STAGING_ATTEMPT_D1_ID',
]) {
  test(`missing ${field} fails closed before provider reads or uploads`, async (t) => {
    const p = await publisher(t);
    delete p.env[field];
    await assert.rejects(p.run);
    assert.equal(p.state.writes, 0);
    assert.equal(p.state.reads, 0);
  });
}
test('production credential or mismatched staging account is refused before provider reads', async (t) => {
  const p = await publisher(t);
  p.env.CLOUDFLARE_API_TOKEN = 'production-negative-control';
  await assert.rejects(p.run, /Production deploy token exposed/);
  delete p.env.CLOUDFLARE_API_TOKEN;
  p.env.CLOUDFLARE_STAGING_ACCOUNT_ID = 'wrong-account';
  await assert.rejects(p.run, /account admission mismatch/);
  assert.equal(p.state.reads, 0);
});
test('workflow routes only staging credentials and exact admission into the tested entrypoint', () => {
  const job = readWorkflow('wave1-native-publish.yaml').jobs.publish;
  const step = job.steps.find((s) =>
    s.run?.includes('wave1-native-publish.mjs publish')
  );
  assert.equal(
    step.run,
    'node scripts/ci/wave1-native-publish.mjs publish "$APP" "$PROFILE" "$SOURCE_SHA"'
  );
  assert.equal(
    step.env.CLOUDFLARE_STAGING_API_TOKEN,
    '$' + '{{ secrets.CLOUDFLARE_STAGING_API_TOKEN }}'
  );
  assert.equal(
    step.env.CLOUDFLARE_STAGING_ACCOUNT_ID,
    '$' + '{{ vars.CLOUDFLARE_STAGING_ACCOUNT_ID }}'
  );
  assert.equal(
    step.env.WAVE1_STAGING_PUBLICATION_ADMISSION,
    '$' + '{{ vars.WAVE1_STAGING_PUBLICATION_ADMISSION }}'
  );
  assert.equal(step.env.GITHUB_TOKEN, undefined);
  assert.equal(
    step.env.WAVE1_STAGING_ATTEMPT_D1_ID,
    '$' + '{{ vars.WAVE1_STAGING_ATTEMPT_D1_ID }}'
  );
  assert.doesNotMatch(
    JSON.stringify(job),
    /secrets\.CLOUDFLARE_API_TOKEN|secrets:.*inherit|secrets\[/
  );
});
test('staging configs reject production resource identities derived from every production profile', async (t) => {
  const { profiles, profileFor, assertStagingIsolation } = await import(
    './wave1-native-profile.mjs'
  );
  const { prepare, verify } = await import('./wave1-native-artifact.mjs');
  for (const app of Object.keys(profiles.apps)) {
    const dir = fixture(t, app);
    prepare(dir, app, 'staging', 'owner-example', sha);
    const config = JSON.parse(
      fs.readFileSync(verify(dir, app, 'staging', sha).config)
    );
    assertStagingIsolation(config);
    for (const target of Object.keys(profiles.apps)) {
      const production = profileFor(target, 'production');
      for (const identity of [
        production.name,
        `https://${production.host}/private`,
        ...Object.entries(profiles.apps[target].ownerProvisionedResources ?? {})
          .filter(([key]) => key.startsWith('retainedProduction'))
          .map(([, value]) => value),
      ]) {
        assert.throws(
          () =>
            assertStagingIsolation({
              ...config,
              services: [{ service: identity }],
            }),
          /Production resource/
        );
      }
    }
    assert.throws(
      () =>
        assertStagingIsolation({
          ...config,
          routes: [{ pattern: 'canonical.example.com', custom_domain: true }],
        }),
      /no routes/
    );
  }
});
test('admission rejects alternate credential names, shared resources, and missing risk acknowledgement', async () => {
  const { stagingAdmission } = await import('./wave1-native-admission.mjs');
  const { profiles } = await import('./wave1-native-profile.mjs');
  const record = {
    schema: 1,
    app: 'mail',
    sourceSha: sha,
    artifactSha256: 'a'.repeat(64),
    ...profiles.stagingAdmission,
  };
  for (const [key, value] of Object.entries({
    accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
    tokenSecret: 'CLOUDFLARE_API_TOKEN',
    isolation: 'shared-resources',
    scopedTokenRequired: false,
    residualRisk: undefined,
    maxUploadsPerArtifact: 2,
  }))
    assert.throws(() =>
      stagingAdmission(JSON.stringify({ ...record, [key]: value }), 'mail', sha)
    );
});
test('an unresolved preceding artifact blocks a newly admitted artifact', async (t) => {
  const p = await publisher(t);
  p.setLedger({
    ...p.getLedger(),
    entries: [
      {
        runId: '10',
        runAttempt: '1',
        state: 'pending',
        payload: { sha: 'b'.repeat(40), digest: 'c'.repeat(64) },
      },
    ],
  });
  await assert.rejects(p.run, /Earlier publication attempt is unresolved/);
  assert.equal(p.state.writes, 0);
});
test('full authenticated history refuses publication', async (t) => {
  const p = await publisher(t);
  p.setLedger({
    ...p.getLedger(),
    entries: Array.from({ length: 100 }, () => ({
      runId: '10',
      runAttempt: '1',
      state: 'pending',
      payload: { sha, digest: p.admission.artifactSha256 },
    })),
  });
  await assert.rejects(p.run, /history incomplete/);
  assert.equal(p.state.writes, 0);
});
test('a failed pre-upload admission stays consumed after the stop fence is re-enabled', async (t) => {
  const p = await publisher(t);
  p.state.stop = 'disabled';
  await assert.rejects(p.run, /stop fence/);
  assert.equal(p.getLedger().entries[0].state, 'failed');
  p.state.stop = undefined;
  await assert.rejects(p.run, /unresolved or consumed/);
  assert.equal(p.state.writes, 0);
  assert.equal(p.getLedger().entries.length, 1);
});
test('a new publication uses one upload and bounded ledger/control observations', async (t) => {
  const p = await publisher(t);
  await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(p.state.reads, 6);
  assert.equal(p.state.flagReads, 2);
  assert.equal(p.state.admissionReads, 2);
  assert.equal(p.getLedger().entries.length, 1);
  assert.equal(p.state.ledgerWrites, 3);
  assert.equal(p.state.ledgerQueries, 7);
  assert.equal(p.getLedger().entries[0].state, 'activated');
  assert.equal(p.getLedger().entries[0].versionId, newId);
  assert.equal(p.getLedger().entries[0].runId, p.env.GITHUB_RUN_ID);
});

for (const attack of [
  'missing',
  'deleted',
  'forged-failed',
  'forged-newest',
  'wrong-scope',
  'delete-on-consume',
]) {
  test(`unauthentic or missing D1 state blocks upload: ${attack}`, async (t) => {
    const p = await publisher(t);
    if (attack !== 'missing') {
      const originalExec = p.options.exec;
      p.options.exec = (command, args, options) => {
        if (args.includes('--dry-run'))
          return originalExec(command, args, options);
        throw new Error('crash before provider upload');
      };
      await assert.rejects(p.run);
    }
    if (['missing', 'deleted'].includes(attack)) p.state.record = undefined;
    else if (attack === 'delete-on-consume') {
      // A second independent runner loses its authenticated preimage during CAS.
      p.setLedger({ ...p.getLedger(), entries: [] });
      p.state.deleteOnWrite = true;
    } else if (attack === 'wrong-scope') {
      const data = p.getLedger();
      data.scope.repository = 'attacker/repo';
      p.setLedger(data);
    } else {
      const envelope = JSON.parse(p.state.record);
      const data = JSON.parse(envelope.data);
      if (attack === 'forged-failed') data.entries[0].state = 'failed';
      else
        data.entries.unshift({
          ...data.entries[0],
          state: 'failed',
          payload: { sha: 'b'.repeat(40), digest: 'c'.repeat(64) },
        });
      envelope.data = JSON.stringify(data);
      p.state.record = JSON.stringify(envelope);
    }
    await assert.rejects(
      p.run,
      /Missing durable|Invalid attempt signature|scope mismatch|changed or deleted/
    );
    assert.equal(p.state.writes, 0);
  });
}
test('a PR GitHub token cannot authenticate the ledger or settle uncertainty', async (t) => {
  const p = await publisher(t);
  const { signAttemptState } = await import('./wave1-native-attempt.mjs');
  p.state.record = signAttemptState(p.getLedger(), 'pr-github-token');
  await assert.rejects(p.run, /Invalid attempt signature/);
  assert.equal(p.state.writes, 0);
});
test('staging startup rejection retains sanitized diagnostics and its pending fence', async (t) => {
  const p = await publisher(t);
  p.state.uploadError = Object.assign(new Error('provider rejected'), {
    status: 1,
    stderr: Buffer.from('Script startup exceeded CPU time limit [code: 10021]'),
  });
  await assert.rejects(p.run(), /outcome is uncertain/u);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(p.dir, 'mail-staging-publication.json'))
  );
  assert.equal(receipt.state, 'pending');
  assert.equal(receipt.uploadFailure.cfCode, 10021);
  assert.match(
    receipt.uploadFailure.cfErrors[0].message,
    /startup exceeded CPU/u
  );
  assert.equal(p.getLedger().entries.length, 1);
});

test('only publication boundaries forward staging credentials and public inputs', () => {
  const names = [
    'CLOUDFLARE_STAGING_API_TOKEN',
    'WAVE1_CONTROL_READ_TOKEN',
    'STAGING_SUPABASE_URL',
    'STAGING_SUPABASE_PUBLISHABLE_KEY',
  ].sort();
  assert.equal(
    readWorkflow('wave1-native-app.yaml').on.workflow_call.secrets,
    undefined
  );
  assert.deepEqual(
    Object.keys(
      readWorkflow('wave1-native-publish.yaml').on.workflow_call.secrets
    ).sort(),
    names
  );
  for (const [file, jobId] of [
    ['calendar-cloudflare.yaml', 'native-publish-staging'],
    ['mail-cloudflare.yaml', 'native-publish-staging'],
    ['apps-cloudflare.yaml', 'native-publish-staging'],
  ]) {
    const job = readWorkflow(file).jobs[jobId];
    assert.deepEqual(Object.keys(job.secrets).sort(), names, file);
    for (const name of names)
      assert.equal(
        job.secrets[name],
        '$' +
          `{{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && secrets.${name} || '' }}`,
        `${file}: ${name}`
      );
  }
  assert.equal(
    readWorkflow('wave1-native-app.yaml').jobs['publish-production'],
    undefined
  );
  const job = readWorkflow('wave1-native-publish.yaml').jobs.publish;
  const step = job.steps.find((s) =>
    s.run?.includes('wave1-native-publish.mjs publish')
  );
  for (const name of [
    'CLOUDFLARE_STAGING_API_TOKEN',
    'WAVE1_CONTROL_READ_TOKEN',
  ]) {
    assert.equal(step.env[name], `\${{ secrets.${name} }}`);
    assert.equal(job.env[name], undefined);
    for (const other of job.steps.filter((s) => s !== step))
      assert.ok(!JSON.stringify(other).includes(`secrets.${name}`));
  }
});

for (const publicServing of ['workers.dev', 'preview']) {
  test(`enabled ${publicServing} cannot be accepted or trigger another upload`, async (t) => {
    const p = await publisher(t);
    p.state.publicServing = publicServing;
    await assert.rejects(p.run, /must be disabled/);
    await assert.rejects(p.run, /must be disabled/);
    assert.equal(p.state.writes, 1);
    assert.equal(p.getLedger().entries[0].state, 'uploaded');
  });
}

test('Calendar publishes only the explicit custom staging host from its sealed profile', async (t) => {
  const p = await publisher(t, 'calendar');
  await p.run();
  assert.equal(p.state.writes, 1);
  assert.equal(p.getLedger().entries[0].state, 'activated');
  const receipt = JSON.parse(
    fs.readFileSync(path.join(p.dir, 'wave1-artifact.json'))
  );
  assert.equal(receipt.profile.host, 'calendar.staging.tutur3u.com');
});
