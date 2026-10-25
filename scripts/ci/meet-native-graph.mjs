import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename } from 'node:path';
import {
  assertMeetCopy,
  readMeetRegistry,
} from './meet-native-graph-files.mjs';
import { admitMeetPolicies } from './meet-native-policy.mjs';
import {
  assertMeetOriginal,
  fixtureBindings,
  SUPPLIER,
} from './meet-native-profile.mjs';
import { projectMeetRegistry } from './meet-native-registry-facts.mjs';
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

export function admitSupplier(summary) {
  assert.deepEqual(
    summary,
    SUPPLIER,
    'Unreviewed public SDK supplier bytes/version'
  );
}
export async function loadMeetSupplier(
  ownerPackage,
  io = {
    receipt: supplierReceipt,
    require: createRequire,
  }
) {
  const before = await io.receipt(ownerPackage);
  admitSupplier(before.summary);
  const require = io.require(ownerPackage);
  for (const path of [before.cliPath, before.miniflarePath])
    assert.ok(!require.cache[path], 'Preloaded public SDK unsupported');
  const sdk = require(before.cliPath);
  const after = await io.receipt(ownerPackage);
  admitSupplier(after.summary);
  assert.deepEqual(after, before, 'SDK supplier changed during load');
  assert.equal(typeof sdk.unstable_startWorker, 'function');
  console.log(supplierSummaryLine(after.summary));
  return { startWorker: sdk.unstable_startWorker, receipt: after };
}

export function createMeetOwner(
  startWorker,
  inputs,
  beforeProbe = async () => {}
) {
  const acquired = [],
    phases = [],
    errors = [];
  let started = false,
    finishing;
  const handles = {};
  return {
    async start() {
      assert.equal(started, false, 'Graph already started');
      started = true;
      for (const role of ['app', 'probe']) {
        let worker;
        try {
          worker = await startWorker(inputs[role]);
          const owned = { role, cleanup: memoizePublicDispose(worker) };
          acquired.push(owned);
          handles[role] = worker;
          phases.push({ role, phase: 'acquired', ok: true });
        } catch (error) {
          phases.push({ role, phase: 'acquire', ok: false, error });
          errors.push(error);
          throw error;
        }
        try {
          await worker.ready;
          const url = await worker.url;
          assert.equal(url.hostname, '127.0.0.1');
          if (role === 'app')
            await beforeProbe((...args) => worker.fetch(...args));
          phases.push({ role, phase: 'ready', ok: true });
        } catch (error) {
          phases.push({ role, phase: 'ready', ok: false, error });
          errors.push(error);
          throw error;
        }
      }
      return Object.freeze({
        fetchApp: (...args) => handles.app.fetch(...args),
        fetchProbe: (...args) => handles.probe.fetch(...args),
      });
    },
    finish(...primary) {
      finishing ??= (async () => {
        const failures = [...errors];
        if (primary.length && !failures.includes(primary[0]))
          failures.unshift(primary[0]);
        for (const owned of [...acquired].reverse()) {
          try {
            await owned.cleanup();
            phases.push({ role: owned.role, phase: 'dispose', ok: true });
          } catch (error) {
            phases.push({
              role: owned.role,
              phase: 'dispose',
              ok: false,
              error,
            });
            failures.push(error);
          }
        }
        return {
          errors: failures,
          receipt: {
            schema: 1,
            roles: acquired.map(({ role }) => role),
            phases: phases.map(({ error, ...phase }) => ({
              ...phase,
              error: diagnosticError(error),
            })),
            errors: failures.map(diagnosticError),
            internalCleanup: 'UNKNOWN',
            descendantClosure: 'UNKNOWN',
          },
        };
      })();
      return finishing;
    },
  };
}

function egressCounts(policies) {
  return ['app', 'probe'].map((role) =>
    ['forwarded', 'unexpected', 'controls'].map(
      (key) => policies[role][key].length
    )
  );
}

async function assertAppHealthy(fetchApp) {
  const app = await fetchApp(
    'https://meet.tuturuuu.com/.well-known/meeting-runtime',
    {
      method: 'GET',
      redirect: 'manual',
    }
  );
  const appBody = await app.text();
  assert.equal(app.status, 200, 'Meet startup health status');
  let health;
  try {
    health = JSON.parse(appBody);
  } catch {
    throw new Error('Meet startup health body');
  }
  assert.ok(
    health &&
      typeof health === 'object' &&
      !Array.isArray(health) &&
      Object.keys(health).length === 1 &&
      health.version === 1,
    'Meet startup health body'
  );
}

export function createMeetStartup(
  owner,
  policies,
  readRegistry,
  projectRegistry
) {
  let failed = false,
    startupError,
    finishing;
  return {
    async start() {
      try {
        const adapters = await owner.start();
        const before = egressCounts(policies);
        await assertAppHealthy(adapters.fetchApp);
        const probe = await adapters.fetchProbe(
          'https://meet-ci-probe.invalid/startup-denial',
          { method: 'POST', redirect: 'manual' }
        );
        const probeBody = await probe.text();
        assert.equal(probe.status, 403, 'Meet startup probe status');
        assert.ok(probeBody === 'Forbidden', 'Meet startup probe body');
        assert.deepEqual(
          egressCounts(policies),
          before,
          'Meet startup changed HTTP egress counters'
        );
        await readRegistry();
        return adapters;
      } catch (error) {
        failed = true;
        startupError = error;
        throw error;
      }
    },
    finish(...primary) {
      finishing ??= (async () => {
        let facts,
          projectionError,
          projectionFailed = false;
        if (failed || primary.length) {
          try {
            facts = await projectRegistry();
          } catch (error) {
            projectionFailed = true;
            projectionError = error;
            facts = { schema: 1, status: 'unavailable' };
          }
        }
        const result = await owner.finish(
          ...(primary.length ? primary : failed ? [startupError] : [])
        );
        for (const error of [
          ...(failed && !result.errors.includes(startupError)
            ? [startupError]
            : []),
          ...(projectionFailed ? [projectionError] : []),
        ]) {
          result.errors.push(error);
          result.receipt.errors.push(diagnosticError(error));
        }
        if (facts) result.receipt.preDisposalRegistry = facts;
        return result;
      })();
      return finishing;
    },
  };
}

export async function createMeetGraph(
  plan,
  prepared,
  { policies, secret, probeToken }
) {
  admitMeetPolicies(policies);
  assert.match(probeToken, /^[a-f0-9-]{72}$/);
  assertAmbientEnvironment();
  const tempRoot = await assertChildTempIsolation();
  assert.equal(tempRoot, prepared.tempRoot);
  assert.equal(tmpdir(), tempRoot);
  await assertTempContents(tempRoot, [basename(prepared.scratch)]);
  await assertMeetOriginal(plan);
  await assertMeetCopy(plan, prepared, true);
  assert.deepEqual(
    await import('node:fs/promises').then(({ readdir }) =>
      readdir(prepared.registry)
    ),
    [],
    'Registry must be fresh'
  );
  const { startWorker, receipt } = await loadMeetSupplier(plan.ownerPackage);
  // No SDK operation occurs between this final admission and the first start.
  await assertMeetOriginal(plan);
  await assertMeetCopy(plan, prepared, true);
  admitMeetPolicies(policies);
  const inputs = Object.fromEntries(
    ['app', 'probe'].map((role) => [
      role,
      {
        config: prepared.roles[role].config,
        envFiles: [prepared.envFile],
        sendMetrics: false,
        bindings:
          role === 'app'
            ? fixtureBindings(secret)
            : { PROBE_TOKEN: { type: 'secret_text', value: probeToken } },
        build: { bundle: false, processEntrypoint: false },
        dev: {
          remote: false,
          watch: false,
          persist: false,
          inspector: false,
          liveReload: false,
          generateTypes: false,
          enableContainers: false,
          registry: prepared.registry,
          server: { hostname: '127.0.0.1', port: 0 },
          origin: {
            // A fixed app hostname rewrites every public Worker.fetch URL,
            // preventing the same graph from exercising both document origins.
            ...(role === 'probe' ? { hostname: 'meet-ci-probe.invalid' } : {}),
            secure: true,
          },
          inferOriginFromRoutes: false,
          routeRequestsByRoutes: false,
          auth: () => {
            throw new Error('Provider auth forbidden in Meet fixture');
          },
          outboundService: policies[role].handler,
        },
      },
    ])
  );
  const owner = createMeetOwner(startWorker, inputs, async (fetchApp) => {
    const before = egressCounts(policies);
    await assertAppHealthy(fetchApp);
    assert.deepEqual(
      egressCounts(policies),
      before,
      'Meet dependency readiness changed HTTP egress counters'
    );
  });
  const startedAt = Date.now();
  const startup = createMeetStartup(
    owner,
    policies,
    () => readMeetRegistry(prepared, startedAt),
    () => projectMeetRegistry(prepared, startedAt)
  );
  return {
    supplier: receipt,
    async start() {
      const adapters = await startup.start();
      assert.deepEqual(
        await supplierReceipt(plan.ownerPackage),
        receipt,
        'SDK supplier changed across sessions'
      );
      return adapters;
    },
    finish: (...primary) => startup.finish(...primary),
  };
}
