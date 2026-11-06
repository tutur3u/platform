// Shared fixture publisher for the wave-1 staging publication tests. It runs
// the real publisher entrypoint against counting provider and CLI fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./wave1-native-test-fixture.cjs');
const sha = 'a'.repeat(40);
const oldId = '11111111-1111-1111-1111-111111111111';
const newId = '22222222-2222-2222-2222-222222222222';
const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://staging-fixture.example.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};
Object.assign(process.env, publicEnv);

async function publisher(t, app = 'mail', { preFetch } = {}) {
  const { prepare, artifactDigest } = await import(
    './wave1-native-artifact.mjs'
  );
  const { profiles } = await import('./wave1-native-profile.mjs');
  const ingress = await import('./wave1-ingress-fixture.mjs');
  const dir = fixture(t, app);
  const receipt = prepare(dir, app, 'staging', 'owner-example', sha);
  const admission = {
    schema: 1,
    app,
    sourceSha: sha,
    artifactSha256: artifactDigest(receipt),
    ...profiles.stagingAdmission,
  };
  const env = {
    ...publicEnv,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '1',
    WAVE1_STAGING_ATTEMPT_D1_ID: '33333333-3333-3333-3333-333333333333',
    WAVE1_STAGING_PUBLISH_ENABLED: 'true',
    WAVE1_STAGING_PUBLICATION_ADMISSION: JSON.stringify(admission),
    CLOUDFLARE_STAGING_API_TOKEN: 'staging-fixture',
    CLOUDFLARE_STAGING_ACCOUNT_ID: profiles.accountId,
    CLOUDFLARE_WORKERS_SUBDOMAIN: 'owner-example',
    WAVE1_CONTROL_READ_TOKEN: 'control-fixture',
    STAGING_TUTUR3U_ZONE_ID: ingress.fixtureZoneId,
    STAGING_ACCESS_APP_IDS: JSON.stringify(ingress.fixtureAppIds),
    STAGING_ACCESS_STAFF_GROUP_ID: ingress.fixtureStaffGroupId,
    STAGING_ACCESS_HEALTH_TOKEN_IDS: ingress.fixtureHealthTokenId,
    RUNNER_TEMP: dir,
  };
  const state = {
    writes: 0,
    flagReads: 0,
    admissionReads: 0,
    reads: 0,
    ledgerQueries: 0,
    ledgerWrites: 0,
    versions: [],
    active: oldId,
    failUpload: false,
    loseReceipt: false,
    serving: 'on',
    phase: 'staff',
    topology:
      app === 'web' || profiles.apps[app]?.ingress
        ? ingress.healthyTopology(app)
        : null,
  };
  const response = (body) => Response.json(body);
  const fetcher = async (url, options) => {
    if (preFetch) {
      const intercepted = await preFetch(new URL(url), options, state);
      if (intercepted) return intercepted;
    }
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      assert.equal(
        u.pathname.startsWith('/repos/fixture/repo/actions/variables/'),
        true
      );
      if (u.pathname.endsWith('/WAVE1_STAGING_PUBLISH_ENABLED')) {
        state.flagReads++;
        if (state.flagReads > 1 && state.stop === 'timeout')
          throw new Error('timeout');
        if (state.flagReads > 1 && ['deleted', 'denied'].includes(state.stop))
          return new Response('', {
            status: state.stop === 'deleted' ? 404 : 403,
          });
        return response({
          value:
            state.flagReads > 1 && state.stop === 'disabled' ? 'false' : 'true',
        });
      }
      assert.equal(options.method, 'GET', 'Publisher never writes variables');
      if (u.pathname.endsWith('/WEB_STAGING_SERVING'))
        return response({ value: state.serving });
      if (u.pathname.endsWith('/STAGING_ACCESS_PHASE'))
        return response({ value: state.phase });
      if (u.pathname.endsWith('/WAVE1_STAGING_PUBLICATION_ADMISSION')) {
        state.admissionReads++;
        return response({
          value:
            state.admissionReads > 1 && state.stop === 'admission'
              ? '{}'
              : env.WAVE1_STAGING_PUBLICATION_ADMISSION,
        });
      }
    }
    if (u.hostname === 'api.cloudflare.com') {
      assert.equal(options.headers.Authorization, 'Bearer staging-fixture');
      if (u.pathname.endsWith('/query')) {
        state.ledgerQueries++;
        const { sql, params } = JSON.parse(options.body);
        if (sql.startsWith('SELECT'))
          return response({
            success: true,
            result: [
              {
                success: true,
                results:
                  state.record === undefined ? [] : [{ record: state.record }],
              },
            ],
          });
        assert.equal(
          sql,
          'UPDATE wave1_attempts SET record = ? WHERE app = ? AND record = ?'
        );
        if (state.deleteOnWrite) state.record = undefined;
        const changes = state.record === params[2] ? 1 : 0;
        if (changes) {
          state.ledgerWrites++;
          state.record = params[0];
        }
        if (state.loseMarkerReceipt) throw new Error('lost marker receipt');
        return response({
          success: true,
          result: [{ success: true, meta: { changes } }],
        });
      }
      state.reads++;
      assert.equal(
        options.method,
        'GET',
        'No provider write outside attempt D1'
      );
      const topology =
        state.topology && !u.pathname.includes('/workers/scripts/')
          ? ingress.topologyResponse(u, state.topology)
          : null;
      if (topology) return response(topology);
      if (u.pathname.endsWith('/subdomain'))
        return response({
          success: true,
          result: {
            enabled: state.publicServing === 'workers.dev',
            previews_enabled: state.publicServing === 'preview',
          },
        });
      if (u.pathname.endsWith('/deployments'))
        return response({
          success: true,
          result: {
            deployments: [
              {
                id: 'rollback',
                versions: [{ version_id: state.active, percentage: 100 }],
              },
            ],
          },
        });
      if (u.pathname.endsWith('/secrets'))
        return response({
          success: true,
          result: receipt.profile.secrets.map((name) => ({ name })),
        });
      if (u.pathname.endsWith('/versions'))
        return response({
          success: true,
          result: { items: state.versions.map(({ id }) => ({ id })) },
        });
      const version = state.versions.find(
        (v) => v.id === u.pathname.split('/').at(-1)
      );
      if (version) return response({ success: true, result: version });
    }
    throw new Error(`Unexpected test transport ${url}`);
  };
  const exec = (command, args, options) => {
    if (args.includes('--dry-run')) {
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
      assert.equal(options.timeout, 60000);
      fs.copyFileSync(
        path.join(dir, 'dist/server/index.js'),
        path.join(args[args.indexOf('--outdir') + 1], 'index.js')
      );
      emit({
        type: 'deploy',
        worker_name: receipt.profile.name,
        version_id: null,
        bundle_size: {
          raw_bytes: fs.readFileSync(path.join(dir, 'dist/server/index.js'))
            .length,
          gzip_bytes: 1,
        },
      });
      return;
    }
    state.writes++;
    assert.equal(command, 'bun');
    assert.deepEqual(args.slice(0, 4), [
      'x',
      '--no-install',
      'wrangler',
      'deploy',
    ]);
    assert.equal(
      options.env.CLOUDFLARE_API_TOKEN,
      env.CLOUDFLARE_STAGING_API_TOKEN
    );
    assert.equal(options.timeout, 180000);
    if (state.uploadError) throw state.uploadError;
    state.versions.push({
      id: newId,
      annotations: {
        'workers/message': sha,
        'workers/tag': admission.artifactSha256,
      },
    });
    if (state.failUpload) throw new Error('timeout after upload');
    state.active = newId;
    if (!state.loseReceipt)
      emit({
        type: 'deploy',
        worker_name: receipt.profile.name,
        version_id: newId,
      });
    function emit(payload) {
      fs.writeFileSync(
        options.env.WRANGLER_OUTPUT_FILE_PATH,
        JSON.stringify(payload)
      );
    }
  };
  const { signAttemptState } = await import('./wave1-native-attempt.mjs');
  const ledgerData = {
    schema: 1,
    scope: {
      databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
      repository: env.GITHUB_REPOSITORY,
      app,
      worker: receipt.profile.name,
      accountId: receipt.profile.accountId,
    },
    entries: [],
  };
  const setLedger = (data) => {
    state.record = signAttemptState(data, env.CLOUDFLARE_STAGING_API_TOKEN);
  };
  const getLedger = () => JSON.parse(JSON.parse(state.record).data);
  setLedger(ledgerData);
  const { main } = await import('./wave1-native-publish.mjs');
  const options = {
    argv: ['publish', app, 'staging', sha],
    env,
    appRoot: dir,
    fetcher,
    exec,
  };
  return {
    run: () => main(options),
    options,
    state,
    env,
    admission,
    dir,
    setLedger,
    getLedger,
  };
}

module.exports = { newId, oldId, publicEnv, publisher, sha };
