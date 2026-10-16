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
const adapterRequire = createRequire(
  pathToFileURL(resolve(adapter, 'package.json'))
);
const { patchCode } = await import(
  pathToFileURL(
    adapterRequire.resolve('@opennextjs/aws/build/patch/astCodePatcher.js')
  )
);
const { createComposableCacheHandlersRule } = await import(
  pathToFileURL(
    resolve(adapter, 'dist/cli/build/patches/plugins/next-server.js')
  )
);

for (const runtime of ['app-route-turbo', 'app-page-turbo']) {
  test(`Lettin ${runtime} cache initialization stops before the original dynamic loader`, async () => {
    const source = readFileSync(
      require.resolve(
        `next/dist/compiled/next-server/${runtime}.runtime.prod.js`
      ),
      'utf8'
    );
    const start = source.indexOf('async loadCustomCacheHandlers(');
    const end = source.indexOf('async getIncrementalCache(', start);
    assert.ok(
      start >= 0 && end > start,
      'exercise the installed Next production method'
    );
    const patched = patchCode(
      `class Runtime { ${source.slice(start, end)} }`,
      createComposableCacheHandlersRule('/fixture/composable-cache.cjs')
    );
    const handler = {};
    let loads = 0;
    const sandbox = {
      Symbol,
      Map,
      Set,
      require(path) {
        assert.equal(path, '/fixture/composable-cache.cjs');
        loads++;
        return { default: handler };
      },
    };
    runInNewContext(`${patched}; globalThis.runtime = new Runtime();`, sandbox);
    await sandbox.runtime.loadCustomCacheHandlers(
      {},
      {
        cacheMaxMemorySize: 0,
        cacheHandlers: { default: 'None', remote: 'None' },
      }
    );
    const handlers = runInNewContext(
      "globalThis[Symbol.for('@next/cache-handlers-map')]",
      sandbox
    );
    assert.equal(handlers.get('default'), handler);
    assert.equal(handlers.get('remote'), handler);
    assert.deepEqual(
      [
        ...runInNewContext(
          "globalThis[Symbol.for('@next/cache-handlers-set')]",
          sandbox
        ),
      ],
      [handler]
    );
    assert.ok(loads > 0, 'register the real composable cache handler');
  });
}
