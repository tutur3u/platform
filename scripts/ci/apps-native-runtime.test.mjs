import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APPS_ASSERTION_GROUPS,
  APPS_SUPPLIER,
  admitAppsSupplier,
  appsFixtureBindings,
  assertAppsOwnerSupplier,
  createAppsOwner,
  loadAppsSupplier,
} from './apps-native-runtime.mjs';
import {
  appsChildEnvironment,
  requireAppsChildOutcome,
  requireAppsReceipt,
} from './apps-native-runtime-launcher.mjs';
import {
  appsRoles,
  assertAppsCopies,
  assertAppsOriginal,
  createAppsFinalizer,
  inspectAppsPlan,
  inventoryApps,
  inventoryAppsWorkdir,
  prepareAppsSessions,
} from './apps-native-runtime-plan.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';

const sourceSHA = 'a'.repeat(40);
const helper = fileURLToPath(
  new URL('./apps-native-artifact.py', import.meta.url)
);
function inspectFixture(options) {
  return inspectAppsPlan(options, { checkout: () => sourceSHA });
}
async function fixture(t, mode = 'http') {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'apps-pure-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const repo = join(temporary, 'repository'),
    app = join(repo, 'apps/apps');
  await mkdir(app, { recursive: true });
  await writeFile(join(repo, 'bun.lock'), 'fixture lock');
  await writeFile(
    join(app, 'package.json'),
    '{"name":"@tuturuuu/apps","devDependencies":{"wrangler":"4.151.2"}}'
  );
  // Data-only fixture uses authoritative constants without compiler or SDK execution.
  execFileSync(
    'python3',
    [
      '-B',
      '-c',
      `
import importlib.util, json, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('artifact', sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
a=Path(sys.argv[2])
for d in ['dist/native', 'dist/client/assets', '.wrangler/deploy', 'public']: (a/d).mkdir(parents=True, exist_ok=True)
for name in m.PUBLIC_FILES:
 (a/'public'/name).write_text('source '+name); (a/'dist/client'/name).write_text('source '+name)
(a/'dist/client/.assetsignore').write_text('.dev.vars\\n')
(a/'dist/client/assets/entry.js').write_text('export const hydrated=true')
(a/'dist/native/index.js').write_text('export default {}')
c={**m.IDENTITY, **m.NORMALIZED_DEFAULTS, 'configPath': str(a/'.void-wrangler.jsonc'), 'userConfigPath': str(a/'.void-wrangler.jsonc'), 'main':'index.js', 'assets': {'binding':'ASSETS','directory':'../client','run_worker_first':True,'not_found_handling':'none'}}
(a/'dist/native/wrangler.json').write_text(json.dumps(c))
(a/'.wrangler/deploy/config.json').write_text(json.dumps({'configPath':'../../dist/native/wrangler.json','auxiliaryWorkers':[]}))
(a/'receipt.json').write_text(json.dumps(m.artifact(a, sys.argv[3])))
`,
      helper,
      app,
      sourceSHA,
    ],
    { stdio: 'pipe' }
  );
  const options = {
    appDirectory: app,
    ownerPackage: join(app, 'package.json'),
    sourceSHA,
    artifactReceipt: join(app, 'receipt.json'),
  };
  const plan = await inspectFixture(options);
  const caseRoot = join(temporary, 'case'),
    diagnosticRoot = join(temporary, 'diagnostics');
  const tempRoot = join(caseRoot, 'native-sdk-temp');
  for (const directory of [caseRoot, diagnosticRoot, tempRoot])
    await mkdir(directory);
  const foreignPath = join(caseRoot, 'foreign'),
    foreignValue = 'unrelated';
  await writeFile(foreignPath, foreignValue);
  const prepared = await prepareAppsSessions(
    plan,
    { caseRoot, diagnosticRoot, tempRoot, foreignPath, foreignValue },
    mode
  );
  return { plan, prepared, options, app, temporary };
}

test('finite plan seals normalized output, hidden asset and distinct unchanged role copies', async (t) => {
  const { plan, prepared } = await fixture(t);
  assert.equal(Object.isFrozen(plan.config.assets), true);
  assert.equal(plan.seal['client/.assetsignore']?.length, 64);
  assert.deepEqual(Object.keys(prepared.roles), ['app', 'negative']);
  assert.notEqual(
    prepared.roles.app.registry,
    prepared.roles.negative.registry
  );
  for (const role of Object.values(prepared.roles)) {
    assert.deepEqual(await inventoryApps(role.root), plan.seal);
    assert.equal(
      JSON.parse(await readFile(role.config)).name,
      'tuturuuu-apps-vite-staging'
    );
  }
  assert.throws(() => appsRoles('probe'));
  const extra = {
    ...prepared,
    roles: { ...prepared.roles, probe: prepared.roles.app },
  };
  await assert.rejects(assertAppsCopies(plan, extra));
  await writeFile(
    join(dirname(prepared.roles.app.config), 'new.js'),
    'mutation'
  );
  await assert.rejects(assertAppsCopies(plan, prepared), /mutation/);
});

test('authoritative admission rejects wrong source, receipts, topology and normalized defaults', async (t) => {
  const { options, app } = await fixture(t, 'browser');
  await assert.rejects(
    inspectFixture({ ...options, sourceSHA: 'b'.repeat(40) }),
    /identity mismatch/
  );
  await assert.rejects(
    inspectFixture({ ...options, ownerPackage: join(app, '../package.json') }),
    /Owning/
  );
  const configPath = join(app, 'dist/native/wrangler.json'),
    original = await readFile(configPath);
  const config = JSON.parse(original);
  for (const change of [
    { services: [{ binding: 'OTHER', service: 'other' }] },
    { vars: { ...config.vars, PLATFORM_BUILD_COMMIT_HASH: sourceSHA } },
    { dev: { ...config.dev, enable_containers: false } },
    { compatibility_flags: [] },
    { unadmitted: true },
    { main: '../../../outside.js' },
  ]) {
    await writeFile(configPath, JSON.stringify({ ...config, ...change }));
    await assert.rejects(inspectFixture(options));
  }
  await writeFile(configPath, original);
  const receiptPath = options.artifactReceipt,
    receipt = await readFile(receiptPath);
  await writeFile(
    receiptPath,
    JSON.stringify({ ...JSON.parse(receipt), sourceSha: 'b'.repeat(40) })
  );
  await assert.rejects(inspectFixture(options));
  await writeFile(receiptPath, receipt);
  const pointer = join(app, '.wrangler/deploy/config.json');
  await mkdir(join(app, '.void'));
  await writeFile(
    join(app, '.void/preview-deploy-config.json'),
    await readFile(pointer)
  );
  await assert.rejects(inspectFixture(options));
  await rm(join(app, '.void'), { recursive: true });
  await writeFile(
    pointer,
    JSON.stringify({
      configPath: '../../dist/native/wrangler.json',
      auxiliaryWorkers: ['other'],
    })
  );
  await assert.rejects(inspectFixture(options));
  await rm(pointer);
  await assert.rejects(inspectFixture(options));
});

test('source, owner, lock, receipt and copied evidence mutation each fail independent readback', async (t) => {
  const { plan, prepared } = await fixture(t);
  for (const path of Object.keys(plan.identities)) {
    const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from(' ')]));
    await assert.rejects(assertAppsOriginal(plan));
    await writeFile(path, original);
  }
  const lock = await readFile(plan.lockPath);
  await writeFile(
    plan.lockPath,
    '{"@tuturuuu/apps/wrangler": ["wrangler@4.149.0"]}'
  );
  await assert.rejects(assertAppsOwnerSupplier(plan), /Stale Apps/);
  await writeFile(plan.lockPath, lock);
  const asset = join(plan.root, 'client/assets/entry.js'),
    bytes = await readFile(asset);
  await writeFile(asset, 'changed');
  await assert.rejects(assertAppsOriginal(plan));
  await writeFile(asset, bytes);
  await symlink(asset, join(plan.root, 'client/link.js'));
  await assert.rejects(inventoryApps(plan.root), /links/);
  await rm(join(plan.root, 'client/link.js'));
  await writeFile(join(prepared.evidenceRoot, 'deploy-pointer.json'), '{}');
  await assert.rejects(assertAppsCopies(plan, prepared));
});

test('saved pointer preserves producer metadata and exact config-relative relationships', async (t) => {
  const { options, app, plan } = await fixture(t);
  const pointer = join(app, '.wrangler/deploy/config.json');
  await mkdir(join(app, '.void'));
  await writeFile(
    join(app, '.void/preview-deploy-config.json'),
    await readFile(pointer)
  );
  await rm(pointer);
  const receipt = JSON.parse(await readFile(options.artifactReceipt));
  receipt.files['.void/preview-deploy-config.json'] =
    receipt.files['.wrangler/deploy/config.json'];
  delete receipt.files['.wrangler/deploy/config.json'];
  await writeFile(options.artifactReceipt, JSON.stringify(receipt));
  const saved = await inspectFixture(options);
  assert.deepEqual(saved.config, plan.config);
  assert.equal(
    saved.pointerPath,
    join(app, '.void/preview-deploy-config.json')
  );
});

function supplierIO({
  preloaded = false,
  mutate = false,
  summary = APPS_SUPPLIER,
} = {}) {
  let loads = 0,
    reads = 0;
  const require = () => {
    loads++;
    return { unstable_startWorker() {} };
  };
  require.cache = preloaded ? { '/supplier/cli.js': {} } : {};
  return {
    get loads() {
      return loads;
    },
    receipt: async () => ({
      cliPath: '/supplier/cli.js',
      miniflarePath: '/supplier/mf.js',
      summary: {
        ...summary,
        ...(mutate && reads++ > 0 ? { wranglerSha256: '0'.repeat(64) } : {}),
      },
    }),
    require: () => require,
    log: () => {},
  };
}
test('owning supplier pins reject stale versions, hashes, preload and byte changes without SDK execution', async () => {
  for (const [key, value] of [
    ['wranglerVersion', '4.149.0'],
    ['miniflareVersion', '5.20261006.1-alpha'],
    ['wranglerSha256', '0'.repeat(64)],
    ['miniflareSha256', '0'.repeat(64)],
  ]) {
    const summary = { ...APPS_SUPPLIER, [key]: value },
      io = supplierIO({ summary });
    assert.throws(() => admitAppsSupplier(summary));
    await assert.rejects(loadAppsSupplier('/owner/package.json', io));
    assert.equal(io.loads, 0);
  }
  const preload = supplierIO({ preloaded: true });
  await assert.rejects(
    loadAppsSupplier('/owner/package.json', preload),
    /Preloaded/
  );
  assert.equal(preload.loads, 0);
  const changed = supplierIO({ mutate: true });
  await assert.rejects(loadAppsSupplier('/owner/package.json', changed));
  const accepted = supplierIO();
  await loadAppsSupplier('/owner/package.json', accepted);
  assert.equal(accepted.loads, 1);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function worker(role, events, ready = Promise.resolve(), disposal) {
  return {
    ready,
    url: Promise.resolve(new URL('http://127.0.0.1:12345/')),
    fetch: async () => new Response(role),
    dispose: async () => {
      events.push(`dispose:${role}`);
      if (disposal) throw disposal;
    },
  };
}
test('public owner acquires before ready and disposes all returned handles once in reverse order', async () => {
  const events = [],
    wait = deferred(),
    entered = deferred();
  const owner = createAppsOwner(
    async ({ role }) => {
      events.push(`return:${role}`);
      entered.resolve();
      return worker(role, events, role === 'app' ? wait.promise : undefined);
    },
    { app: { role: 'app' }, negative: { role: 'negative' } },
    'http'
  );
  const started = owner.start();
  await entered.promise;
  await Promise.resolve();
  assert.deepEqual(events, ['return:app']);
  wait.resolve();
  const adapters = await started;
  assert.equal(
    await (await adapters.negative.fetch('http://127.0.0.1/')).text(),
    'negative'
  );
  const first = owner.finish(),
    second = owner.finish();
  assert.equal(first, second);
  const result = await first;
  assert.deepEqual(events, [
    'return:app',
    'return:negative',
    'dispose:negative',
    'dispose:app',
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.receipt.roles, ['app', 'negative']);
  assert.equal(result.receipt.internalCleanup, 'UNKNOWN');
});

test('second acquisition and readiness failures retain primary and dispose errors', async () => {
  for (const phase of ['acquire', 'ready']) {
    const events = [],
      primary = new Error(phase),
      disposal = new Error('dispose');
    const owner = createAppsOwner(
      async ({ role }) => {
        if (role === 'negative' && phase === 'acquire') throw primary;
        return worker(
          role,
          events,
          role === 'negative' ? Promise.reject(primary) : undefined,
          role === 'app' ? disposal : undefined
        );
      },
      { app: { role: 'app' }, negative: { role: 'negative' } },
      'http'
    );
    await assert.rejects(owner.start(), (error) => error === primary);
    const result = await owner.finish(primary);
    assert.deepEqual(result.errors, [primary, disposal]);
    assert.deepEqual(
      events,
      phase === 'acquire'
        ? ['dispose:app']
        : ['dispose:negative', 'dispose:app']
    );
    assert.equal(result.receipt.primaryIdentity, 0);
  }
  const shared = new Error('same'),
    events = [];
  const owner = createAppsOwner(
    async () => worker('app', events, Promise.reject(shared), shared),
    { app: {} },
    'browser'
  );
  await assert.rejects(owner.start(), (error) => error === shared);
  const finished = await owner.finish(shared);
  assert.equal(finished.errors[0], finished.errors[1]);
  assert.equal(
    finished.receipt.phases.find((p) => p.phase === 'ready').errorIdentity,
    finished.receipt.phases.find((p) => p.phase === 'dispose').errorIdentity
  );
});

test('deadline abort of a returned handle readiness still awaits public disposal', async () => {
  const controller = new AbortController(),
    events = [],
    wait = deferred();
  const owner = createAppsOwner(
    async () => worker('app', events, wait.promise),
    { app: {} },
    'browser'
  );
  const started = owner.start(controller.signal);
  controller.abort(new Error('deadline'));
  await assert.rejects(started, /deadline/);
  await owner.finish(controller.signal.reason);
  assert.deepEqual(events, ['dispose:app']);
});

test('closed fixture inputs cannot inject identity, arbitrary bindings or destinations', () => {
  const values = {
    INTERNAL_WEB_API_ORIGIN: 'http://127.0.0.1:12345',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:12345',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
    SUPABASE_SECRET_KEY: 'fixture-service-key',
    TUTURUUU_APP_COORDINATION_SECRET: 'a'.repeat(64),
  };
  const app = appsFixtureBindings('http', values, 'app'),
    negative = appsFixtureBindings('http', values, 'negative');
  assert.equal(app.SUPABASE_SECRET_KEY.type, 'secret_text');
  assert.equal(
    negative.INTERNAL_WEB_API_ORIGIN.value,
    'https://apps-unadmitted.invalid'
  );
  for (const delta of [
    { PLATFORM_BUILD_COMMIT_HASH: sourceSHA },
    { EXTRA: 'new' },
    { INTERNAL_WEB_API_ORIGIN: 'https://public.invalid' },
    { SUPABASE_SECRET_KEY: 'other' },
  ])
    assert.throws(() =>
      appsFixtureBindings('http', { ...values, ...delta }, 'app')
    );
  assert.throws(() => appsFixtureBindings('http', values, 'probe'));
});

function receipt(mode) {
  const roles = appsRoles(mode);
  return {
    schema: 1,
    mode,
    sourceSHA,
    supplier: {
      cliPath: '/supplier/cli.js',
      miniflarePath: '/supplier/mf.js',
      summary: APPS_SUPPLIER,
    },
    completed: APPS_ASSERTION_GROUPS[mode],
    errors: [],
    internalCleanup: 'UNKNOWN',
    descendantClosure: 'UNKNOWN',
    policies: Object.fromEntries(
      roles.map((role) => [
        role,
        {
          controls: 2,
          permitted: mode === 'http' && role === 'app' ? 1 : 0,
          unexpected:
            role === 'negative'
              ? [
                  {
                    method: 'GET',
                    url: 'https://apps-unadmitted.invalid/api/v1/users/me/profile',
                  },
                ]
              : [],
        },
      ])
    ),
    lifecycle: {
      roles,
      phases: [
        ...roles.flatMap((role) =>
          ['acquired', 'ready'].map((phase) => ({
            role,
            phase,
            ok: true,
            error: null,
            errorIdentity: null,
          }))
        ),
        ...roles
          .slice()
          .reverse()
          .map((role) => ({
            role,
            phase: 'dispose',
            ok: true,
            error: null,
            errorIdentity: null,
          })),
      ],
      primaryIdentity: null,
      errors: [],
      internalCleanup: 'UNKNOWN',
      descendantClosure: 'UNKNOWN',
    },
  };
}
const closedOutcome = {
  code: 0,
  signal: null,
  closeObserved: true,
  stdioDrained: true,
  intervened: false,
};
test('parent requires independent natural close, every assertion group and exact finite receipt', () => {
  requireAppsChildOutcome(closedOutcome);
  for (const change of [
    { code: 1 },
    { signal: 'SIGTERM' },
    { stdioDrained: false },
    { closeObserved: false },
    { intervened: true },
    { error: new Error('output') },
  ])
    assert.throws(() =>
      requireAppsChildOutcome({ ...closedOutcome, ...change })
    );
  for (const mode of ['http', 'browser']) {
    requireAppsReceipt(receipt(mode), { sourceSHA }, mode);
    for (const mutate of [
      (r) => {
        r.sourceSHA = 'b'.repeat(40);
      },
      (r) => {
        r.completed = [];
      },
      (r) => {
        r.lifecycle.phases.pop();
      },
      (r) => {
        r.lifecycle.phases[0].ok = false;
      },
      (r) => {
        r.policies.app.controls = 0;
      },
      (r) => {
        r.supplier.summary.wranglerVersion = '4.149.0';
      },
      (r) => {
        r.lifecycle = null;
      },
      (r) => {
        delete r.supplier;
      },
    ]) {
      const candidate = structuredClone(receipt(mode));
      mutate(candidate);
      assert.throws(() => requireAppsReceipt(candidate, { sourceSHA }, mode));
    }
  }
});

test('close observation waits for both pipes rather than child exit', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let resolved = false;
  const result = observeOwnedChild(child).then((value) => {
    resolved = true;
    return value;
  });
  child.emit('exit', 0, null);
  await Promise.resolve();
  assert.equal(resolved, false);
  child.stdout.end();
  child.stderr.end();
  await Promise.all([
    new Promise((r) => child.stdout.on('end', r)),
    new Promise((r) => child.stderr.on('end', r)),
  ]);
  child.emit('close', 0, null);
  requireAppsChildOutcome(await result);
});

test('child environment excludes ambient credentials, preloads and unrelated provider state', () => {
  const context = {
    caseRoot: '/case',
    tempRoot: '/case/native-sdk-temp',
    planFile: '/case/plan',
    receiptFile: '/case/receipt',
    sourceSHA,
    artifactReceipt: '/sealed/receipt',
    mode: 'http',
  };
  const env = appsChildEnvironment(
    {
      PATH: '/bin',
      HOME: '/foreign',
      NODE_OPTIONS: '--require=bad',
      CLOUDFLARE_API_TOKEN: 'private',
      DATABASE_URL: 'private',
    },
    context
  );
  assert.equal(env.HOME, '/case/home');
  assert.equal(env.NODE_OPTIONS, '');
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, undefined);
  assert.equal(env.APPS_SOURCE_SHA, sourceSHA);
});

test('finalizer snapshots hidden SDK evidence before removal with independent persisted readbacks', async (t) => {
  const { plan, prepared } = await fixture(t, 'browser');
  const sdkDir = join(dirname(prepared.roles.app.config), '.wrangler');
  await mkdir(sdkDir);
  await writeFile(join(sdkDir, '.hidden-evidence'), 'retain');
  const finalizer = createAppsFinalizer(plan, prepared);
  const first = finalizer(),
    second = finalizer();
  assert.equal(first, second);
  const result = await first;
  assert.deepEqual(result.errors, []);
  assert.equal(result.phases.removal.ok, true);
  const retained = join(
    result.snapshot.path,
    'case',
    'native-sdk-temp',
    prepared.scratch.split('/').pop(),
    'app',
    'native',
    '.wrangler',
    '.hidden-evidence'
  );
  assert.equal(await readFile(retained, 'utf8'), 'retain');
  await assert.rejects(realpath(prepared.scratch), { code: 'ENOENT' });
  const persisted = JSON.parse(
    await readFile(join(prepared.caseRoot, 'parent-finalization.json'))
  );
  assert.equal(persisted.internalCleanup, 'UNKNOWN');
});

test('primary, seal, snapshot and pre-removal persistence failures each retain scratch', async (t) => {
  for (const failure of ['case', 'copy', 'snapshot', 'write', 'persist']) {
    const { plan, prepared } = await fixture(t, 'browser');
    const io = {},
      gates = [];
    if (failure === 'case') gates.push(new Error('assertions'));
    if (failure === 'copy')
      await writeFile(join(prepared.roles.app.root, 'client/extra.js'), 'bad');
    const fail = async () => {
      throw new Error(failure);
    };
    if (failure === 'snapshot') io.snapshot = fail;
    if (failure === 'write') io.write = fail;
    if (failure === 'persist') io.persist = fail;
    const result = await createAppsFinalizer(plan, prepared, io)(gates);
    assert.ok(result.errors.length > 0);
    assert.equal(result.phases.removal, undefined);
    assert.equal(await realpath(prepared.scratch), prepared.scratch);
  }
});

test('both CI evidence pack steps retain the complete hidden inventory', async (t) => {
  const { parse } = createRequire(import.meta.url)('yaml');
  const workflow = parse(
    await readFile(
      new URL('../../.github/workflows/apps-cloudflare.yaml', import.meta.url),
      'utf8'
    )
  );
  for (const job of ['validate', 'restore-acceptance']) {
    const temporary = await realpath(
      await mkdtemp(join(tmpdir(), 'apps-pack-'))
    );
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const root = join(temporary, 'apps-native-evidence');
    await mkdir(join(root, '.wrangler/empty'), { recursive: true });
    await writeFile(join(root, '.wrangler/.evidence'), 'retained');
    const before = await inventoryAppsWorkdir(root);
    const step = workflow.jobs[job].steps.find(
      (step) =>
        step.name ===
        'Pack Apps finite public SDK evidence including hidden files'
    );
    assert.equal(step.if, 'always()');
    execFileSync('bash', ['-e', '-c', step.run], {
      env: { PATH: process.env.PATH, RUNNER_TEMP: temporary },
    });
    const restored = join(temporary, 'restored');
    await mkdir(restored);
    const archive = join(temporary, 'apps-native-evidence.tar.gz');
    execFileSync('tar', ['-xzf', archive, '-C', restored]);
    assert.deepEqual(
      await inventoryAppsWorkdir(join(restored, 'apps-native-evidence')),
      before
    );
  }
});
