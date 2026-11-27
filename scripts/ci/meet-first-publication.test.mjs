import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { meetWorkerToolEnvironment } from './meet-native-launcher.mjs';
import { withFirstUploadGate } from './meet-first-upload.mjs';
import {
  firstArtifactConfig,
  inspectMeetFirstArtifact,
} from './meet-first-publication.mjs';
import { signAttemptState } from './wave1-native-attempt.mjs';
import { main } from './wave1-native-publish.mjs';
import { profiles } from './wave1-native-profile.mjs';

const sha = 'a'.repeat(40);
const version = '22222222-2222-2222-2222-222222222222';
const repository = 'tutur3u/platform';
const app = 'abuse-guard';
const name = 'tuturuuu-abuse-guard-wave1-staging';
const accountId = profiles.accountId;
const databaseId = '33333333-3333-3333-3333-333333333333';
const secrets = ['ABUSE_GUARD_SECRETS', 'ABUSE_GUARD_OPERATOR_TOKEN'];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'meet-first-pub-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = {
    name,
    account_id: accountId,
    main: 'index.mjs',
    no_bundle: true,
    workers_dev: false,
    preview_urls: false,
    routes: [],
    secrets: { required: secrets },
    durable_objects: {
      bindings: [
        { name: 'GUARD_SUBJECT', class_name: 'GuardSubject' },
        { name: 'GUARD_CONTROL', class_name: 'GuardControl' },
      ],
    },
    migrations: [
      { tag: 'v1', new_sqlite_classes: ['GuardSubject', 'GuardControl'] },
    ],
    vars: {
      ABUSE_GUARD_DAILY_OP_BUDGET: '1000',
      ABUSE_GUARD_FAMILY_BUDGETS: '',
      ABUSE_GUARD_LOCATION_HINT: 'apac',
    },
  };
  const write = () =>
    writeFileSync(join(root, firstArtifactConfig), JSON.stringify(config));
  write();
  writeFileSync(
    join(root, 'index.mjs'),
    'export default {fetch(){return new Response(null)}};'
  );
  const inspect = () => inspectMeetFirstArtifact(root, app, 'owner-example');
  const artifact = inspect();
  const record = JSON.stringify({
    schema: 1,
    app,
    sourceSha: sha,
    artifactSha256: artifact.digest,
    ...profiles.stagingAdmission,
  });
  const env = {
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: '1',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_TOKEN: 'github-fixture',
    WAVE1_CONTROL_READ_TOKEN: 'control-fixture',
    CLOUDFLARE_STAGING_API_TOKEN: 'cf-fixture',
    CLOUDFLARE_STAGING_ACCOUNT_ID: accountId,
    CLOUDFLARE_WORKERS_SUBDOMAIN: 'owner-example',
    WAVE1_STAGING_ATTEMPT_D1_ID: databaseId,
    WAVE1_STAGING_PUBLISH_ENABLED: 'true',
    WAVE1_STAGING_PUBLICATION_ADMISSION: record,
    WAVE1_MEET_FIRST_ARTIFACT_DIR: root,
  };
  const state = {
    marker: signAttemptState(
      {
        schema: 1,
        scope: { accountId, databaseId, repository, app, worker: name },
        entries: [],
      },
      env.CLOUDFLARE_STAGING_API_TOKEN
    ),
    writes: 0,
    observations: 0,
    activated: false,
  };
  const fetcher = async (input, options) => {
    const path = new URL(input).pathname;
    const json = Response.json;
    if (path.endsWith('/environments/wave1-meet-staging'))
      return json({
        name: 'wave1-meet-staging',
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
      });
    if (path.endsWith('/deployment-branch-policies'))
      return json({
        total_count: 1,
        branch_policies: [{ type: 'branch', name: 'main' }],
      });
    if (path.endsWith('/WAVE1_STAGING_PUBLISH_ENABLED'))
      return json({
        value: state.stop && state.observations > 0 ? 'false' : 'true',
      });
    if (path.endsWith('/WAVE1_STAGING_PUBLICATION_ADMISSION'))
      return json({ value: record });
    if (path.endsWith('/query')) {
      const { sql, params } = JSON.parse(options.body);
      if (sql.startsWith('SELECT'))
        return json({
          success: true,
          result: [{ success: true, results: [{ record: state.marker }] }],
        });
      assert.equal(params[2], state.marker);
      state.marker = params[0];
      return json({
        success: true,
        result: [{ success: true, meta: { changes: 1 } }],
      });
    }
    assert.ok(path.includes(`/accounts/${accountId}/workers/scripts/${name}/`));
    if (path.endsWith('/settings')) {
      state.observations++;
      if (
        state.exists ||
        state.activated ||
        (state.collision && state.observations === 2)
      )
        return json({ success: true });
      return json(
        { success: false, errors: [{ code: state.absenceCode ?? 10007 }] },
        { status: state.absenceStatus ?? 404 }
      );
    }
    if (path.endsWith('/deployments'))
      return json({
        success: true,
        result: {
          deployments: state.activated
            ? [{ versions: [{ version_id: version, percentage: 100 }] }]
            : [],
        },
      });
    if (path.endsWith('/versions'))
      return json({
        success: true,
        result: { items: state.activated ? [{ id: version }] : [] },
      });
    if (path.endsWith(version))
      return json({
        success: true,
        result: {
          annotations: {
            'workers/tag':
              'meet-first-' +
              createHash('sha256')
                .update(
                  JSON.stringify([
                    repository,
                    accountId,
                    name,
                    sha,
                    artifact.digest,
                    '1',
                    '1',
                  ])
                )
                .digest('hex'),
          },
          resources: {
            bindings: [
              {
                name: 'MEET_STAGING_SOURCE_SHA',
                type: 'plain_text',
                text: sha,
              },
              {
                name: 'MEET_STAGING_ARTIFACT_SHA256',
                type: 'plain_text',
                text: artifact.digest,
              },
            ],
          },
        },
      });
    if (path.endsWith('/secrets'))
      return json({ success: true, result: secrets.map((name) => ({ name })) });
    if (path.endsWith('/subdomain'))
      return json({
        success: true,
        result: { enabled: false, previews_enabled: false },
      });
    assert.fail(`Unexpected fixture read ${path}`);
  };
  const exec = (command, args, options) => {
    assert.equal(command, '/bin/bash');
    assert.deepEqual(args.slice(3, 5), ['run', 'deploy:cloudflare']);
    assert.ok(args.includes('--no-experimental-auto-create'));
    assert.ok(args.includes('/dev/stdin'));
    assert.equal(
      JSON.parse(options.input).ABUSE_GUARD_SECRETS,
      'generated-fixture'
    );
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, 'cf-fixture');
    for (const [key, value] of Object.entries(meetWorkerToolEnvironment))
      assert.equal(options.env[key], value);
    assert.match(
      options.env.CLOUDFLARE_API_BASE_URL,
      /^http:\/\/127\.0\.0\.1:[0-9]+\/client\/v4$/u
    );
    assert.equal(options.env.WAVE1_CONTROL_READ_TOKEN, undefined);
    state.writes++;
    state.activated = true;
    if (state.loseReceipt)
      throw new Error('secret must never reach output: generated-fixture');
  };
  return {
    state,
    config,
    write,
    inspect,
    env,
    run: (argv = ['meet-first-publish', app, 'staging', sha]) =>
      main({
        argv,
        env,
        fetcher,
        exec,
        readCredentials: () =>
          Object.fromEntries(
            secrets.map((name) => [name, 'generated-fixture'])
          ),
      }),
  };
}

test('first publication accepts only the exact sealed staging name and local bindings', (t) => {
  const { config, write, inspect } = fixture(t);
  config.name = 'tuturuuu-abuse-guard';
  write();
  assert.throws(inspect);
  config.name = name;
  config.durable_objects.bindings[0].script_name = 'tuturuuu-abuse-guard';
  write();
  assert.throws(inspect, /Durable Objects must be local/);
});

test('first publication requires main, staging and the exact artifact digest', async (t) => {
  const { config, write, env, run, state } = fixture(t);
  await assert.rejects(run(['meet-first-publish', app, 'production', sha]));
  env.GITHUB_REF = 'refs/heads/feature/meet';
  await assert.rejects(run(), /trusted main/);
  env.GITHUB_REF = 'refs/heads/main';
  config.compatibility_date = '2026-09-28';
  write();
  await assert.rejects(run(), /artifact digest/);
  assert.equal(state.writes, 0);
});

for (const blocked of [
  { exists: true },
  { absenceStatus: 403 },
  { absenceCode: 9999 },
  { collision: true },
  { stop: true },
]) {
  test(`first publication refuses ${Object.keys(blocked)[0]}`, async (t) => {
    const { run, state } = fixture(t);
    Object.assign(state, blocked);
    await assert.rejects(run());
    assert.equal(state.writes, 0);
  });
}

test('first publication requires no rollback deployment and never uploads twice', async (t) => {
  const { run, state } = fixture(t);
  await run();
  await run();
  assert.equal(state.writes, 1);
  const [entry] = JSON.parse(JSON.parse(state.marker).data).entries;
  assert.equal(entry.payload.rollback, null);
  assert.equal(entry.state, 'activated');
  assert.equal(entry.versionId, version);
});

test('lost upload receipt is reconciled from the active artifact only', async (t) => {
  const { run, state } = fixture(t);
  state.loseReceipt = true;
  await assert.rejects(run(), /^Error: First publication outcome unresolved/);
  await run();
  assert.equal(state.writes, 1);
});

test('the publisher accepts byte-identical restored build output and rejects a changed module', async (t) => {
  const { env, run, state } = fixture(t);
  const sealed = JSON.parse(
    execFileSync(
      process.execPath,
      [
        'scripts/ci/wave1-native-publish.mjs',
        'meet-first-seal',
        app,
        'staging',
        sha,
      ],
      {
        encoding: 'utf8',
        env: {
          WAVE1_MEET_FIRST_ARTIFACT_DIR: env.WAVE1_MEET_FIRST_ARTIFACT_DIR,
          CLOUDFLARE_WORKERS_SUBDOMAIN: env.CLOUDFLARE_WORKERS_SUBDOMAIN,
        },
      }
    )
  );
  assert.equal(
    sealed.digest,
    JSON.parse(env.WAVE1_STAGING_PUBLICATION_ADMISSION).artifactSha256
  );
  const restored = mkdtempSync(join(tmpdir(), 'meet-first-restored-'));
  t.after(() => rmSync(restored, { recursive: true, force: true }));
  cpSync(env.WAVE1_MEET_FIRST_ARTIFACT_DIR, restored, { recursive: true });
  env.WAVE1_MEET_FIRST_ARTIFACT_DIR = restored;
  writeFileSync(join(restored, 'index.mjs'), 'changed');
  await assert.rejects(run(), /artifact digest/);
  assert.equal(state.writes, 0);
  writeFileSync(
    join(restored, 'index.mjs'),
    'export default {fetch(){return new Response(null)}};'
  );
  await run();
  assert.equal(state.writes, 1);
});

test('a lost provider response cannot replay the Worker script PUT', async () => {
  const scriptPath = `/client/v4/accounts/${accountId}/workers/scripts/${name}`;
  let writes = 0;
  await withFirstUploadGate(
    {
      scriptPath,
      versionTag: 'fixed-claim',
      token: 'fixture',
      fetcher: async (_url, options) => {
        writes++;
        const metadata = JSON.parse(await options.body.get('metadata').text());
        assert.equal(metadata.annotations['workers/tag'], 'fixed-claim');
        throw new Error('Response lost after provider write');
      },
    },
    async (base) => {
      const url = `${base}/accounts/${accountId}/workers/scripts/${name}`;
      const form = new FormData();
      form.set('metadata', JSON.stringify({ main_module: 'index.mjs' }));
      assert.equal(
        (
          await fetch(url, {
            method: 'PUT',
            headers: { Authorization: 'Bearer fixture' },
            body: form,
          })
        ).status,
        502
      );
      assert.equal(
        (
          await fetch(url, {
            method: 'PUT',
            headers: { Authorization: 'Bearer fixture' },
            body: form,
          })
        ).status,
        400
      );
    }
  );
  assert.equal(writes, 1);
});

test('the upload gate permits bounded batch and per-asset endpoints', async () => {
  const scriptPath = `/client/v4/accounts/${accountId}/workers/scripts/tuturuuu-meet-wave1-staging`;
  const received = [];
  await withFirstUploadGate(
    {
      scriptPath,
      versionTag: 'fixture',
      token: 'fixture',
      fetcher: async (url, options) => {
        for await (const _chunk of options.body) {
          /* consume fixture body */
        }
        received.push(url.pathname);
        return Response.json({ success: true });
      },
    },
    async (base) => {
      const prefix = `${base}/accounts/${accountId}/workers/assets/upload`;
      for (const url of [prefix, `${prefix}/${'d'.repeat(32)}`])
        assert.equal(
          (await fetch(url, { method: 'POST', body: 'asset' })).status,
          200
        );
      assert.equal(
        (await fetch(`${prefix}/unrelated`, { method: 'POST', body: 'asset' }))
          .status,
        400
      );
    }
  );
  assert.equal(received.length, 2);
});

test('invalid staged vars do not expose an accidentally emitted secret', (t) => {
  const { config, write, inspect } = fixture(t);
  config.vars.ACCIDENTAL_SECRET = 'secret-must-not-be-logged';
  write();
  assert.throws(
    inspect,
    (error) => error.message === 'Unadmitted staging variables'
  );
});
