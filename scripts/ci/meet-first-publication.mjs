import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { stagingAdmission } from './wave1-native-admission.mjs';
import { preflight } from './wave1-staging-preflight.mjs';
import { runFirstUpload, withFirstUploadGate } from './meet-first-upload.mjs';
import { inventory } from './wave1-native-artifact.mjs';
import { attemptLedger } from './wave1-native-attempt.mjs';

const require = createRequire(import.meta.url);
const accountId = 'e8912e2867beecc673d171907bf09649';
const targets = {
  'abuse-guard': {
    bindings: ['GUARD_SUBJECT', 'GUARD_CONTROL'],
    classes: ['GuardSubject', 'GuardControl'],
    secrets: ['ABUSE_GUARD_SECRETS', 'ABUSE_GUARD_OPERATOR_TOKEN'],
  },
  'meet-realtime': {
    bindings: [
      'MEET_ROOM',
      'COLLABORATION_ROOM',
      'CHANNEL_ROOM',
      'WHITEBOARD_ROOM',
    ],
    classes: [
      'MeetRoomDurableObject',
      'CollaborationRoomDurableObject',
      'ChannelRoomDurableObject',
      'WhiteboardRoomDurableObject',
    ],
    secrets: [
      'MEET_REALTIME_TOKEN_SECRET',
      'CLOUDFLARE_REALTIME_APP_ID',
      'CLOUDFLARE_REALTIME_APP_SECRET',
      'CLOUDFLARE_TURN_KEY_ID',
      'CLOUDFLARE_TURN_API_TOKEN',
      'MEET_AI_DISABLED_WORKSPACE_IDS',
      'MEET_AI_PROTECTED_WORKSPACE_IDS',
    ],
  },
  meet: {
    bindings: ['MEET_LIVE'],
    classes: ['MeetLiveDurableObject'],
    secrets: [
      'ABUSE_GUARD_KEY_PEPPER',
      'HUMAN_CHECK_SECRET',
      'TURNSTILE_SECRET_KEY',
      'MEET_REALTIME_TOKEN_SECRET',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SECRET_KEY',
      'GOOGLE_GENERATIVE_AI_API_KEY',
      'MEET_AI_DISABLED_WORKSPACE_IDS',
      'MEET_AI_PROTECTED_WORKSPACE_IDS',
    ],
  },
};
const nameFor = (app) => `tuturuuu-${app}-wave1-staging`;
const allowedKeys = new Set([
  '$schema',
  'name',
  'account_id',
  'main',
  'compatibility_date',
  'compatibility_flags',
  'no_bundle',
  'upload_source_maps',
  'rules',
  'workers_dev',
  'preview_urls',
  'routes',
  'assets',
  'services',
  'vars',
  'r2_buckets',
  'durable_objects',
  'migrations',
  'secrets',
  'observability',
]);

export function readMeetFirstCredentials() {
  const bytes = Buffer.alloc(128 * 1024 + 1);
  try {
    let used = 0;
    while (used < bytes.length) {
      const count = readSync(0, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
    assert.ok(used < bytes.length);
    return JSON.parse(bytes.toString('utf8', 0, used));
  } catch {
    throw new Error('Invalid or oversized Meet staging credentials on stdin');
  } finally {
    bytes.fill(0);
  }
}

export function inspectMeetFirstArtifact(directory, app, subdomain) {
  assert.ok(Object.hasOwn(targets, app), 'Unadmitted first-publication app');
  assert.match(subdomain ?? '', /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u);
  const root = realpathSync(directory);
  assert.ok(
    !existsSync(resolve(root, '__proto__')),
    'Unsealable artifact path'
  );
  const files = inventory(root);
  assert.ok(Object.hasOwn(files, 'wrangler.json'), 'Missing sealed config');
  const configPath = resolve(root, 'wrangler.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const target = targets[app];
  const name = nameFor(app);
  const workersDev = app !== 'abuse-guard';
  assert.ok(Object.keys(config).every((key) => allowedKeys.has(key)));
  assert.equal(config.name, name);
  assert.equal(config.account_id, accountId);
  assert.equal(config.no_bundle, true);
  assert.equal(config.workers_dev, workersDev);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.secrets, { required: target.secrets });
  const contained = (entry) => {
    const path = realpathSync(resolve(root, entry));
    assert.ok(path.startsWith(root + sep), 'Artifact path escaped its seal');
    return path;
  };
  contained(config.main);
  assert.ok(
    Object.hasOwn(files, config.main.replace(/^\.\//u, '')),
    'Main must be a sealed file'
  );
  const bindings = config.durable_objects.bindings;
  assert.deepEqual(
    bindings.toSorted((a, b) => a.name.localeCompare(b.name)),
    target.bindings
      .map((name, index) => ({ name, class_name: target.classes[index] }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    'Durable Objects must be local and match the staging profile'
  );
  const revisions =
    app === 'meet-realtime'
      ? ['v1', 'v2-collaboration', 'v3-channels', 'v4-whiteboard']
      : app === 'meet'
        ? ['meet-live-v1']
        : null;
  assert.deepEqual(
    config.migrations.flatMap((migration) => migration.new_sqlite_classes),
    target.classes
  );
  assert.ok(
    config.migrations.every(
      (migration) =>
        Object.keys(migration).sort().join(',') === 'new_sqlite_classes,tag' &&
        /^[a-zA-Z0-9_.-]+$/u.test(migration.tag)
    ),
    'Only initial SQLite migrations are admitted'
  );
  if (revisions)
    assert.deepEqual(
      config.migrations.map((migration) => migration.tag),
      revisions
    );
  else assert.equal(config.migrations.length, 1);

  if (app === 'meet') {
    const { directory: assets, ...settings } = config.assets;
    contained(assets);
    assert.deepEqual(settings, {
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    });
    assert.deepEqual(config.services, [
      { binding: 'WORKER_SELF_REFERENCE', service: name },
      {
        binding: 'ABUSE_GUARD',
        service: nameFor('abuse-guard'),
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ]);
    assert.deepEqual(config.r2_buckets, [
      { binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: `${name}-cache` },
    ]);
    assert.match(
      config.vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
      /^[A-Za-z0-9_-]+$/u
    );
    assert.ok(
      isDeepStrictEqual(config.vars, {
        MEET_AI_DISABLED: 'true',
        MEET_AI_ENABLED_WORKSPACE_IDS: '',
        MEET_CLASS_ATTENDANCE_ENABLED: 'false',
        MEET_CLASS_TIMER_ENABLED: 'true',
        MEET_EDUCATION_ENABLED: 'true',
        NEXT_PUBLIC_APP_URL: `https://${name}.${subdomain}.workers.dev`,
        NEXT_PUBLIC_WEB_APP_URL: 'https://web.tutur3u.com',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY:
          config.vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        MEET_REALTIME_URL: `wss://${nameFor('meet-realtime')}.${subdomain}.workers.dev/realtime`,
        TRUSTED_PROXY: 'cloudflare',
        ABUSE_GUARD_FAMILIES: 'meet,proxy',
        TUTURUUU_NOINDEX: '1',
      }),
      'Unadmitted staging variables'
    );
  } else {
    assert.equal(config.assets, undefined);
    assert.equal(config.services, undefined);
    assert.equal(config.r2_buckets, undefined);
  }
  if (app === 'abuse-guard') {
    assert.ok(
      isDeepStrictEqual(config.vars, {
        ABUSE_GUARD_DAILY_OP_BUDGET: '1000',
        ABUSE_GUARD_FAMILY_BUDGETS: '',
        ABUSE_GUARD_LOCATION_HINT: 'apac',
      }),
      'Unadmitted staging variables'
    );
  }
  if (app === 'meet-realtime') {
    assert.ok(
      isDeepStrictEqual(config.vars, {
        MEET_AI_DISABLED: 'true',
        MEET_AI_ENABLED_WORKSPACE_IDS: '',
        MEET_CLASS_ATTENDANCE_ENABLED: 'false',
        MEET_CLASS_TIMER_ENABLED: 'true',
        MEET_WHITEBOARD_FLUSH_DISABLED: 'false',
      }),
      'Unadmitted staging variables'
    );
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(files))
    .digest('hex');
  return {
    root,
    configPath,
    name,
    accountId,
    digest,
    workersDev,
    secrets: target.secrets,
  };
}

export async function publishMeetFirst({
  env,
  app,
  sha,
  admitted,
  artifact,
  request,
  assertEnabled,
  assertAbsent,
  readCredentials,
  exec = runFirstUpload,
}) {
  const { name, accountId, digest, secrets } = artifact;
  const cfToken = env.CLOUDFLARE_STAGING_API_TOKEN;
  const account = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const script = `${account}/workers/scripts/${name}`;
  assert.equal(env[admitted.accountIdEnv], accountId);
  assert.ok(cfToken && !env.CLOUDFLARE_API_TOKEN);
  await assertEnabled();
  const ledger = await attemptLedger({
    request,
    base: account,
    token: cfToken,
    databaseId: env.WAVE1_STAGING_ATTEMPT_D1_ID,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    app,
    identity: {
      sha,
      digest,
      worker: name,
      accountId,
      accountIdEnv: admitted.accountIdEnv,
      admission: admitted,
    },
  });
  const claimTag =
    'meet-first-' +
    createHash('sha256')
      .update(
        JSON.stringify([
          env.GITHUB_REPOSITORY,
          accountId,
          name,
          sha,
          digest,
          ledger.prior?.runId ?? env.GITHUB_RUN_ID,
          ledger.prior?.runAttempt ?? env.GITHUB_RUN_ATTEMPT,
        ])
      )
      .digest('hex');
  const findVersion = async () => {
    const listing = await request(`${script}/versions?per_page=100`, cfToken);
    assert.equal(listing.success, true);
    const items = listing.result.items;
    assert.ok(
      Array.isArray(items) &&
        items.length < 100 &&
        (listing.result_info?.total_pages ?? 1) <= 1
    );
    const exact = [];
    for (const item of items) {
      assert.match(item.id ?? '', /^[a-f0-9-]{36}$/u);
      const observed = await request(`${script}/versions/${item.id}`, cfToken);
      assert.equal(observed.success, true);
      if (observed.result.annotations?.['workers/tag'] === claimTag)
        exact.push(item.id);
    }
    assert.equal(
      exact.length,
      1,
      'First publication has no unique matching version; upload will not be retried'
    );
    return exact[0];
  };
  const accept = async (expectedVersion) => {
    const active = await request(`${script}/deployments`, cfToken);
    assert.equal(active.success, true);
    const versions = active.result.deployments[0]?.versions;
    const versionId = versions?.[0]?.version_id;
    assert.equal(versionId, expectedVersion, 'Claim version is not active');
    assert.deepEqual(versions, [{ version_id: versionId, percentage: 100 }]);
    const version = await request(`${script}/versions/${versionId}`, cfToken);
    assert.equal(version.success, true);
    const bindings = version.result.resources.bindings;
    for (const [key, value] of [
      ['MEET_STAGING_SOURCE_SHA', sha],
      ['MEET_STAGING_ARTIFACT_SHA256', digest],
    ]) {
      const binding = bindings.find((item) => item.name === key);
      assert.ok(
        binding?.type === 'plain_text' && binding.text === value,
        'Wrong hosted artifact identity'
      );
    }
    const observed = await request(`${script}/secrets`, cfToken);
    assert.equal(observed.success, true);
    assert.deepEqual(
      observed.result.map((item) => item.name).sort(),
      [...secrets].sort()
    );
    const serving = await request(`${script}/subdomain`, cfToken);
    assert.equal(serving.success, true);
    assert.equal(serving.result.enabled, artifact.workersDev);
    assert.equal(serving.result.previews_enabled, false);
    return versionId;
  };

  if (ledger.prior) {
    assert.equal(
      ledger.prior.payload.rollback,
      null,
      'Prior attempt was an update'
    );
    if (ledger.prior.state === 'failed')
      assert.fail('First publication attempt was consumed');
    const current = await findVersion();
    if (ledger.prior.versionId) assert.equal(current, ledger.prior.versionId);
    if (ledger.prior.state === 'pending')
      await ledger.save('uploaded', current);
    await accept(current);
    if (ledger.prior.state !== 'activated')
      await ledger.save('activated', current);
    return current;
  }

  await assertAbsent(`${script}/settings`, cfToken);
  if (artifact.workersDev) {
    const subdomain = await request(`${account}/workers/subdomain`, cfToken);
    assert.equal(subdomain.success, true);
    assert.equal(subdomain.result.subdomain, env.CLOUDFLARE_WORKERS_SUBDOMAIN);
  }
  const values = readCredentials();
  assert.ok(values && !Array.isArray(values) && typeof values === 'object');
  assert.ok(
    Object.keys(values).length === secrets.length &&
      secrets.every((name) => Object.hasOwn(values, name)),
    'Unexpected staging secret inventory'
  );
  assert.ok(
    Object.values(values).every(
      (value) => typeof value === 'string' && value.trim()
    ),
    'Empty staging binding'
  );
  if (app === 'meet') {
    assert.ok(
      values.NEXT_PUBLIC_SUPABASE_URL ===
        'https://fxefojytwimjiqxseqag.supabase.co',
      'Wrong Supabase staging project'
    );
  }
  if (app !== 'abuse-guard') {
    assert.ok(
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(
        values.MEET_AI_DISABLED_WORKSPACE_IDS
      ) &&
        values.MEET_AI_DISABLED_WORKSPACE_IDS ===
          values.MEET_AI_PROTECTED_WORKSPACE_IDS,
      'Meet early-OFF workspace inputs must match'
    );
  }
  await ledger.start(null);
  assert.equal(
    inspectMeetFirstArtifact(
      artifact.root,
      app,
      env.CLOUDFLARE_WORKERS_SUBDOMAIN
    ).digest,
    digest
  );
  await assertEnabled();
  await assertAbsent(`${script}/settings`, cfToken);
  try {
    await withFirstUploadGate(
      {
        scriptPath: new URL(script).pathname,
        versionTag: claimTag,
        token: cfToken,
      },
      (apiBase) =>
        exec(
          '/bin/bash',
          [
            '-c',
            'set -o pipefail; /bin/cat | node "$@"',
            'meet-first-publication',
            resolve(
              dirname(require.resolve('wrangler/package.json')),
              'bin/wrangler.js'
            ),
            'deploy',
            '--config',
            artifact.configPath,
            '--secrets-file',
            '/dev/stdin',
            '--no-experimental-auto-create',
            '--strict',
            '--var',
            `MEET_STAGING_SOURCE_SHA:${sha}`,
            '--var',
            `MEET_STAGING_ARTIFACT_SHA256:${digest}`,
          ],
          {
            cwd: artifact.root,
            env: {
              PATH: env.PATH,
              HOME: env.HOME,
              CLOUDFLARE_API_TOKEN: cfToken,
              CLOUDFLARE_API_BASE_URL: apiBase,
              CLOUDFLARE_ACCOUNT_ID: accountId,
              WRANGLER_SEND_METRICS: 'false',
              WRANGLER_WRITE_LOGS: 'false',
              CI: 'true',
            },
            input: JSON.stringify(values),
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 180_000,
            maxBuffer: 1024 * 1024,
          }
        )
    );
  } catch {
    throw new Error(
      'First publication outcome unresolved; inspect the admitted version before any retry'
    );
  }
  const versionId = await findVersion();
  await ledger.save('uploaded', versionId);
  await accept(versionId);
  await ledger.save('activated', versionId);
  return versionId;
}

export async function meetFirstPublication({
  mode,
  app,
  environment,
  sha,
  env,
  fetcher,
  exec,
  readCredentials,
  publicationAdmission,
  boundedJson,
}) {
  if (mode === 'meet-first-seal') {
    assert.equal(environment, 'staging');
    assert.match(sha ?? '', /^[a-f0-9]{40}$/u);
    const artifact = inspectMeetFirstArtifact(
      env.WAVE1_MEET_FIRST_ARTIFACT_DIR,
      app,
      env.CLOUDFLARE_WORKERS_SUBDOMAIN
    );
    console.log(
      JSON.stringify({
        sha,
        app,
        worker: artifact.name,
        digest: artifact.digest,
      })
    );
    return;
  }
  if (mode === 'meet-first-publish') {
    assert.equal(environment, 'staging');
    assert.equal(
      env.GITHUB_SHA,
      sha,
      'First publication requires the current main workflow SHA'
    );
    assert.equal(env.GITHUB_REPOSITORY, 'tutur3u/platform');
    const admission = publicationAdmission({
      environment,
      ref: env.GITHUB_REF,
      event: env.GITHUB_EVENT_NAME,
      stagingEnabled: env.WAVE1_STAGING_PUBLISH_ENABLED,
      admissionRecord: env.WAVE1_STAGING_PUBLICATION_ADMISSION,
      app,
      sha,
    });
    assert.ok(admission.allowed, admission.reason);
    const artifact = inspectMeetFirstArtifact(
      env.WAVE1_MEET_FIRST_ARTIFACT_DIR,
      app,
      env.CLOUDFLARE_WORKERS_SUBDOMAIN
    );
    const admitted = stagingAdmission(
      env.WAVE1_STAGING_PUBLICATION_ADMISSION,
      app,
      sha,
      artifact.digest
    );
    assert.ok(
      env.WAVE1_CONTROL_READ_TOKEN,
      'Missing publication control credential'
    );
    await preflight({ env, mode: 'native', app: 'meet', fetcher });
    const request = (url, token, body) =>
      boundedJson(url, token, fetcher, body);
    const assertEnabled = async () => {
      const url =
        'https://api.github.com/repos/tutur3u/platform/actions/variables';
      const token = env.WAVE1_CONTROL_READ_TOKEN;
      assert.equal(
        (await request(`${url}/WAVE1_STAGING_PUBLISH_ENABLED`, token)).value,
        'true'
      );
      const fresh = await request(
        `${url}/WAVE1_STAGING_PUBLICATION_ADMISSION`,
        token
      );
      assert.deepEqual(
        stagingAdmission(fresh.value, app, sha, artifact.digest),
        admitted
      );
    };
    const versionId = await publishMeetFirst({
      env,
      app,
      sha,
      admitted,
      artifact,
      request,
      assertEnabled,
      readCredentials,
      exec,
      assertAbsent: async (url, token) => {
        assert.equal(
          await boundedJson(url, token, fetcher, undefined, undefined, true),
          null,
          'First publication requires an absent staging Worker'
        );
      },
    });
    console.log(
      JSON.stringify({
        sha,
        app,
        worker: artifact.name,
        digest: artifact.digest,
        versionId,
      })
    );
    return;
  }
}
