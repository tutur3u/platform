import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test, { before } from 'node:test';
import * as url from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const SOURCE_PINS = {
  'dist/cli/index.js':
    '85a7a3ac5d5114aba547f1fed5d380930cfedfa01035231bff21cd74b10ff633',
  'dist/cli/commands/deploy.js':
    '3229179147305df654052b50ed0cf405909cabca9a9b1184f1c919fcd5882858',
  'dist/cli/commands/populate-cache.js':
    'd31f16e3e323e82039eeece2c63cc4a678b085a3bed2b3e086a8b4d58ac4560b',
  'dist/cli/commands/utils/utils.js':
    '84ebce56ddca1b3f3870bcb696bdd94a3ac65cb33e813c0ec10090870181b7f0',
  'dist/api/overrides/internal.js':
    'cc1200409d41cbae4cc6b2a2b1602fbaa625e67b68c539eb02a6f0ac8ae743b7',
  'dist/api/overrides/incremental-cache/kv-incremental-cache.js':
    'a4c6ec2093385959f3062587c2ce4e98d800d54a010b8c49e547439edc9e19c7',
  'dist/api/overrides/incremental-cache/r2-incremental-cache.js':
    'd4b613f3a5994856ef1ebd40926c48503e932b1b53fb732723074d70bd7f7b4d',
  'dist/api/overrides/incremental-cache/static-assets-incremental-cache.js':
    '97824d26c96cdbd4e582977174b359ce87b74e260b0751f2a44adfa4d9721d3d',
  'dist/api/overrides/tag-cache/d1-next-tag-cache.js':
    '6f48ac19b4b43aa67f7cbd297661738518a15f586ab2e40e437ffd12817d0d69',
};
const sources = new Map();
let sourceRoot;
let yargs;

function supplier(variable, name, version) {
  const root = process.env[variable];
  assert.ok(root && path.isAbsolute(root), `${variable} requires an explicit supplier`);
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(metadata.name, name);
  assert.equal(metadata.version, version);
  return root;
}

before(async () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Use admitted Node 24');
  sourceRoot = supplier('OPENNEXT_R2_SOURCE_ROOT', '@opennextjs/cloudflare', '1.20.6');
  for (const [name, pin] of Object.entries(SOURCE_PINS)) {
    const bytes = fs.readFileSync(path.join(sourceRoot, name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin, name);
    sources.set(name, bytes.toString('utf8'));
  }
  const parserRoot = supplier('OPENNEXT_R2_YARGS_ROOT', 'yargs', '18.2.0');
  assert.equal(
    createHash('sha256')
      .update(fs.readFileSync(path.join(parserRoot, 'index.mjs')))
      .digest('hex'),
    '02e7530ca923bf1af2d3ab28f3a0da83324cc7812e072919badd6d75c7f20462'
  );
  // Only the explicitly supplied locked parser loads normally; Wrangler never loads.
  yargs = (await import(url.pathToFileURL(path.join(parserRoot, 'index.mjs')).href)).default;
}, { timeout: 10_000 });

const unused = () => {
  throw new Error('Unexpected synthetic dependency call');
};

function constants(name) {
  return Object.fromEntries(Array.from(sources.get(name).matchAll(
    /^export const (\w+) = ("[^"]*");$/gm
  ), ([, key, value]) => [key, JSON.parse(value)]));
}

function graph(context, actual, replacements) {
  const modules = new Map();
  function get(name) {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (actual.has(name)) {
      assert.ok(sources.has(name), `Unpinned source: ${name}`);
      module = new SourceTextModule(sources.get(name), {
        context,
        identifier: name,
        initializeImportMeta(meta) {
          meta.url = url.pathToFileURL(path.join(sourceRoot, name)).href;
        },
        importModuleDynamically: unused,
      });
    } else {
      assert.ok(replacements.has(name), `Unadmitted module: ${name}`);
      const exports = replacements.get(name);
      module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier: name });
    }
    modules.set(name, module);
    return module;
  }
  return {
    modules,
    async evaluate(entry) {
      const module = get(entry);
      // The VM links the complete graph; the linker only returns cached modules.
      await module.link((specifier, parent) => get(specifier.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
        : specifier));
      await module.evaluate();
      return module.namespace;
    },
  };
}

async function harness(t, { count = 1, mode = 'success', serial = true, args = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-publisher-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, 'output');
  const files = [];
  const expected = new Map();
  for (let index = 0; index < count; index++) {
    const isFetch = index === count - 1;
    const key = `/entry-${index}`;
    const filename = path.join(outputDir, 'cache', ...(isFetch ? ['__fetch'] : []),
      'fixture-build', `entry-${index}${isFetch ? '' : '.cache'}`);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const body = JSON.stringify({ type: 'app', html: `fixture-${index}` });
    fs.writeFileSync(filename, body);
    files.push(filename);
    const hash = createHash('sha256').update(key).digest('hex');
    expected.set(`incremental-cache/fixture-build/${hash}.${isFetch ? 'fetch' : 'cache'}`, body);
  }
  if (mode === 'invalid-asset') files.push(path.join(outputDir, 'cache', 'invalid.txt'));
  // Counts simulated caller fetches, not provider-side work or cancellation.
  const state = {
    events: [], attempts: [], delays: [], logs: [], writes: new Map(),
    active: 0, maximum: 0, starts: 0, disposals: 0, expected,
  };
  const logger = Object.fromEntries(['info', 'error', 'warn', 'setLevel'].map((name) =>
    [name, (...values) => state.logs.push([name, ...values])]));
  const r2 = constants('dist/api/overrides/incremental-cache/r2-incremental-cache.js');
  const tag = constants('dist/api/overrides/tag-cache/d1-next-tag-cache.js');
  const config = { default: { override: {
    incrementalCache: r2.NAME,
    ...(mode === 'tag' ? { tagCache: tag.NAME } : {}),
  } };
  const binding = { binding: r2.BINDING_NAME, bucket_name: 'fixture-cache' };
  if (mode === 'bucket-name') delete binding.bucket_name;
  const wranglerConfig = { r2_buckets: mode === 'binding' ? [] : [binding],
    d1_databases: [{ binding: tag.BINDING_NAME }] };
  const buildOpts = { appPath: root,
    outputDir: mode === 'missing-build' ? path.join(root, 'absent') : outputDir };
  const processFixture = {
    argv: ['node', 'opennextjs-cloudflare', 'deploy', '--',
      ...(serial ? ['--cacheChunkSize', '1'] : []), ...args],
    env: {}, cwd: () => root,
    exit: (code) => { throw new Error(`fixture exit ${code}`); },
  };
  const context = createContext({
    process: processFixture, Error, Buffer, URL, console: { log: unused },
    AbortSignal: { timeout: (milliseconds) => ({ milliseconds }) },
    fetch: async (target, request) => {
      assert.equal(target, 'http://publisher.invalid/populate');
      assert.equal(request.method, 'POST');
      assert.equal(request.signal.milliseconds, 60_000);
      const key = request.headers['x-opennext-cache-key'];
      const attempt = { key, body: '', signal: request.signal, stream: request.body };
      state.attempts.push(attempt);
      state.active++;
      state.maximum = Math.max(state.maximum, state.active);
      try {
        attempt.body = await new Response(request.body).text();
        assert.equal(Number(request.headers['content-length']), Buffer.byteLength(attempt.body));
        await new Promise(setImmediate);
        if (mode === 'timeout' || (mode === 'recover' && state.attempts.length === 1)) {
          throw new Error('The operation was aborted due to timeout');
        }
        let status = 200;
        let body = '{"success":true}';
        if (mode === 'auth') { status = 403; body = '{"success":false,"error":"denied"}'; }
        if (mode === 'unauthorized') { status = 401; body = '{"success":false,"error":"denied"}'; }
        if (mode === 'invalid-response') { status = 418; body = 'not json'; }
        if (mode === 'helper-binding') {
          status = 500;
          body = '{"success":false,"error":"binding missing","code":"ERR_BINDING_NOT_FOUND"}';
        }
        if (status === 200) {
          state.writes.set(key, attempt.body);
          state.events.push('object');
        }
        return { status, statusText: 'fixture', text: async () => body };
      } finally {
        state.active--;
      }
    },
  });
  const dependencies = new Map([
    ['node:fs', { default: fs, existsSync: fs.existsSync }],
    ['node:fs/promises', { default: fsp }], ['node:os', { default: os }],
    ['node:path', { default: path }], ['node:url', { ...url, default: url }],
    ['node:stream', { Readable }], ['node:crypto', { createHash }],
    ['node:module', { createRequire: unused }],
    ['node:timers/promises', { setTimeout: async (delay) => state.delays.push(delay) }],
    ['@opennextjs/aws/logger.js', { default: logger }],
    ['@opennextjs/aws/adapters/logger.js', { error: unused }],
    ['@opennextjs/aws/build/compileConfig.js', { compileOpenNextConfig: unused }],
    ['@opennextjs/aws/build/helper.js', { normalizeOptions: unused }],
    ['@opennextjs/aws/build/utils.js', { printHeader: unused, showWarningOnWindows: unused }],
    ['wrangler', {
      unstable_readConfig: unused,
      unstable_startWorker: async (options) => {
        assert.equal(options.dev.remote, true);
        assert.equal(options.bindings.R2.bucket_name, 'fixture-cache');
        state.starts++;
        return { url: Promise.resolve('http://publisher.invalid'),
          dispose: async () => { state.disposals++; state.events.push('dispose'); } };
      },
    }],
    ['glob', { globSync: () => files.map((filename) => ({
      isFile: () => true, fullpath: () => filename,
    })) }], ['ts-tqdm', { tqdm: (items) => items }],
    ['dist/api/cloudflare-context.js', { getCloudflareContext: unused }],
    ['dist/cli/build/utils/ensure-cf-config.js', { ensureCloudflareConfig: unused }],
    ['dist/cli/utils/ask-confirmation.js', { askConfirmation: unused }],
    ['dist/cli/utils/create-open-next-config.js', { createOpenNextConfigFile: unused,
      findOpenNextConfig: unused, OPEN_NEXT_CONFIG_FILE_NAME: 'fixture.config.ts' }],
    ['dist/cli/utils/is-interactive.js', { isNonInteractiveOrCI: unused }],
  ]);
  const utilsName = 'dist/cli/commands/utils/utils.js';
  const utilities = await graph(context, new Set([utilsName]), dependencies).evaluate(utilsName);
  dependencies.set(utilsName, {
    withWranglerOptions: utilities.withWranglerOptions,
    withWranglerPassthroughArgs: utilities.withWranglerPassthroughArgs,
    retrieveCompiledConfig: async () => ({ config }),
    getNormalizedOptions: () => buildOpts,
    readWranglerConfig: async () => wranglerConfig,
    printHeaders: () => {},
  });
  for (const name of Object.keys(SOURCE_PINS).filter((name) => name.includes('-cache.js'))) {
    if (name.startsWith('dist/api/overrides/')) dependencies.set(name, constants(name));
  }
  dependencies.set('dist/cli/utils/normalize-path.js', { normalizePath: (value) => value.split(path.sep).join('/') });
  dependencies.set('dist/cli/utils/ensure-r2-bucket.js', { ensureR2Bucket: async () => ({ success: mode !== 'provision', error: 'fixture provisioning failure' }) });
  dependencies.set('dist/cli/commands/utils/helpers.js', {
    getEnvFromPlatformProxy: async () => ({}), quoteShellMeta: (value) => value,
  });
  dependencies.set('dist/cli/commands/utils/run-wrangler.js', {
    runWrangler: (_options, argv) => {
      const operation = argv[0] === 'deploy' ? 'deploy' : 'tag';
      state.events.push(operation);
      if (operation === 'deploy') {
        assert.deepEqual(state.writes, expected);
        state.deployArgs = Array.from(argv);
        assert.equal(state.active, 0);
      }
      return { success: mode !== operation, stderr: `fixture ${operation} result` };
    },
  });
  dependencies.set('dist/cli/commands/skew-protection.js', { getDeploymentMapping: async () => {
    state.events.push('mapping');
    if (mode === 'mapping') throw new Error('fixture mapping failure');
    return undefined;
  } });
  dependencies.set('dist/cli/templates/skew-protection.js', { DEPLOYMENT_MAPPING_ENV_NAME: 'FIXTURE_MAPPING' });
  dependencies.set('dist/cli/build/utils/version.js', { getVersion: () => ({ cloudflare: '1.20.6' }) });
  dependencies.set('yargs', { default: yargs });
  for (const command of ['build', 'migrate', 'preview', 'upload']) {
    const name = `add${command[0].toUpperCase()}${command.slice(1)}Command`;
    dependencies.set(`dist/cli/commands/${command}.js`, { [name]: () => {} });
  }
  const actual = new Set(['dist/cli/index.js', 'dist/cli/commands/deploy.js',
    'dist/cli/commands/populate-cache.js', 'dist/api/overrides/internal.js']);
  const cli = graph(context, actual, dependencies);
  return { state, run: () => cli.evaluate('dist/cli/index.js') };
}

test('actual CLI defaults to 25 tasks; serial option preserves every key/body and deploy order', { timeout: 10_000 }, async (t) => {
  const baseline = await harness(t, { count: 31, serial: false });
  const candidate = await harness(t, { count: 31 });
  for (const control of [baseline, candidate]) {
    await control.run();
    const { state } = control;
    assert.deepEqual(state.writes, state.expected);
    assert.equal(state.attempts.length, 31);
    assert.equal(new Set(state.attempts.map(({ key }) => key)).size, 31);
    assert.deepEqual(state.events.slice(-3), ['dispose', 'mapping', 'deploy']);
    assert.equal(state.starts, 1);
    assert.equal(state.disposals, 1);
  }
  assert.equal(baseline.state.maximum, 25);
  assert.equal(candidate.state.maximum, 1);
  assert.deepEqual(candidate.state.writes, baseline.state.writes);
});

for (const passthrough of [['--message', 'fixture-sha'], ['--message', 'fixture-sha', '--tag', 'fixture-sha']]) {
  test(`real parser consumes cacheChunkSize and preserves ${passthrough.join(' ')}`, { timeout: 10_000 }, async (t) => {
    const control = await harness(t, { count: 3, args: passthrough });
    await control.run();
    assert.equal(control.state.maximum, 1);
    assert.deepEqual(control.state.deployArgs, ['deploy', ...passthrough]);
  });
}

test('one timeout retries the same bytes with a fresh stream/signal before deployment', { timeout: 10_000 }, async (t) => {
  const { state, run } = await harness(t, { mode: 'recover' });
  await run();
  assert.equal(state.attempts.length, 2);
  const [first, second] = state.attempts;
  assert.equal(first.key, second.key);
  assert.equal(first.body, second.body);
  assert.notEqual(first.stream, second.stream);
  assert.notEqual(first.signal, second.signal);
  assert.deepEqual(state.delays, [250]);
  assert.deepEqual(state.writes, state.expected);
});

test('persistent timeout is bounded by 15 attempts and exponential delays, then refuses deploy', { timeout: 10_000 }, async (t) => {
  const { state, run } = await harness(t, { mode: 'timeout' });
  await assert.rejects(run, /after 15 attempts/);
  assert.equal(state.attempts.length, 15);
  assert.equal(state.delays.length, 14);
  assert.equal(state.delays[0], 250);
  const factor = (10_000 / 250) ** (1 / 14);
  state.delays.forEach((delay, index) => {
    assert.ok(Math.abs(delay - 250 * factor ** index) < 1e-7);
    assert.ok(delay <= 10_000);
  });
  assert.equal(new Set(state.attempts.map(({ signal }) => signal)).size, 15);
  assert.equal(state.disposals, 1);
  assert.equal(state.events.includes('deploy'), false);
});

for (const [mode, attempts, starts, failure] of [
  ['auth', 1, 1, /Failed to populate remote R2 bucket/],
  ['unauthorized', 1, 1, /Failed to populate remote R2 bucket/],
  ['invalid-response', 1, 1, /Failed to populate remote R2 bucket/],
  ['helper-binding', 15, 1, /after 15 attempts/],
  ['binding', 0, 0, /No R2 binding/],
  ['bucket-name', 0, 0, /missing a bucket_name/],
  ['provision', 0, 0, /Failed to provision remote R2 bucket/],
  ['missing-build', 0, 0, /Open Next build not found/],
  ['invalid-asset', 0, 0, /Invalid path for a Cache Asset/],
  ['tag', 1, 1, /Wrangler d1 execute command failed/],
  ['mapping', 1, 1, /fixture mapping failure/],
]) {
  test(`${mode} remains fatal and cannot publish a Worker`, { timeout: 10_000 }, async (t) => {
    const { state, run } = await harness(t, { mode });
    await assert.rejects(run, failure);
    assert.equal(state.attempts.length, attempts);
    assert.equal(state.starts, starts);
    assert.equal(state.disposals, starts);
    assert.equal(state.events.includes('deploy'), false);
  });
}

test('required Worker deployment failure remains fatal after successful population', { timeout: 10_000 }, async (t) => {
  const { state, run } = await harness(t, { mode: 'deploy' });
  await assert.rejects(run, /fixture exit 1/);
  assert.deepEqual(state.writes, state.expected);
  assert.equal(state.events.at(-1), 'deploy');
  assert.equal(state.disposals, 1);
});
