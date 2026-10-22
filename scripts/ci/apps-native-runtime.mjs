import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import {
  admitAppsPolicies,
  appsPolicyReceipt,
  controlAppsPolicies,
} from '../../apps/apps/cloudflare/native-runtime-fence.mjs';
import {
  APPS_SUPPLIER,
  appsRoles,
  assertAppsCopies,
  assertAppsOriginal,
} from './apps-native-runtime-plan.mjs';
import {
  diagnosticError,
  supplierReceipt,
  supplierSummaryLine,
} from './native-wrangler-evidence.mjs';
import {
  assertAmbientEnvironment,
  assertChildTempIsolation,
  assertTempContents,
  memoizePublicDispose,
} from './native-wrangler-runtime.mjs';

export { APPS_SUPPLIER };
export function admitAppsSupplier(summary) {
  assert.deepEqual(
    summary,
    APPS_SUPPLIER,
    'Unreviewed owning Apps supplier bytes/version'
  );
}
export async function assertAppsOwnerSupplier(plan) {
  const manifest = JSON.parse(await readFile(plan.ownerPackage));
  assert.equal(
    manifest.devDependencies?.wrangler,
    '4.151.2',
    'Owning manifest supplier pin'
  );
  const lock = await readFile(plan.lockPath, 'utf8');
  for (const edge of lock.matchAll(
    /"@tuturuuu\/apps\/wrangler":\s*\["wrangler@([^"]+)"/g
  )) {
    assert.equal(edge[1], '4.151.2', 'Stale Apps owning lock edge');
  }
}
export async function loadAppsSupplier(
  ownerPackage,
  io = { receipt: supplierReceipt, require: createRequire }
) {
  const before = await io.receipt(ownerPackage);
  admitAppsSupplier(before.summary);
  const require = io.require(ownerPackage);
  for (const path of [before.cliPath, before.miniflarePath])
    assert.ok(!require.cache[path], 'Preloaded Apps supplier forbidden');
  const sdk = require(before.cliPath);
  const after = await io.receipt(ownerPackage);
  admitAppsSupplier(after.summary);
  assert.deepEqual(after, before, 'Owning Apps supplier changed during load');
  assert.equal(typeof sdk.unstable_startWorker, 'function');
  (io.log ?? console.log)(supplierSummaryLine(after.summary));
  return { startWorker: sdk.unstable_startWorker, receipt: after };
}

export function appsFixtureBindings(mode, values, role) {
  assert.ok(appsRoles(mode).includes(role), 'Closed fixture role');
  const keys =
    mode === 'http'
      ? [
          'INTERNAL_WEB_API_ORIGIN',
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'SUPABASE_SECRET_KEY',
          'TUTURUUU_APP_COORDINATION_SECRET',
        ]
      : [
          'TUTURUUU_NOINDEX',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_SECRET_KEY',
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        ];
  assert.deepEqual(
    Object.keys(values).sort(),
    keys.sort(),
    'Closed fixture bindings; runtime SHA injection forbidden'
  );
  for (const value of Object.values(values))
    assert.equal(typeof value, 'string');
  assert.match(values.TUTURUUU_APP_COORDINATION_SECRET, /^[a-f0-9]{64}$/);
  if (mode === 'http') {
    const url = new URL(values.INTERNAL_WEB_API_ORIGIN);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(url.port);
    assert.equal(url.href, `${url.origin}/`);
    assert.equal(values.NEXT_PUBLIC_SUPABASE_URL, url.origin);
    assert.equal(
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'fixture-public-key'
    );
    assert.ok(
      /^[a-f0-9]{64}$/.test(values.SUPABASE_SECRET_KEY),
      'Generated fixture service key required'
    );
  } else {
    assert.equal(values.TUTURUUU_NOINDEX, '1');
    assert.equal(
      values.NEXT_PUBLIC_SUPABASE_URL,
      'https://apps-ci.supabase.invalid'
    );
    assert.equal(
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'sb_publishable_apps_ci_placeholder'
    );
    assert.equal(values.SUPABASE_SECRET_KEY, 'disposable-unused-fixture');
  }
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        type: [
          'TUTURUUU_APP_COORDINATION_SECRET',
          'SUPABASE_SECRET_KEY',
        ].includes(name)
          ? 'secret_text'
          : 'plain_text',
        value:
          role === 'negative' && name === 'INTERNAL_WEB_API_ORIGIN'
            ? 'https://apps-unadmitted.invalid'
            : value,
      },
    ])
  );
}

async function waitForPublic(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let aborted;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) aborted();
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', aborted);
  }
}

// The owner is available before acquisition. A returned handle is registered
// before either public readiness promise is awaited, even for later-role failure.
export function createAppsOwner(startWorker, inputs, mode) {
  const roles = appsRoles(mode),
    acquired = [],
    phases = [],
    errors = [],
    handles = {};
  let started = false,
    completion;
  return {
    async start(signal) {
      assert.equal(started, false, 'Apps sessions already started');
      started = true;
      for (const role of roles) {
        let worker;
        try {
          worker = await startWorker(inputs[role]);
          acquired.push({ role, dispose: memoizePublicDispose(worker) });
          handles[role] = worker;
          phases.push({ role, phase: 'acquired', ok: true });
        } catch (error) {
          errors.push(error);
          phases.push({ role, phase: 'acquire', ok: false, error });
          throw error;
        }
        try {
          await waitForPublic(worker.ready, signal);
          const url = await waitForPublic(worker.url, signal);
          assert.equal(url.hostname, '127.0.0.1');
          assert.equal(url.protocol, 'http:');
          assert.ok(url.port);
          phases.push({ role, phase: 'ready', ok: true });
        } catch (error) {
          errors.push(error);
          phases.push({ role, phase: 'ready', ok: false, error });
          throw error;
        }
      }
      return Object.freeze(
        Object.fromEntries(
          roles.map((role) => [
            role,
            Object.freeze({
              fetch: (...args) => handles[role].fetch(...args),
              url: handles[role].url,
            }),
          ])
        )
      );
    },
    finish(primary) {
      completion ??= (async () => {
        const failures = [...errors];
        if (primary && !failures.includes(primary)) failures.unshift(primary);
        for (const { role, dispose } of [...acquired].reverse()) {
          try {
            await dispose();
            phases.push({ role, phase: 'dispose', ok: true });
          } catch (error) {
            failures.push(error);
            phases.push({ role, phase: 'dispose', ok: false, error });
          }
        }
        const identities = [...new Set(failures)];
        return {
          errors: failures,
          receipt: {
            roles: acquired.map((item) => item.role),
            phases: phases.map(({ error, ...phase }) => ({
              ...phase,
              error: diagnosticError(error),
              errorIdentity: error ? identities.indexOf(error) : null,
            })),
            primaryIdentity: primary ? identities.indexOf(primary) : null,
            errors: failures.map(diagnosticError),
            internalCleanup: 'UNKNOWN',
            descendantClosure: 'UNKNOWN',
          },
        };
      })();
      return completion;
    },
  };
}

export async function startAppsSessions(plan, prepared, policies, bindings) {
  const roles = admitAppsPolicies(
    prepared.mode,
    policies,
    bindings.INTERNAL_WEB_API_ORIGIN
  );
  assertAmbientEnvironment();
  const tempRoot = await assertChildTempIsolation();
  assert.equal(tempRoot, prepared.tempRoot);
  assert.equal(tmpdir(), tempRoot);
  await assertTempContents(tempRoot, [basename(prepared.scratch)]);
  await assertAppsOriginal(plan);
  await assertAppsCopies(plan, prepared, true);
  const inputs = Object.fromEntries(
    roles.map((role) => [
      role,
      {
        config: prepared.roles[role].config,
        envFiles: [prepared.envFile],
        sendMetrics: false,
        bindings: appsFixtureBindings(prepared.mode, bindings, role),
        build: { bundle: false, processEntrypoint: false },
        dev: {
          remote: false,
          watch: false,
          persist: false,
          inspector: false,
          liveReload: false,
          generateTypes: false,
          enableContainers: false,
          registry: prepared.roles[role].registry,
          server: { hostname: '127.0.0.1', port: 0 },
          inferOriginFromRoutes: false,
          routeRequestsByRoutes: false,
          auth: () => {
            throw new Error('Provider auth forbidden in Apps fixture');
          },
          outboundService: policies[role].outboundService,
        },
      },
    ])
  );
  await assertAppsOwnerSupplier(plan);
  const supplier = await loadAppsSupplier(plan.ownerPackage);
  await assertAppsOriginal(plan);
  await assertAppsCopies(plan, prepared, true);
  admitAppsPolicies(prepared.mode, policies, bindings.INTERNAL_WEB_API_ORIGIN);
  const owner = createAppsOwner(supplier.startWorker, inputs, prepared.mode);
  return { ...owner, supplier: supplier.receipt };
}

export const APPS_ASSERTION_GROUPS = Object.freeze({
  http: Object.freeze([
    'negative',
    'build',
    'localeSSR',
    'redirects',
    'rpc',
    'methods',
    'patch',
    'egress',
    'listenerOrigin',
  ]),
  browser: Object.freeze([
    'canonical',
    'catalogue',
    'build',
    'anchors',
    'egress',
    'listenerOrigin',
  ]),
});
export async function exerciseAppsSessions(
  plan,
  prepared,
  policies,
  bindings,
  run,
  receiptFile,
  signal
) {
  const completed = [],
    failures = [];
  let sessions, lifecycle, primary, controls;
  try {
    controls = await controlAppsPolicies(prepared.mode, policies);
    sessions = await startAppsSessions(plan, prepared, policies, bindings);
    const adapters = await sessions.start(signal);
    await run(adapters, (name) => {
      assert.ok(APPS_ASSERTION_GROUPS[prepared.mode].includes(name));
      assert.ok(!completed.includes(name));
      completed.push(name);
    });
    assert.deepEqual(completed, APPS_ASSERTION_GROUPS[prepared.mode]);
  } catch (error) {
    primary = error;
    failures.push(error);
  }
  if (sessions) {
    const finished = await sessions.finish(primary);
    lifecycle = finished.receipt;
    for (const error of finished.errors)
      if (!failures.includes(error)) failures.push(error);
  }
  for (const check of [
    () => assertAppsOriginal(plan),
    () => assertAppsCopies(plan, prepared),
    async () => {
      if (sessions)
        assert.deepEqual(
          await supplierReceipt(plan.ownerPackage),
          sessions.supplier,
          'Supplier changed across sessions'
        );
    },
  ]) {
    try {
      await check();
    } catch (error) {
      failures.push(error);
    }
  }
  const policyReceipt = appsPolicyReceipt(
    prepared.mode,
    policies,
    controls ?? {}
  );
  try {
    for (const role of appsRoles(prepared.mode))
      assert.deepEqual(
        policyReceipt[role].unexpected,
        role === 'negative'
          ? [
              {
                method: 'GET',
                url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
              },
            ]
          : []
      );
  } catch (error) {
    failures.push(error);
  }
  const receipt = {
    schema: 1,
    mode: prepared.mode,
    sourceSHA: plan.sourceSHA,
    supplier: sessions?.supplier ?? null,
    completed,
    lifecycle: lifecycle ?? null,
    policies: policyReceipt,
    errors: failures.map(diagnosticError),
    internalCleanup: 'UNKNOWN',
    descendantClosure: 'UNKNOWN',
  };
  try {
    const bytes = JSON.stringify(receipt);
    await writeFile(receiptFile, bytes, { flag: 'wx', mode: 0o600 });
    assert.equal(
      await readFile(receiptFile, 'utf8'),
      bytes,
      'Child receipt readback'
    );
  } catch (error) {
    failures.push(error);
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      'Apps acceptance failed; evidence retained'
    );
}
