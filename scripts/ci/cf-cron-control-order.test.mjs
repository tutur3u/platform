import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { assertCronSet } from '../../apps/cron-control/scripts/assert-cron-set.mjs';

const LIVE_ORDER = [
  '* * * * *',
  '0 */12 * * *',
  '0 */6 * * *',
  '0 6 * * *',
  '*/10 * * * *',
  '*/15 * * * *',
  '17 3 * * *',
  '*/30 * * * *',
  '*/5 * * * *',
];
const app = new URL('../../apps/cron-control/', import.meta.url);
const cfPackage = pathToFileURL(
  realpathSync(new URL('node_modules/cf/package.json', app))
);
const { InputConfigSchema, convertToWranglerConfig } = await import(
  new URL('../@cloudflare/config/dist/index.mjs', cfPackage).href
);
const { default: config } = await import(new URL('cloudflare.config.ts', app));
const resolved =
  typeof config === 'function'
    ? await config({ mode: 'production', isPreview: false })
    : config;
const validated = InputConfigSchema.parse(resolved);
const emitted = convertToWranglerConfig(validated);
const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url),
    'utf8'
  )
);

// Expose the installed private helper in memory; its implementation and imports
// remain unchanged, and no installed file or network resource is modified.
async function installedCfDiff() {
  const url = new URL('dist/containers-CcZHRM9g.mjs', cfPackage);
  url.searchParams.set('cron-diff-test', randomUUID());
  const hook = registerHooks({
    load(specifier, context, nextLoad) {
      const loaded = nextLoad(specifier, context);
      return specifier === url.href
        ? {
            ...loaded,
            source: `${loaded.source}\nexport { bE as getRemoteConfigDiff };\n`,
          }
        : loaded;
    },
  });
  try {
    return (await import(url.href)).getRemoteConfigDiff;
  } finally {
    hook.deregister();
  }
}

test('Cron Control passes cf schema and preserves the exact live cron set and count', () => {
  assertCronSet(
    resolved.worker.triggers.map(({ schedule }) => schedule),
    LIVE_ORDER
  );
  assertCronSet(emitted.triggers.crons, LIVE_ORDER);
  assertCronSet(emitted.triggers.crons, baseline.identity.crons);
  assert.equal(validated.worker.env.CRON_LEDGER.worker, validated.worker.name);
  assert.deepEqual(emitted.durable_objects.bindings, [
    { name: 'CRON_LEDGER', class_name: 'CronLedger' },
  ]);
});

test('same-Worker omission preserves cross-Worker Durable Object targets', () => {
  const foreign = structuredClone(validated);
  foreign.worker.env.CRON_LEDGER.worker = 'another-worker';
  const converted = convertToWranglerConfig(InputConfigSchema.parse(foreign));
  assert.equal(
    converted.durable_objects.bindings[0].script_name,
    'another-worker'
  );
});

test('installed cf bE reports EMPTY drift against the recorded dbe3ed29 live fields', async () => {
  assert.equal(
    baseline.dashboardAdmission.versionId,
    'dbe3ed29-0d78-47fe-908e-0095c689f68d'
  );
  const { i: resolveBuildOutputWorkerConfig } = await import(
    new URL('dist/build-BJHRK6qE.mjs', cfPackage).href
  );
  const { entrypoint: _entrypoint, ...builtWorker } = validated.worker;
  const { wranglerConfig: local } = resolveBuildOutputWorkerConfig(
    {
      config: builtWorker,
      configPath: new URL('worker.config.json', app).pathname,
    },
    {
      accountId: validated.accountId,
      buildContext: { mode: 'production', isPreview: false },
    }
  );
  const remote = {
    ...structuredClone(local),
    compatibility_date: baseline.identity.compatibilityDate,
    compatibility_flags: baseline.identity.compatibilityFlags,
    vars: baseline.identity.vars,
    triggers: { crons: LIVE_ORDER },
    durable_objects: {
      bindings: [{ name: 'CRON_LEDGER', class_name: 'CronLedger' }],
    },
    observability: {
      enabled: true,
      head_sampling_rate: 0.05,
      logs: { enabled: true, head_sampling_rate: 0.05, invocation_logs: true },
      traces: { enabled: false, head_sampling_rate: 0.05, persist: true },
    },
  };
  const diff = await installedCfDiff();
  const admitted = diff(remote, local);
  assert.equal(admitted.diff, null, admitted.diff?.toString());
  assert.equal(admitted.nonDestructive, true);
  const unpatched = structuredClone(local);
  unpatched.durable_objects.bindings[0].script_name = validated.worker.name;
  assert.equal(diff(remote, unpatched).nonDestructive, false);
  const foreign = structuredClone(local);
  foreign.durable_objects.bindings[0].script_name = 'another-worker';
  assert.equal(diff(remote, foreign).nonDestructive, false);
});
