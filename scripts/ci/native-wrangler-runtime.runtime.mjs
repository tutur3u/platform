import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
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
  assertChildTempIsolation,
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

async function fixture() {
  const root = await mkdtemp(join(process.cwd(), 'native-portable-artifact-'));
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
async function removed(path) {
  await assert.rejects(realpath(path), { code: 'ENOENT' });
}
async function close(runtime, options) {
  await runtime.cleanup();
  await removed(runtime.scratch); // A no-op cleanup must fail this assertion.
  assert.deepEqual(await sealArtifact(options.root), options.seal);
  await rm(options.root, { recursive: true });
}
const cases = {
  async sdkResidual() {
    const options = await fixture();
    const runtime = await startNativeWrangler(options);
    await runtime.worker.ready;
    const sibling = join(
      process.env.NATIVE_SDK_TEMP_ROOT,
      'miniflare-negative-control'
    );
    await mkdir(sibling);
    await writeFile(join(sibling, 'sentinel'), 'retain-sdk-sibling');
    await assert.rejects(runtime.cleanup(), /Public SDK cleanup failed/);
    await realpath(runtime.scratch);
    assert.equal(
      await readFile(join(sibling, 'sentinel'), 'utf8'),
      'retain-sdk-sibling'
    );
    assert.deepEqual(await sealArtifact(options.root), options.seal);
  },
  async positive() {
    const options = await fixture();
    const runtime = await startNativeWrangler(options);
    try {
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
      const result = await runtime.worker.fetch(
        'https://fixture.invalid/check'
      );
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
    } finally {
      await close(runtime, options);
    }
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
    const runtime = await startNativeWrangler(options);
    await runtime.worker.ready;
    const denied = join(runtime.scratch, 'removal-denied');
    await mkdir(join(denied, 'child'), { recursive: true });
    await chmod(denied, 0);
    await assert.rejects(runtime.cleanup(), (error) => {
      assert.match(causes(error), /EACCES|EPERM/);
      assert.match(error.message, /cleanup failed; evidence retained/);
      return true;
    });
    await realpath(runtime.scratch);
    // Keep the denied directory and both seals for independent failure inspection.
    assert.deepEqual(await sealArtifact(options.root), options.seal);
  },
  async wrongModule() {
    await startupFailure(
      'import bytes from "./empty.wasm"; const instance = new WebAssembly.Instance(bytes); export default { fetch() { return new Response(String(instance)); } };',
      /TypeError[^\n]*WebAssembly|(?:first argument|Argument 0)[^\n]*WebAssembly\.Module/i,
      (config) => {
        config.rules = [
          { type: 'ESModule', globs: ['**/*.mjs'] },
          { type: 'Text', globs: ['**/*.wasm'], fallthrough: true },
        ];
      }
    );
  },
  async syntax() {
    await startupFailure(
      'export default = ;',
      /Unexpected ["']=["']|SyntaxError[^\n]*Unexpected token ["']=["']/
    );
  },
  async graphEscape() {
    // This sibling exists outside the claimed tree, but must not enter the SDK graph.
    await writeFile(
      join(process.cwd(), 'outside.mjs'),
      'export default "escaped";'
    );
    await startupFailure(
      'import value from "../outside.mjs"; export default { fetch() { return new Response(value); } };',
      /(?:No such module|Could not resolve|Cannot find module)[^\n]*outside\.mjs/
    );
  },
  async wrongType() {
    await startupFailure(
      'import { absent } from "./message.txt"; export default { fetch() { return new Response(absent); } };',
      /(?:does not provide an export named|No matching export)[^\n]*absent/
    );
  },
  async nodeBuiltin() {
    await startupFailure(
      'import fs from "node:fs"; export default { fetch() { return new Response(String(fs)); } };',
      /(?:No such module|Could not resolve|Cannot find module)[^\n]*node:fs/
    );
  },
  async preload() {
    const options = await fixture();
    const { createRequire } = await import('node:module');
    createRequire(options.ownerPackage)('wrangler');
    await assert.rejects(
      startNativeWrangler(options),
      /Preloaded Wrangler SDK unsupported/
    );
    await rm(options.root, { recursive: true });
  },
};
async function mutation(target) {
  const options = await fixture();
  const runtime = await startNativeWrangler(options);
  await runtime.worker.ready;
  await writeFile(
    target === 'original' ? options.main : runtime.copyMain,
    'mutated'
  );
  await assert.rejects(runtime.cleanup(), (error) => {
    assert.match(
      causes(error),
      target === 'original' ? /Artifact hash mutation/ : /Copy hash mutation/
    );
    assert.match(error.message, /cleanup failed; evidence retained/);
    return true;
  });
  await realpath(runtime.scratch);
  await realpath(options.root);
  // Intentionally retained evidence; a second cleanup must not silently succeed.
  await assert.rejects(runtime.cleanup(), /cleanup failed; evidence retained/);
}
async function startupFailure(code, expected, configure) {
  const options = await fixture();
  if (configure) {
    const config = JSON.parse(await readFile(options.config, 'utf8'));
    configure(config);
    await writeFile(options.config, JSON.stringify(config));
  }
  await writeFile(options.main, code);
  options.seal = await sealArtifact(options.root);
  let runtime;
  try {
    await assert.rejects(
      async () => {
        runtime = await startNativeWrangler(options);
        await runtime.worker.ready;
      },
      (error) => {
        assert.match(causes(error), expected);
        if (!runtime) console.error(error.message);
        return true;
      }
    );
  } finally {
    // Without a returned Worker, teardown custody is unknown. Preserve evidence;
    // outstanding SDK work must fail the existing CI watchdog, never fake PASS.
    if (runtime) await close(runtime, options);
  }
}
if (process.env.NATIVE_FIXTURE_CASE) {
  await assertChildTempIsolation();
  assert.ok(Object.hasOwn(cases, process.env.NATIVE_FIXTURE_CASE));
  await cases[process.env.NATIVE_FIXTURE_CASE]();
} else {
  for (const name of Object.keys(cases)) {
    test(`public SDK isolated ${name}`, { timeout: 30000 }, async (t) => {
      const cwd = await mkdtemp(join(tmpdir(), 'native-sdk-testcwd-'));
      const tempRoot = join(await realpath(cwd), 'native-sdk-temp');
      await mkdir(tempRoot);
      const stale = join(cwd, '.wrangler/tmp/dev-stale');
      await mkdir(stale, { recursive: true });
      await writeFile(join(stale, 'sentinel'), 'unrelated-stale-scratch');
      await utimes(stale, new Date(0), new Date(0));
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd,
        env: {
          ...process.env,
          NATIVE_FIXTURE_CASE: name,
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
      });
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          if (code === 0 && signal === null) resolve();
          else
            reject(
              new Error(
                `SDK child failed: code=${code}, signal=${signal}; cwd retained: ${cwd}`
              )
            );
        });
      });
      assert.equal(
        await readFile(join(stale, 'sentinel'), 'utf8'),
        'unrelated-stale-scratch'
      );
      if (name === 'positive' || name === 'preload') {
        assert.deepEqual(
          await readdir(tempRoot),
          [],
          `SDK temporary residuals retained: ${tempRoot}`
        );
        await rm(cwd, { recursive: true });
      } else {
        t.diagnostic(
          `Negative-case evidence retained: ${cwd}; SDK siblings: ${(await readdir(tempRoot)).length}`
        );
      }
    });
  }
}
