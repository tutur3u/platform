import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyChildReceipt,
  createChildProducer,
  diagnosticError,
  persistFinalization,
  requireChildOutcome,
  validateReceipt,
} from './native-wrangler-evidence.mjs';
import {
  assertChildTempIsolation,
  createNativeFinalizer,
  phaseErrors,
  prepareNativePlan,
  sealArtifact,
  startNativeWrangler,
} from './native-wrangler-runtime.mjs';

const sourceSHA = '5409c0a3704a29547c5a3cebf95df6b015b657f4';
// Fixed portable emitted bytes, materialized only in CI. No transpiler or bundler.
const main = `import text from './message.txt';
import wasm from './empty.wasm';
export class Counter {
  constructor(state) { this.state = state; }
  async fetch() {
    const n = (await this.state.storage.get('n') ?? 0) + 1;
    await this.state.storage.put('n', n);
    return new Response(String(n));
  }
}
export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/asset') return env.ASSETS.fetch(new Request('https://fixture.invalid/hello.txt'));
  if (url.pathname === '/asset-miss') return env.ASSETS.fetch(new Request('https://fixture.invalid/absent.txt'));
  if (url.pathname === '/asset-traversal') return env.ASSETS.fetch(new Request('https://fixture.invalid/%2e%2e/wrangler.json'));
  if (url.pathname === '/service') return env.SERVICE.fetch(request);
  if (url.pathname === '/deny') return fetch('https://unadmitted.invalid/provider');
  if (url.pathname === '/do') return env.COUNTER.get(env.COUNTER.idFromName('same')).fetch(request);
  const lazy = await import('./lazy.mjs');
  return Response.json({ text, lazy: lazy.value, wasm: new WebAssembly.Instance(wasm).exports,
    host: url.host, sha: '5409c0a3704a29547c5a3cebf95df6b015b657f4',
    compiled: env.COMPILED_SHA, value: env.VALUE, secret: env.SECRET });
} };
//# sourceURL=annotation-only-0000000000000000000000000000000000000000.mjs`;

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

// Each child has its own disposable cwd and SDK module cache. No child timeout or
// kill is installed: the existing whole 3-minute step must fail an unsettled SDK.
function causes(error) {
  if (!error) return '';
  return [
    error.name,
    error.message,
    error.text,
    causes(error.cause),
    ...(error.errors ?? []).map(causes),
  ].join('\n');
}
const producer = createChildProducer(process.env.NATIVE_FIXTURE_CASE);
async function load(options) {
  const data = JSON.parse(await readFile(process.env.NATIVE_PLAN_FILE, 'utf8'));
  return startNativeWrangler(options, data.plan);
}
const start = (options) => producer.start(() => load(options));
function boundaryEntry(imports, expression) {
  return `${imports}\n${main.replace(
    '  const url = new URL(request.url);',
    `  const url = new URL(request.url);\n  if (url.pathname === '/boundary') return new Response(${expression});`
  )}`;
}
const graphEntry = (specifier) =>
  boundaryEntry(
    `import { value as boundaryValue } from '${specifier}';`,
    'boundaryValue'
  );
const nodeEntry = boundaryEntry(
  "import fs from 'node:fs';",
  'typeof fs.readFile'
);
function startupDiagnostics(error) {
  const raw = causes(error);
  const messages = [raw];
  for (const line of raw.split('\n')) {
    try {
      const record = JSON.parse(line);
      if (typeof record?.message === 'string') messages.push(record.message);
    } catch {
      /* Non-JSON diagnostic lines remain in raw. */
    }
  }
  return messages;
}
function graphRejection(error) {
  assert.ok(
    startupDiagnostics(error).some(
      (text) =>
        text.includes(
          'service core:user:native-portable-fixture: Uncaught TypeError: Invalid module specifier "../outside.mjs".'
        ) && text.includes('imported from "main.mjs"')
    )
  );
}
function nodeRejection(error) {
  assert.ok(
    startupDiagnostics(error).some(
      (text) =>
        text.includes(
          'service core:user:native-portable-fixture: Uncaught Error: No such module "node:fs".'
        ) && text.includes('imported from "main.mjs"')
    )
  );
}
const startupSpecs = {
  wrongModule: [
    `import bytes from './empty.wasm';\nconst instance = new WebAssembly.Instance(bytes);\n${main}`,
    /TypeError[^\n]*WebAssembly|(?:first argument|Argument 0)[^\n]*WebAssembly\.Module/i,
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
  graphEscape: [graphEntry('../outside.mjs'), graphRejection],
  graphValid: [graphEntry('./lazy.mjs')],
  wrongType: [
    `import { absent } from './message.txt';\n${main}`,
    /(?:does not provide an export named|No matching export)[^\n]*absent/,
  ],
  nodeBuiltin: [
    nodeEntry,
    nodeRejection,
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
    // The copy uses the complete original inventory, including unused files.
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
    // An unreadable subtree must prevent snapshot verification and all removal.
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
  await producer.expectStartup(
    () => load(options),
    (error) => {
      if (typeof expected === 'function') expected(error);
      else assert.match(causes(error), expected);
      if (!producer.record().receipt.facts.workerReturned)
        console.error(error.message);
    }
  );
}
async function readReceipt(path, name) {
  assert.ok((await stat(path)).size <= 8192, 'Oversized child receipt');
  return validateReceipt(JSON.parse(await readFile(path, 'utf8')), name);
}
if (process.env.NATIVE_FIXTURE_CASE) {
  let primary;
  try {
    await assertChildTempIsolation();
    assert.ok(Object.hasOwn(cases, process.env.NATIVE_FIXTURE_CASE));
    await cases[process.env.NATIVE_FIXTURE_CASE]();
  } catch (error) {
    primary = error;
  }
  const { receipt, errors } = await producer.finish(primary);
  await writeFile(
    join(process.cwd(), 'child-phase-errors.json'),
    JSON.stringify({
      ...Object.fromEntries(
        Object.entries(errors).map(([key, error]) => [
          key,
          diagnosticError(error),
        ])
      ),
      disposeIsStartup: receipt.disposeIsStartup,
    }),
    { flag: 'wx', mode: 0o600 }
  );
  await writeFile(process.env.NATIVE_RECEIPT_FILE, JSON.stringify(receipt), {
    flag: 'wx',
    mode: 0o600,
  });
  const error = phaseErrors(primary, errors.dispose);
  if (error) console.error(error);
  try {
    classifyChildReceipt(receipt, receipt.case);
  } catch (classificationError) {
    console.error(classificationError);
    process.exitCode = 1;
  }
} else {
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
        const child = spawn(
          process.execPath,
          [fileURLToPath(import.meta.url)],
          {
            cwd,
            env: {
              ...process.env,
              NATIVE_FIXTURE_CASE: name,
              NATIVE_PLAN_FILE: planFile,
              NATIVE_RECEIPT_FILE: receiptFile,
              NATIVE_SDK_TEMP_ROOT: tempRoot,
              TMPDIR: tempRoot,
              TMP: tempRoot,
              TEMP: tempRoot,
              NODE_OPTIONS: '',
              NODE_PATH: '',
              CLOUDFLARE_ENV: '',
              CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
              CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
              WRANGLER_WRITE_LOGS: 'false',
            },
            stdio: 'inherit',
          }
        );
        outcome = await new Promise((resolve) => {
          child.once('error', (error) => resolve({ error }));
          child.once('exit', (code, signal) => resolve({ code, signal }));
        });
        if (outcome.error) gates.push(outcome.error);
        if (outcome.code !== 0 || outcome.signal !== null)
          gates.push(
            new Error(
              `SDK child exit: code=${outcome.code}, signal=${outcome.signal}`
            )
          );
      } catch (error) {
        gates.push(error);
      }
      let classification;
      try {
        const receipt = await readReceipt(receiptFile, name);
        classification = requireChildOutcome(receipt, name, outcome);
        if (classification === 'PROVEN_PRESTART_PRELOAD_REJECTION') {
          await realpath(plan.scratch);
          assert.deepEqual(await sealArtifact(plan.copyRoot), plan.seal);
          await assert.rejects(stat(plan.sdkWorkingDir), { code: 'ENOENT' });
          assert.equal(await readFile(plan.envFile, 'utf8'), '');
        }
      } catch (error) {
        gates.push(error);
      }
      // This always runs after the sole child settles, including a failed exit/spawn.
      const result = await createNativeFinalizer(plan, undefined, {
        classification,
        exit: outcome,
      })(gates);
      await persistFinalization(plan, result, {
        exit: outcome
          ? {
              code: outcome.code ?? null,
              signal: outcome.signal ?? null,
              spawnError: diagnosticError(outcome.error),
            }
          : null,
        classification,
        gates: gates.map(diagnosticError),
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
        t.diagnostic(
          `${classification}; private diagnostic snapshot: ${result.snapshot.path}`
        );
        await rm(cwd, { recursive: true });
      }
    });
  }
}
