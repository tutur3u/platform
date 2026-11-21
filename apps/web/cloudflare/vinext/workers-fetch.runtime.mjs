import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs cloudflare/vinext/workers-fetch.ts in workerd: a `force-cache` fetch
// fails there unless the Workers fetch is installed, and the installed fetch
// reaches the network without the unsupported mode.
const require = createRequire(new URL('../../package.json', import.meta.url));
const { unstable_startWorker: startWorker } = require('wrangler');
const wrapper = fileURLToPath(new URL('./workers-fetch.ts', import.meta.url));

const worker = `
import { installWorkersFetch } from ${JSON.stringify(wrapper)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.searchParams.get('install') === '1') installWorkersFetch();
    try {
      const response = await fetch('https://origin.test/data', {
        cache: url.searchParams.get('cache'),
        next: { revalidate: 60, tags: ['data'] },
      });
      return new Response(await response.text(), { status: response.status });
    } catch (error) {
      return new Response(String(error), { status: 500 });
    }
  },
};
`;

test(
  'Workers fetch drops cache modes workerd rejects',
  { timeout: 120_000 },
  async (t) => {
    const scratch = await mkdtemp(join(tmpdir(), 'web-vinext-fetch-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await writeFile(join(scratch, 'worker.ts'), worker);
    await writeFile(
      join(scratch, 'wrangler.jsonc'),
      JSON.stringify({
        name: 'web-vinext-fetch-runtime',
        main: 'worker.ts',
        // The newest date the pinned wrangler's workerd supports.
        compatibility_date: '2026-10-26',
        compatibility_flags: ['nodejs_compat'],
      })
    );
    const seen = [];
    const instance = await startWorker({
      config: join(scratch, 'wrangler.jsonc'),
      sendMetrics: false,
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        logLevel: 'error',
        generateTypes: false,
        enableContainers: false,
        server: { hostname: '127.0.0.1', port: 0 },
        auth: () => {
          throw new Error('Provider auth is not used by this test');
        },
        outboundService: (request) => {
          seen.push(request.url);
          return new Response('origin body', { status: 200 });
        },
      },
    });
    t.after(() => instance.dispose());
    await instance.ready;
    const origin = (await instance.url).origin;
    const call = async (query) => {
      const response = await fetch(`${origin}/?${query}`);
      return { status: response.status, body: await response.text() };
    };

    const raw = await call('cache=force-cache');
    assert.equal(raw.status, 500);
    assert.match(raw.body, /Unsupported cache mode/u);

    assert.deepEqual(await call('install=1&cache=force-cache'), {
      status: 200,
      body: 'origin body',
    });
    assert.deepEqual(await call('cache=no-store'), {
      status: 200,
      body: 'origin body',
    });
    assert.deepEqual(seen, [
      'https://origin.test/data',
      'https://origin.test/data',
    ]);
  }
);
