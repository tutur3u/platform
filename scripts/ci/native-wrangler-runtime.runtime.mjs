import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  emitChildDiagnostics,
  syntaxCauseProjection,
} from './native-wrangler-diagnostics.mjs';
import {
  causes,
  classifyChildReceipt,
  createChildProducer,
  finalizeObservedCase,
  observeCaseReceipt,
  observeStartupFailure,
  persistFinalization,
  runChildFixture,
  supplierReceipt,
  supplierSummaryLine,
} from './native-wrangler-evidence.mjs';
import { graphEntry, main, nodeEntry } from './native-wrangler-fixture.mjs';
import {
  assertIntendedSyntax,
  spawnOwnedFixture,
  syntaxClosed,
} from './native-wrangler-observable.mjs';
import {
  prepareNativePlan,
  sealArtifact,
  startNativeWrangler,
} from './native-wrangler-runtime.mjs';

const sourceSHA = '5409c0a3704a29547c5a3cebf95df6b015b657f4';
async function fixture(cwd = process.cwd()) {
  if (process.env.NATIVE_FIXTURE_CASE) {
    const data = JSON.parse(
      await readFile(process.env.NATIVE_PLAN_FILE, 'utf8')
    );
    return {
      ...data.options,
      fixtureServices: { SERVICE: () => new Response('same-process-service') },
      outbound: () => new Response('denied-egress', { status: 599 }),
    };
  }
  const root = await mkdtemp(join(cwd, 'native-portable-artifact-'));
  await mkdir(join(root, 'public'));
  await mkdir(join(root, 'unused-empty'));
  await writeFile(join(root, 'unused.bin'), Buffer.from([0, 255, 42]));
  await writeFile(join(root, 'main.mjs'), main);
  await writeFile(
    join(root, 'lazy.mjs'),
    "export const value = 'lazy-emitted';\n"
  );
  await writeFile(join(root, 'message.txt'), 'emitted text');
  await writeFile(
    join(root, 'empty.wasm'),
    Buffer.from('0061736d01000000', 'hex')
  );
  await writeFile(join(root, 'public/hello.txt'), 'full asset worker');
  await writeFile(
    join(root, 'wrangler.json'),
    JSON.stringify({
      name: 'native-portable-fixture',
      main: 'main.mjs',
      compatibility_date: '2026-09-06',
      no_bundle: true,
      find_additional_modules: true,
      rules: [
        { type: 'ESModule', globs: ['**/*.mjs'] },
        { type: 'Text', globs: ['**/*.txt'], fallthrough: true },
        { type: 'CompiledWasm', globs: ['**/*.wasm'], fallthrough: true },
      ],
      vars: {
        COMPILED_SHA: sourceSHA,
        VALUE: 'config-default',
        SECRET: 'config-default',
      },
      durable_objects: {
        bindings: [{ name: 'COUNTER', class_name: 'Counter' }],
      },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['Counter'] }],
      services: [{ binding: 'SERVICE', service: 'fixture-only' }],
      assets: {
        directory: 'public',
        binding: 'ASSETS',
        run_worker_first: true,
        html_handling: 'none',
        not_found_handling: 'none',
      },
    })
  );
  return {
    root,
    main: join(root, 'main.mjs'),
    config: join(root, 'wrangler.json'),
    seal: await sealArtifact(root),
    sourceSHA,
    canonicalHost: 'fixture.invalid',
    ownerPackage: fileURLToPath(
      new URL('../../apps/meet/package.json', import.meta.url)
    ),
    fixtureVars: { VALUE: 'fixture-var' },
    fixtureSecrets: { SECRET: 'synthetic-secret' },
    fixtureServices: { SERVICE: () => new Response('same-process-service') },
    outbound: () => new Response('denied-egress', { status: 599 }),
  };
}
let childPlan;
const producer = createChildProducer(process.env.NATIVE_FIXTURE_CASE);
async function load(options) {
  const data = JSON.parse(await readFile(process.env.NATIVE_PLAN_FILE, 'utf8'));
  childPlan = data.plan;
  return startNativeWrangler(options, data.plan);
}
const start = (options) => producer.start(() => load(options));
const startupSpecs = {
  wrongModule: [
    `import bytes from './empty.wasm';\nconst instance = new WebAssembly.Instance(bytes);\n${main}`,
    undefined,
    (config) => {
      config.rules = [
        { type: 'ESModule', globs: ['**/*.mjs'] },
        { type: 'Text', globs: ['**/*.txt', '**/*.wasm'], fallthrough: true },
      ];
    },
  ],
  syntax: [
    'export default = ;',
    /Unexpected ["']=["']|SyntaxError[^\n]*Unexpected token ["']=["']/,
  ],
  graphEscape: [graphEntry('../outside.mjs')],
  graphValid: [graphEntry('./lazy.mjs')],
  wrongType: [`import { absent } from './message.txt';\n${main}`, undefined],
  nodeBuiltin: [
    nodeEntry,
    undefined,
    (config) => {
      config.compatibility_date = '2026-08-03';
    },
  ],
  nodeBuiltinEnabled: [
    nodeEntry,
    undefined,
    (config) => {
      config.compatibility_date = '2026-08-04';
    },
  ],
};
const cases = {
  async sdkResidual() {
    const options = await fixture();
    const runtime = await start(options);
    await runtime.worker.ready;
    const sibling = join(
      process.env.NATIVE_SDK_TEMP_ROOT,
      'miniflare-negative-control'
    );
    await mkdir(sibling);
    await writeFile(join(sibling, 'sentinel'), 'retain-sdk-sibling');
    await realpath(runtime.scratch);
    assert.equal(
      await readFile(join(sibling, 'sentinel'), 'utf8'),
      'retain-sdk-sibling'
    );
    assert.deepEqual(await sealArtifact(options.root), options.seal);
  },
  async positive() {
    const options = await fixture();
    const runtime = await start(options);
    await runtime.worker.ready;
    assert.equal((await runtime.worker.url).hostname, '127.0.0.1');
    assert.notEqual(runtime.copyMain, options.main);
    assert.equal(await readFile(runtime.copyMain, 'utf8'), main);
    assert.deepEqual(
      await readFile(join(runtime.copyRoot, 'unused.bin')),
      await readFile(join(options.root, 'unused.bin'))
    );
    await realpath(runtime.sdkWorkingDir);
    const result = await runtime.worker.fetch('https://fixture.invalid/check');
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      text: 'emitted text',
      lazy: 'lazy-emitted',
      wasm: {},
      host: 'fixture.invalid',
      sha: sourceSHA,
      compiled: sourceSHA,
      value: 'fixture-var',
      secret: 'synthetic-secret',
    });
    for (const [path, expected] of [
      ['/asset', 'full asset worker'],
      ['/service', 'same-process-service'],
      ['/do', '1'],
      ['/do', '2'],
    ]) {
      const response = await runtime.worker.fetch(
        `https://fixture.invalid${path}`
      );
      assert.equal(response.status, 200);
      assert.equal(await response.text(), expected);
    }
    for (const path of ['/asset-miss', '/asset-traversal']) {
      const response = await runtime.worker.fetch(
        `https://fixture.invalid${path}`
      );
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(
        await response.text(),
        /COMPILED_SHA|synthetic-secret/
      );
    }
    const denied = await runtime.worker.fetch('https://fixture.invalid/deny');
    assert.equal(denied.status, 599);
    assert.equal(await denied.text(), 'denied-egress');
    assert.equal(
      await readFile(
        join(process.cwd(), '.wrangler/tmp/dev-stale/sentinel'),
        'utf8'
      ),
      'unrelated-stale-scratch'
    );
  },
  async originalMutation() {
    await mutation('original');
  },
  async copyMutation() {
    await mutation('copy');
  },
  async removalFailure() {
    assert.notEqual(
      process.getuid?.(),
      0,
      'Removal-failure fixture requires an unprivileged runner'
    );
    const options = await fixture();
    const runtime = await start(options);
    await runtime.worker.ready;
    const denied = join(runtime.scratch, 'removal-denied');
    await mkdir(join(denied, 'child'), { recursive: true });
    await chmod(denied, 0);
    await realpath(runtime.scratch);
    assert.deepEqual(await sealArtifact(options.root), options.seal);
  },
  async wrongModule() {
    await startupFailure(...startupSpecs.wrongModule);
  },
  async syntax() {
    await startupFailure(...startupSpecs.syntax);
  },
  async graphEscape() {
    await startupFailure(...startupSpecs.graphEscape);
  },
  async wrongType() {
    await startupFailure(...startupSpecs.wrongType);
  },
  async nodeBuiltin() {
    await startupFailure(...startupSpecs.nodeBuiltin);
  },
  async graphValid() {
    await boundaryPositive('lazy-emitted');
  },
  async nodeBuiltinEnabled() {
    await boundaryPositive('function');
  },
  async preload() {
    const options = await fixture();
    const { createRequire } = await import('node:module');
    createRequire(options.ownerPackage)('wrangler');
    await producer.expectPreload(() => load(options));
  },
};
async function mutation(target) {
  const options = await fixture();
  const runtime = await start(options);
  await runtime.worker.ready;
  await writeFile(
    target === 'original' ? options.main : runtime.copyMain,
    'mutated'
  );
  await realpath(runtime.scratch);
  await realpath(options.root);
}
async function boundaryPositive(expected) {
  const runtime = await start(await fixture());
  await runtime.worker.ready;
  const response = await runtime.worker.fetch(
    'https://fixture.invalid/boundary'
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), expected);
  for (const expectedCount of ['1', '2']) {
    const counter = await runtime.worker.fetch('https://fixture.invalid/do');
    assert.equal(counter.status, 200);
    assert.equal(await counter.text(), expectedCount);
  }
}
async function startupFailure(_code, expected, _configure) {
  const options = await fixture();
  const name = process.env.NATIVE_FIXTURE_CASE;
  const run = () => load(options);
  await observeStartupFailure(
    producer,
    run,
    name,
    name === 'syntax'
      ? (error) => assertIntendedSyntax(error, childPlan)
      : expected
  );
}

if (process.env.NATIVE_FIXTURE_CASE) {
  await runChildFixture({
    name: process.env.NATIVE_FIXTURE_CASE,
    cases,
    producer,
    plan: () => childPlan,
    receiptFile: process.env.NATIVE_RECEIPT_FILE,
  });
} else {
  test('child diagnostic seam preserves original errors through diagnostic faults', async () => {
    const modes = 'cycle deep getter nonarray projection writer persistence';
    for (const mode of modes.split(' ')) {
      const startup = new Error('original startup'),
        dispose = new Error('original dispose');
      const fault = new Error(`diagnostic ${mode}`),
        persisted = new Map(),
        lines = [];
      if (mode === 'cycle') startup.cause = startup;
      if (mode === 'deep') {
        let current = startup;
        for (let i = 0; i < 12000; i++)
          current = current.cause = { message: `cause ${i}` };
      }
      if (mode === 'getter')
        Object.defineProperty(startup, 'message', {
          get() {
            throw fault;
          },
        });
      if (mode === 'nonarray')
        startup.errors = { message: 'nonarray collection', cause: dispose };
      const source = createChildProducer('syntax');
      await assert.rejects(
        source.observeReturnedStartup(async () => ({
          worker: { ready: Promise.reject(startup), dispose() {} },
          cleanup: async () => {
            throw dispose;
          },
        })),
        (error) => error === startup
      );
      const { errors, receipt } = await source.finish(startup);
      let reached = 0;
      const operation = emitChildDiagnostics(
        { receipt, errors, plan: {} },
        {
          writePrivate: async (name, bytes) => {
            if (mode === 'persistence' && name === 'child-phase-errors.json')
              throw fault;
            persisted.set(name, bytes);
          },
          writeReceipt: async () => {},
          project: (error, plan) => {
            reached++;
            assert.equal(error, startup);
            if (mode === 'projection') throw fault;
            return syntaxCauseProjection(error, plan);
          },
          writeFailure: () => {},
          writeLine: (line) => {
            if (mode === 'writer') throw fault;
            lines.push(line);
          },
          classify: (value) => {
            reached++;
            assert.equal(value, receipt);
            assert.equal(errors.startup, startup);
            assert.equal(errors.dispose, dispose);
            return classifyChildReceipt(value, value.case);
          },
        }
      );
      if (mode === 'persistence')
        await assert.rejects(operation, (error) => error === fault);
      else {
        const result = await operation;
        const classified = result.classificationError;
        assert.match(classified.message, /Unrelated primary failure/);
        assert.equal(result.errors, errors);
        const privateBytes = persisted.get('child-phase-errors.json');
        assert.doesNotThrow(() => JSON.parse(privateBytes));
        assert.ok(privateBytes.includes('original dispose'));
        if (mode === 'cycle') assert.ok(privateBytes.includes('"$ref"'));
        if (mode === 'deep') {
          assert.ok(privateBytes.includes('cause 11999'));
          const root = await realpath(
            await mkdtemp(join(tmpdir(), 'deep-snapshot-'))
          );
          const caseRoot = join(root, 'case'),
            diagnosticRoot = join(root, 'diagnostics');
          try {
            await Promise.all([mkdir(caseRoot), mkdir(diagnosticRoot)]);
            const result = await finalizeObservedCase(
              {
                caseRoot,
                diagnosticRoot,
                tempRoot: caseRoot,
                scratch: caseRoot,
              },
              [startup],
              { name: 'syntax', receiptStatus: 'notrun' }
            );
            assert.equal(result.phases.snapshot.ok, true);
            const metadata = JSON.parse(
              await readFile(
                join(result.snapshot.path, 'pre-removal.json'),
                'utf8'
              )
            );
            let tail = metadata.records.gates[0];
            for (let i = 0; i < 12000; i++) tail = tail.cause;
            assert.equal(tail.message, 'cause 11999');
            assert.equal(metadata.version, 1);
          } finally {
            await rm(root, { recursive: true });
          }
        }
        if (mode === 'nonarray')
          assert.ok(privateBytes.includes('nonarray collection'));
        if (['getter', 'projection', 'writer'].includes(mode)) {
          assert.ok(result.diagnosticFaults.includes(fault));
          const faultBytes = persisted.get('child-diagnostic-faults.json');
          assert.ok(faultBytes.includes(`diagnostic ${mode}`));
        }
        if (mode === 'getter') assert.ok(privateBytes.includes('$unreadable'));
      }
      assert.equal(reached, 2, mode);
      assert.deepEqual(errors, { primary: startup, startup, dispose });
      assert.ok(Buffer.byteLength(lines.join('\n')) < 1500);
    }
  });
  test('supplier receipt hashes the owning Wrangler dependency without executing it', async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'native-supplier-control-'))
    );
    try {
      const wrangler = join(root, 'node_modules/wrangler');
      const mf = join(wrangler, 'node_modules/miniflare');
      await mkdir(mf, { recursive: true });
      await writeFile(join(root, 'package.json'), '{}');
      await writeFile(
        join(wrangler, 'package.json'),
        JSON.stringify({ name: 'wrangler', version: '1.2.3', main: 'cli.cjs' })
      );
      await writeFile(
        join(mf, 'package.json'),
        JSON.stringify({
          name: 'miniflare',
          version: '3.4.5',
          main: 'index.cjs',
        })
      );
      const bytes = 'throw new Error("supplier execution forbidden");';
      await writeFile(join(wrangler, 'cli.cjs'), bytes);
      await writeFile(join(mf, 'index.cjs'), bytes);
      await mkdir(join(root, 'node_modules/miniflare'));
      await writeFile(
        join(root, 'node_modules/miniflare/package.json'),
        JSON.stringify({
          name: 'miniflare',
          version: '4.0.0',
          main: 'index.cjs',
        })
      );
      await writeFile(
        join(root, 'node_modules/miniflare/index.cjs'),
        'root decoy'
      );
      const first = await supplierReceipt(join(root, 'package.json'));
      assert.equal(first.cliPath, join(wrangler, 'cli.cjs'));
      assert.equal(first.summary.miniflareVersion, '3.4.5');
      assert.equal(first.summary.wranglerSha256, first.summary.miniflareSha256);
      assert.ok(!supplierSummaryLine(first.summary).includes(root));
      await writeFile(join(mf, 'index.cjs'), `${bytes}\n`);
      const second = await supplierReceipt(join(root, 'package.json'));
      assert.notEqual(
        first.summary.miniflareSha256,
        second.summary.miniflareSha256
      );
      assert.equal(first.summary.wranglerSha256, second.summary.wranglerSha256);
    } finally {
      await rm(root, { recursive: true });
    }
  });
  test('finalization verifies successful writes and propagates readback failures', async () => {
    for (const corrupt of [false, true]) {
      const caseRoot = await mkdtemp(join(tmpdir(), 'native-receipt-'));
      const result = { errors: [], phases: {} };
      const path = join(caseRoot, 'parent-finalization.json');
      const io = {
        writeFile,
        async readFile(...args) {
          const bytes = await readFile(...args);
          return corrupt ? `${bytes}corrupt` : bytes;
        },
      };
      try {
        const operation = persistFinalization({ caseRoot }, result, {}, io);
        if (corrupt)
          await assert.rejects(operation, (error) => {
            assert.match(
              error.errors[0].message,
              /Finalization readback mismatch/
            );
            assert.equal(error.record.persistenceErrors.length, 1);
            return true;
          });
        else assert.deepEqual((await operation).persistenceErrors, []);
        assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).errors, []);
      } finally {
        await rm(caseRoot, { recursive: true });
      }
    }
  });
  test('preload control requires exact pre-start cause without Worker or disposal', async () => {
    for (const message of [
      'Preloaded Wrangler SDK unsupported',
      'other failure',
    ]) {
      const producer = createChildProducer('preload');
      let primary;
      try {
        await producer.expectPreload(async () => {
          assert.fail(message);
        });
      } catch (error) {
        primary = error;
      }
      const { receipt } = await producer.finish(primary);
      const classify = () => classifyChildReceipt(receipt, 'preload');
      if (primary) assert.throws(classify);
      else assert.equal(classify(), 'PROVEN_PRESTART_PRELOAD_REJECTION');
      assert.throws(() =>
        classifyChildReceipt({ ...receipt, case: 'syntax' }, 'syntax')
      );
    }
  });
  const programRoot = await realpath(
    await mkdtemp(join(tmpdir(), 'native-sdk-run-'))
  );
  const diagnosticRoot = join(programRoot, 'diagnostics');
  await mkdir(diagnosticRoot, { mode: 0o700 });
  for (const name of Object.keys(cases)) {
    test(`public SDK isolated ${name}`, { timeout: 30000 }, async (t) => {
      const cwd = await realpath(await mkdtemp(join(programRoot, 'case-')));
      const tempRoot = join(cwd, 'native-sdk-temp');
      await mkdir(tempRoot);
      const stale = join(cwd, '.wrangler/tmp/dev-stale');
      await mkdir(stale, { recursive: true });
      const foreignPath = join(stale, 'sentinel');
      const foreignValue = 'unrelated-stale-scratch';
      await writeFile(foreignPath, foreignValue);
      await utimes(stale, new Date(0), new Date(0));
      const options = await fixture(cwd);
      if (startupSpecs[name]) {
        const [code, , configure] = startupSpecs[name];
        if (configure) {
          const config = JSON.parse(await readFile(options.config, 'utf8'));
          configure(config);
          await writeFile(options.config, JSON.stringify(config));
        }
        await writeFile(options.main, code);
        if (name === 'graphEscape')
          await writeFile(
            join(cwd, 'outside.mjs'),
            'export default "escaped";'
          );
        options.seal = await sealArtifact(options.root);
      }
      const plan = {
        ...(await prepareNativePlan(options, tempRoot)),
        foreignPath,
        foreignValue,
        caseRoot: cwd,
        diagnosticRoot,
      };
      const planFile = join(cwd, 'parent-plan.json');
      const receiptFile = join(cwd, 'child-receipt.json');
      await writeFile(planFile, JSON.stringify({ options, plan }), {
        flag: 'wx',
        mode: 0o600,
      });
      const gates = [];
      let outcome;
      try {
        outcome = await spawnOwnedFixture({
          entry: fileURLToPath(import.meta.url),
          cwd,
          name,
          planFile,
          receiptFile,
          tempRoot,
        });
        if (outcome.error) gates.push(outcome.error);
        if (
          name !== 'syntax' &&
          (outcome.code !== 0 || outcome.signal !== null)
        )
          gates.push(
            new Error(
              `SDK child exit: code=${outcome.code}, signal=${outcome.signal}`
            )
          );
      } catch (error) {
        gates.push(error);
      }
      const { classification, receipt, receiptStatus } =
        await observeCaseReceipt(receiptFile, name, outcome, plan, gates);
      const result = await finalizeObservedCase(plan, gates, {
        name,
        receipt,
        outcome,
        classification,
        receiptStatus,
      });
      assert.deepEqual(
        gates,
        [],
        `Child phases failed; evidence retained: ${cwd}`
      );
      const failed = Object.entries(result.phases)
        .filter(([, phase]) => !phase.ok)
        .map(([phase]) => phase);
      const expected = {
        originalMutation: 'originalSeal',
        copyMutation: 'copySeal',
        sdkResidual: 'residual',
        removalFailure: 'snapshot',
      }[name];
      if (expected) {
        assert.deepEqual(failed, [expected]);
        assert.equal(result.errors.length, 1);
        if (name === 'sdkResidual') {
          assert.deepEqual(result.phases.residual.error.residual, [
            'miniflare-negative-control',
          ]);
          assert.equal(
            await readFile(
              join(tempRoot, 'miniflare-negative-control/sentinel'),
              'utf8'
            ),
            'retain-sdk-sibling'
          );
        } else if (name === 'removalFailure') {
          assert.equal(result.phases.removal, undefined);
          assert.match(causes(result.phases.snapshot.error), /EACCES|EPERM/);
        } else
          assert.match(
            causes(result.phases[expected].error),
            name === 'originalMutation'
              ? /Artifact hash mutation/
              : /Copy hash mutation/
          );
        await realpath(plan.scratch);
        t.diagnostic(`Expected ${expected} failure; evidence retained: ${cwd}`);
      } else {
        assert.deepEqual(result.errors, []);
        assert.equal(result.phases.removal.ok, true);
        const observed =
          name === 'syntax'
            ? `${syntaxClosed}; internalCleanup=UNKNOWN; descendantClosure=UNKNOWN`
            : classification;
        t.diagnostic(
          `${observed}; private diagnostic snapshot: ${result.snapshot.path}`
        );
        await rm(cwd, { recursive: true });
      }
    });
  }
}
