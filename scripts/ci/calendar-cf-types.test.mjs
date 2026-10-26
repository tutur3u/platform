import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { calendarDirectory, calendarFixture } from './calendar-cf-fixture.mjs';
import {
  generateCalendarTypes,
  requireSupportedNode,
} from './calendar-cf-types.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sha = 'a'.repeat(40);
const original =
  '/// unchanged declaration\ninterface CloudflareEnv { ASSETS: Fetcher; }\n';
const generated = `type Config = import("cf/config").UnwrapConfig<typeof import("../../cloudflare.config").default>;
type Worker = import("cf/config").UnwrapConfig<Config["worker"]>;
type BindingEnv = import("cf/config").InferEnv<Worker>;
declare namespace Cloudflare { interface Env extends BindingEnv {} }
interface Env extends Cloudflare.Env {}
`;

function fixture(t) {
  const app = calendarFixture(t, 'calendar-cf-types-');
  const put = (name, value) => {
    const path = join(app, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
    return path;
  };
  cpSync(join(root, 'apps/calendar/package.json'), join(app, 'package.json'));
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  };
  put('.void/preview-deploy-config.json', {
    configPath: '../../dist/server/config.json',
    auxiliaryWorkers: [],
  });
  const configPath = put('dist/server/config.json', config);
  const main = put(
    'dist/server/worker.js',
    'export default { fetch() { return new Response("fixture"); } };'
  );
  put('dist/client/serwist/sw.js', 'self.addEventListener("fetch", () => {});');
  const output = put('cloudflare-env.d.ts', original);
  const referencePath = put('reference.d.ts', original);
  const calls = [];
  const execute = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[1] === 'workers') {
      assert.deepEqual(args.slice(1), [
        'workers',
        'types',
        '--no-include-runtime',
        '--mode',
        'production',
      ]);
      assert.deepEqual(Object.keys(options.env).sort(), [
        'CF_SEND_TELEMETRY',
        'PATH',
      ]);
      const input = readFileSync(
        join(options.cwd, 'cloudflare.config.ts'),
        'utf8'
      );
      assert.match(input, /tuturuuu-calendar/);
      assert.match(input, /2026-10-19/);
      assert.match(input, /global_fetch_strictly_public/);
      assert.match(input, /workersDev: false/);
      const destination = join(options.cwd, '.cloudflare/types/index.d.ts');
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, generated);
      return { status: 0, signal: null };
    }
    return spawnSync(command, args, options);
  };
  return {
    app,
    put,
    config,
    configPath,
    main,
    output,
    referencePath,
    calls,
    execute,
  };
}

function options(f, overrides = {}) {
  return {
    appDirectory: f.app,
    configPath: f.configPath,
    referencePath: f.referencePath,
    sourceSha: sha,
    execute: f.execute,
    nodeVersion: '24.22.0',
    ...overrides,
  };
}

test('supported executors match the pinned cf engine range', () => {
  for (const version of ['22.23.0', '24.22.0', '26.12.0'])
    requireSupportedNode(version);
  for (const version of ['20.19.0', '22.22.0', '24.21.0', '26.4.0', '28.0.0'])
    assert.throws(() => requireSupportedNode(version), /requires Node/);
});

test('cf inferred bindings and reference agree; only the standalone declaration changes', (t) => {
  const f = fixture(t);
  const receipt = generateCalendarTypes(options(f));
  assert.equal(receipt.referenceCompared, true);
  assert.equal(receipt.runtimeTypes, false);
  assert.equal(receipt.artifactBefore, receipt.artifactAfter);
  assert.equal(receipt.sourceSha, sha);
  const declaration = readFileSync(f.output, 'utf8');
  assert.match(declaration, /interface CloudflareEnv extends __CalendarEnv/);
  assert.match(declaration, /import\("\.\/dist\/server\/worker\.js"\)/);
  assert.doesNotMatch(
    declaration,
    /cf\/config|\.cloudflare|UnwrapConfig|calendar-types-/
  );
  assert.equal(f.calls.length, 2);
  assert.deepEqual(readdirSync(join(f.app, '.cloudflare')), []);
});

for (const [label, fields] of [
  ['variables', { vars: { EXTRA: 'value' } }],
  ['secrets', { secrets: { required: ['TOKEN'] } }],
  [
    'additional resource',
    { d1_databases: [{ binding: 'DB', database_id: 'id' }] },
  ],
  ['unqualified field', { future_resource: { binding: 'EXTRA' } }],
]) {
  test(`unqualified ${label} refuses before invoking cf`, (t) => {
    const f = fixture(t);
    f.put('dist/server/config.json', { ...f.config, ...fields });
    assert.throws(() => generateCalendarTypes(options(f)));
    assert.equal(f.calls.length, 0);
    assert.equal(readFileSync(f.output, 'utf8'), original);
  });
}

for (const mode of ['partial', 'missing', 'empty', 'symlink']) {
  test(`cf ${mode} output cannot replace the prior declaration`, (t) => {
    const f = fixture(t);
    const execute = (command, args, opts) => {
      const result = f.execute(command, args, opts);
      const output = join(opts.cwd, '.cloudflare/types/index.d.ts');
      if (mode === 'partial') return { status: 17, signal: null };
      if (mode === 'missing') rmSync(output);
      if (mode === 'empty') writeFileSync(output, '');
      if (mode === 'symlink') {
        rmSync(output);
        symlinkSync(f.referencePath, output);
      }
      return result;
    };
    assert.throws(() => generateCalendarTypes(options(f, { execute })));
    assert.equal(readFileSync(f.output, 'utf8'), original);
    assert.deepEqual(readdirSync(join(f.app, '.cloudflare')), []);
  });
}

for (const content of [
  'interface CloudflareEnv { ASSETS: any; }',
  'interface CloudflareEnv { ASSETS?: Fetcher; }',
  'interface CloudflareEnv { ASSETS: Fetcher; EXTRA: string; }',
]) {
  test(`reference binding drift fails parity: ${content}`, (t) => {
    const f = fixture(t);
    writeFileSync(f.referencePath, content);
    assert.throws(
      () => generateCalendarTypes(options(f)),
      /declaration parity failed/
    );
    assert.equal(readFileSync(f.output, 'utf8'), original);
  });
}

for (const fields of [
  'ASSETS: any',
  'ASSETS?: Fetcher',
  'ASSETS: Fetcher; EXTRA: string',
]) {
  test(`cf binding drift fails parity: ${fields}`, (t) => {
    const f = fixture(t);
    const execute = (command, args, opts) => {
      const result = f.execute(command, args, opts);
      if (args[1] === 'workers')
        writeFileSync(
          join(opts.cwd, '.cloudflare/types/index.d.ts'),
          `interface Env { ${fields}; }`
        );
      return result;
    };
    assert.throws(
      () => generateCalendarTypes(options(f, { execute })),
      /declaration parity failed/
    );
    assert.equal(readFileSync(f.output, 'utf8'), original);
  });
}

test('a changed bundle fails before output replacement', (t) => {
  const f = fixture(t);
  const execute = (command, args, opts) => {
    const result = f.execute(command, args, opts);
    if (args[1] === 'workers') writeFileSync(f.main, 'changed artifact');
    return result;
  };
  assert.throws(
    () => generateCalendarTypes(options(f, { execute })),
    /artifact bytes/
  );
  assert.equal(readFileSync(f.output, 'utf8'), original);
});

test('concurrent declaration edits survive a refused generation', (t) => {
  const f = fixture(t);
  const execute = (command, args, opts) => {
    const result = f.execute(command, args, opts);
    if (args[1] === 'workers')
      writeFileSync(f.output, 'concurrent owner bytes');
    return result;
  };
  assert.throws(
    () => generateCalendarTypes(options(f, { execute })),
    /concurrently/
  );
  assert.equal(readFileSync(f.output, 'utf8'), 'concurrent owner bytes');
});

test('publication custody rejects a second generator at the replacement boundary', (t) => {
  const f = fixture(t);
  let attempted = false;
  const replace = (temporary, output) => {
    attempted = true;
    assert.throws(() => generateCalendarTypes(options(f)), /custody is held/);
    assert.equal(readFileSync(output, 'utf8'), original);
    renameSync(temporary, output);
  };
  generateCalendarTypes(options(f, { replace }));
  assert.equal(attempted, true);
  assert.match(
    readFileSync(f.output, 'utf8'),
    /interface CloudflareEnv extends/
  );
  assert.deepEqual(readdirSync(join(f.app, '.cloudflare')), []);
});

test('an existing custody directory is never reclaimed by a generator', (t) => {
  const f = fixture(t);
  const lock = f.put('.cloudflare/calendar-types.lock/owner', 'another owner');
  assert.throws(
    () => generateCalendarTypes(options(f)),
    (error) => {
      assert.ok(
        error.message.includes(join(f.app, '.cloudflare/calendar-types.lock'))
      );
      assert.match(
        error.message,
        /only after confirming no generator is running/
      );
      return true;
    }
  );
  assert.equal(readFileSync(lock, 'utf8'), 'another owner');
  assert.equal(readFileSync(f.output, 'utf8'), original);
  assert.equal(f.calls.length, 0);
});

test('the output has no surviving disposable config dependency', (t) => {
  const f = fixture(t);
  generateCalendarTypes(options(f));
  assert.ok(existsSync(f.output));
  assert.deepEqual(readdirSync(join(f.app, '.cloudflare')), []);
  const restored = calendarFixture(t, 'calendar-cf-types-restored-');
  cpSync(f.app, restored, { recursive: true });
  assert.match(
    readFileSync(join(restored, 'cloudflare-env.d.ts'), 'utf8'),
    /import\("\.\/dist\/server\/worker\.js"\)/
  );
  const require = createRequire(join(calendarDirectory, 'package.json'));
  const tsPath = require.resolve('typescript/package.json');
  const ts = JSON.parse(readFileSync(tsPath, 'utf8'));
  writeFileSync(
    join(restored, 'restored-proof.ts'),
    'declare const env: CloudflareEnv;\nconst assets: Fetcher = env.ASSETS;\nvoid assets;\n'
  );
  const compiled = spawnSync(
    process.execPath,
    [
      resolveCompiler(tsPath, ts.bin.tsc),
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--lib',
      'ESNext',
      require.resolve('@cloudflare/workers-types/index.d.ts'),
      join(restored, 'cloudflare-env.d.ts'),
      join(restored, 'restored-proof.ts'),
    ],
    { cwd: restored, encoding: 'utf8' }
  );
  assert.ifError(compiled.error);
  assert.equal(compiled.status, 0, compiled.stdout);
});

function resolveCompiler(metadataPath, bin) {
  return join(dirname(metadataPath), bin);
}
