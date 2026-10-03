const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadBindings, transform } = require('next/dist/build/swc');

const configPath = path.resolve(__dirname, '../../apps/lettin/next.config.ts');
async function compile(source) {
  await loadBindings();
  return (
    await transform(source, {
      filename: configPath,
      jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
      module: { type: 'commonjs' },
    })
  ).code;
}
function load(code, mode, initialize) {
  const exports = {};
  const mocks = {
    '@opennextjs/cloudflare': { initOpenNextCloudflareForDev: initialize },
    '@tuturuuu/utils/next-config': {
      createTuturuuuNextConfig: (config) => config,
      resolveTuturuuuWebAppUrl: () => 'https://fixture.test',
      createTuturuuuWebWorkspaceApiRewrites: (web) => [
        { source: '/workspace', web },
      ],
    },
    'next-intl/plugin': () => (config) => config,
  };
  vm.runInNewContext(code, {
    exports,
    module: { exports },
    process: { env: { NODE_ENV: mode } },
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), name);
      return mocks[name];
    },
  });
  return exports.default;
}

test('Next CommonJS config loading awaits dev bindings before returning unchanged rewrites', async () => {
  const code = await compile(fs.readFileSync(configPath, 'utf8'));
  let release;
  let calls = 0;
  const initialize = () => {
    calls += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const factory = load(code, 'development', initialize);
  assert.equal(calls, 0);
  let settled = false;
  const pending = factory().then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(settled, false);
  release();
  const config = await pending;
  const rewrites = await config.rewrites();
  assert.equal(rewrites.beforeFiles.length, 0);
  assert.equal(rewrites.afterFiles[0].web, 'https://fixture.test');
  assert.equal(
    rewrites.fallback[0].destination,
    'https://fixture.test/api/:path*'
  );
  const production = await load(code, 'production', () => {
    throw new Error(
      'Production must not start the local Cloudflare dev proxy.'
    );
  })();
  assert.equal(typeof production.rewrites, 'function');
});

test('the former module-scope await fails the same CommonJS loader', async () => {
  const code = await compile(
    "if (process.env.NODE_ENV === 'development') { await initialize(); }"
  );
  assert.throws(
    () =>
      vm.runInNewContext(code, {
        process: { env: { NODE_ENV: 'development' } },
        initialize: () => Promise.resolve(),
      }),
    /await|Unexpected|reserved/u
  );
});
