import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const adapter = resolve(
  dirname(require.resolve('@opennextjs/cloudflare')),
  '../..'
);
const readAdapter = (file) => readFileSync(resolve(adapter, file), 'utf8');
const patches = await import(
  pathToFileURL(
    resolve(adapter, 'dist/cli/build/patches/plugins/cache-components.js')
  )
);

test('pinned adapter transforms the installed Next CJS and ESM module loading code', () => {
  for (const file of [
    'next/dist/server/app-render/module-loading/track-module-loading.instance.js',
    'next/dist/esm/server/app-render/module-loading/track-module-loading.instance.js',
  ]) {
    const path = require.resolve(file);
    assert.ok(patches.moduleLoadingSignalFileFilter.test(path));
    const patched = patches.patchModuleLoadingSignal(
      readFileSync(path, 'utf8'),
      path
    );
    assert.match(patched, /requestSignals: new WeakMap/);
    assert.match(
      patched,
      /new (?:_cachesignal\.CacheSignal|CacheSignal)\(null\)/,
      'preserve the installed Next constructor arguments'
    );
    assert.match(patched, /__cloudflare-context__/);
    assert.match(patched, /moduleLoadSubscribers\.delete/);
    assert.match(patched, /__openNextTrackModuleLoad/);
  }
  assert.throws(
    () => patches.patchModuleLoadingSignal('function renamed() {}', 'moved.js'),
    /Failed to patch/
  );
});

test('pinned adapter transforms the installed Next production scheduler', () => {
  const path = require.resolve(
    'next/dist/compiled/next-server/app-page-turbo.runtime.prod.js'
  );
  assert.ok(patches.cacheComponentsSchedulerFileFilter.test(path));
  const patched = patches.patchCacheComponentsScheduler(
    readFileSync(path, 'utf8'),
    path
  );
  assert.match(patched, /__opennext_cache_components_scheduler/);
  assert.doesNotMatch(
    patched,
    /Cannot schedule more timers into a group that already executed/
  );
  assert.throws(
    () =>
      patches.patchCacheComponentsScheduler(
        'function renamed() {}',
        'moved.js'
      ),
    /Failed to patch/
  );
});

test('preview preserves both repository PPR resume and manifest fixes', () => {
  assert.match(
    readAdapter('dist/cli/build/bundle-server.js'),
    /keepNames:\s*true/
  );
  assert.match(
    readAdapter('dist/cli/build/patches/plugins/load-manifest.js'),
    /prefetch-hints,preview-props/
  );
});

test('transformed Next signal retains constructor arguments and isolates request subscriptions', async () => {
  const path = require.resolve(
    'next/dist/server/app-render/module-loading/track-module-loading.instance.js'
  );
  const contextKey = Symbol.for('__cloudflare-context__');
  const scopes = [{}, {}];
  const constructors = [];
  class CacheSignal {
    reads = [];
    constructor(value) {
      constructors.push(value);
    }
    trackRead(promise) {
      this.reads.push(promise);
    }
    subscribeToReads() {
      return () => {};
    }
  }
  const exports = {};
  const sandbox = {
    exports,
    Symbol,
    Promise,
    require: () => ({ CacheSignal }),
  };
  sandbox.globalThis = sandbox;
  runInNewContext(
    patches.patchModuleLoadingSignal(readFileSync(path, 'utf8'), path) +
      '\nexports.getSignal = getModuleLoadingSignal;',
    sandbox
  );
  sandbox[contextKey] = scopes[0];
  const first = exports.getSignal();
  assert.equal(first, exports.getSignal());
  let settle;
  const pending = new Promise((resolve) => {
    settle = resolve;
  });
  exports.trackPendingImport(pending);
  sandbox[contextKey] = scopes[1];
  const second = exports.getSignal();
  assert.notEqual(first, second);
  assert.deepEqual(constructors, [null, null]);
  assert.deepEqual(first.reads, [pending]);
  assert.deepEqual(second.reads, [pending]);
  let stop;
  exports.trackPendingModules({
    cacheReady: () =>
      new Promise((resolve) => {
        stop = resolve;
      }),
  });
  assert.equal(
    second.__openNextModuleLoadingRegistry.moduleLoadSubscribers.size,
    1
  );
  stop();
  settle();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    second.__openNextModuleLoadingRegistry.moduleLoadSubscribers.size,
    0
  );
  assert.equal(
    second.__openNextModuleLoadingRegistry.pendingModuleLoads.size,
    0
  );
});
