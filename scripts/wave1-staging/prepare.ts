import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hostedStagingProfile,
  productionSupabaseProjectRefs,
  type StagingApp,
  stagingApps,
  stagingBuildInputs,
  stagingHost,
} from './profiles.ts';

type Env = Record<string, string | undefined>;
export function provisioningPlan(app: StagingApp, env: Env) {
  const profile = hostedStagingProfile(app, stagingBuildInputs(env, app));
  const bucket =
    app === 'meet'
      ? 'tuturuuu-meet-hosted-staging-cache'
      : app === 'mail'
        ? 'tuturuuu-mail-hosted-staging'
        : undefined;
  return {
    schema: 1,
    app,
    host: `${app}.staging.tutur3u.com`,
    cookieDomain: '.staging.tutur3u.com',
    worker: profile.cloudflare.name,
    execute: false,
    createsDns: false,
    tasks: [
      {
        operation: 'verify-account-and-scoped-token',
        cli: ['cf', 'auth', 'whoami', '--json'],
        billable: false,
      },
      {
        operation:
          'BLOCKING-owner-approved-zone-certificate-exception-or-rename-hosts',
        zone: 'tutur3u.com',
        hosts: stagingApps.map(stagingHost),
        certificate:
          'Advanced Certificate Manager / exact-host Advanced certificate pack',
        ownerApprovalRequired: true,
        approvalScope:
          'billable zone-level exception before DNS and route attachment',
        billable: true,
      },
      {
        operation:
          'read-existing-Workers-buckets-and-routes-refuse-if-present-unless-explicitly-adopted',
        workers: [
          profile.cloudflare.name,
          ...(app === 'meet' ? ['tuturuuu-meet-realtime-hosted-staging'] : []),
        ],
        buckets: bucket ? [bucket] : [],
        preserveSignedLedger: true,
        billable: false,
      },
      ...(app === 'calendar'
        ? [
            {
              operation:
                'calendar-never-reseed-existing-publisher-verify-seed-receipt-or-STOP',
              neverReseedExistingPublisher: true,
              billable: true,
            },
          ]
        : []),
      ...(bucket
        ? [
            {
              operation:
                'create-isolated-bucket-if-provider-read-confirms-absent',
              bucket,
              cli: ['cf', 'r2', 'buckets', 'create', '--name', bucket],
              billable: true,
            },
          ]
        : []),
      {
        operation: 'verify-staging-supabase-project-and-secret-scope',
        projectRef: env.WAVE1_STAGING_SUPABASE_PROJECT_REF,
        billable: true,
      },
      {
        operation: 'build-and-seal-on-admitted-CI-or-Studio',
        profile: `apps/${app}/void.hosted-staging.config.ts`,
        billable: true,
      },
      {
        operation:
          'bootstrap-route-free-exact-artifact-with-protected-staging-credentials',
        billable: true,
      },
      ...(app === 'meet'
        ? [
            {
              operation:
                'bootstrap-isolated-realtime-DO-worker-with-retained-migration-tags',
              profile: 'apps/meet-realtime/hosted-staging.cf.json',
              billable: true,
            },
          ]
        : []),
      {
        operation:
          'read-back-active-certificate-coverage-for-all-four-hosts-before-DNS',
        hosts: stagingApps.map(stagingHost),
        billable: false,
      },
      {
        operation:
          'verify-exact-existing-DNS-and-zone-before-separate-staging-route-attachment',
        zone: 'tutur3u.com',
        createsDns: false,
        onMatchingRoute: 'no-op-and-record-existing-route-ID',
        onConflictingRoute: 'STOP',
        billable: true,
      },
      {
        operation: 'read-back-host-routes-HSTS-cookie-and-build-identity',
        billable: true,
      },
      {
        operation:
          'read-back-active-certificate-coverage-for-all-four-hosts-before-acceptance',
        hosts: stagingApps.map(stagingHost),
        billable: false,
      },
      {
        operation: 'run-explicitly-authorized-signed-in-acceptance',
        billable: true,
      },
    ],
    stop: 'Disable publication admission; remove only captured staging routes, then verify no serving/producers. Retain ledger and uncertain writes. Never replay an unknown upload.',
    cutoverOwner: 'cutover lead only',
  };
}

type StagingTarget = StagingApp | 'meet-realtime';

export function routeFreeConfig(
  config: unknown,
  app: StagingTarget,
  inputs: ReturnType<typeof stagingBuildInputs>
): Record<string, unknown> & { routes: [] } {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('Expected emitted staging config');
  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(config)
  );
  assert.ok(
    /^[a-z0-9]{20}$/u.test(inputs.ref) &&
      inputs.ref !== inputs.productionRef &&
      !productionSupabaseProjectRefs.includes(inputs.ref),
    'Require independently verified non-production staging project'
  );
  if (app === 'meet-realtime') {
    const reviewed = JSON.parse(
      readFileSync(
        new URL(
          '../../apps/meet-realtime/hosted-staging.cf.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    assert.deepEqual(
      data,
      reviewed,
      'Unreviewed realtime staging configuration'
    );
    return { ...data, routes: [] };
  }
  if (data.name !== `tuturuuu-${app}-hosted-staging` || data.no_bundle !== true)
    throw new Error('Require exact emitted prebundled staging identity');
  const expectedRoutes = [
    { pattern: `${app}.staging.tutur3u.com/*`, zone_name: 'tutur3u.com' },
  ];
  if (JSON.stringify(data.routes) !== JSON.stringify(expectedRoutes))
    throw new Error('Unexpected staging topology');
  if (data.workers_dev !== false || data.preview_urls !== false)
    throw new Error('Public preview ingress refused');
  assert.ok(
    typeof data.main === 'string' && /\.m?js$/u.test(data.main),
    'Require emitted JavaScript entry'
  );
  assert.ok(
    data.vars &&
      typeof data.vars === 'object' &&
      'WAVE1_STAGING_SUPABASE_PROJECT_REF' in data.vars
  );
  const ref = data.vars.WAVE1_STAGING_SUPABASE_PROJECT_REF;
  assert.equal(
    ref,
    inputs.ref,
    'Emitted ref must match independently reviewed staging ref'
  );
  assert.notEqual(
    ref,
    inputs.productionRef,
    'Production Supabase project refused'
  );
  const expected = hostedStagingProfile(app, inputs).cloudflare;
  assert.deepEqual(data.vars, expected.vars, 'Unreviewed staging environment');
  for (const key of [
    'services',
    'r2_buckets',
    'durable_objects',
    'migrations',
    'secrets',
  ]) {
    assert.deepEqual(
      data[key],
      Reflect.get(expected, key),
      'Unreviewed staging resource or secret'
    );
  }
  for (const key of [
    'd1_databases',
    'kv_namespaces',
    'queues',
    'triggers',
    'workflows',
    'ai',
    'images',
    'hyperdrive',
    'dispatch_namespaces',
    'env',
  ]) {
    assert.ok(
      data[key] === undefined,
      'Unreviewed staging binding or producer'
    );
  }
  const allowedKeys = new Set([
    '$schema',
    'name',
    'account_id',
    'main',
    'no_bundle',
    'compatibility_date',
    'compatibility_flags',
    'rules',
    'assets',
    'workers_dev',
    'preview_urls',
    'routes',
    'secrets',
    'vars',
    'observability',
    'services',
    'r2_buckets',
    'durable_objects',
    'migrations',
    'placement',
  ]);
  assert.ok(
    Object.keys(data).every((key) => allowedKeys.has(key)),
    'Unreviewed emitted staging configuration field'
  );
  return { ...data, routes: [] };
}

// This command only writes a plan. Release Desk executes reviewed operations
// individually, recording provider receipts before moving to the next step.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [appArg, output, emitted] = process.argv.slice(2);
  const app =
    appArg === 'meet-realtime'
      ? 'meet'
      : stagingApps.find((candidate) => candidate === appArg);
  if (!app || !output)
    throw new Error(
      'Usage: prepare.ts <meet|calendar|mail|apps|meet-realtime> <private-output-dir> [emitted-config]'
    );
  const plan = provisioningPlan(app, process.env);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(output, 'provisioning-plan.json'),
    `${JSON.stringify(plan, null, 2)}\n`,
    { mode: 0o600, flag: 'wx' }
  );
  if (emitted) {
    // Frontend emitted configs stay beside their modules/assets. Realtime source
    // configs move to private custody with their source paths resolved below.
    const original = resolve(emitted);
    const candidate = routeFreeConfig(
      JSON.parse(readFileSync(original, 'utf8')),
      appArg === 'meet-realtime' ? 'meet-realtime' : app,
      stagingBuildInputs(process.env, app)
    );
    if (appArg === 'meet-realtime') {
      assert.ok(typeof candidate.main === 'string');
      candidate.main = resolve(dirname(original), candidate.main);
      assert.ok(candidate.alias && typeof candidate.alias === 'object');
      candidate.alias = Object.fromEntries(
        Object.entries(candidate.alias).map(([name, path]) => {
          assert.ok(typeof path === 'string');
          return [name, resolve(dirname(original), path)];
        })
      );
    }
    writeFileSync(
      appArg === 'meet-realtime'
        ? resolve(output, `${basename(original)}.route-free.json`)
        : `${original}.route-free.json`,
      `${JSON.stringify(candidate, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' }
    );
  }
  console.log(`Prepared ${app} staging plan; no provider command executed.`);
}
