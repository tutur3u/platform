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
const storeClient = fileURLToPath(
  new URL(
    '../../../../packages/utils/src/mastermind-store/client.ts',
    import.meta.url
  )
);

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

async function startScratchWorker(t, scratch, outboundService) {
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
      outboundService,
    },
  });
  t.after(() => instance.dispose());
  await instance.ready;
  return (await instance.url).origin;
}

test(
  'Workers fetch drops cache modes workerd rejects',
  { timeout: 120_000 },
  async (t) => {
    const scratch = await mkdtemp(join(tmpdir(), 'web-vinext-fetch-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await writeFile(join(scratch, 'worker.ts'), worker);
    const seen = [];
    const origin = await startScratchWorker(t, scratch, (request) => {
      seen.push(request.url);
      return new Response('origin body', { status: 200 });
    });
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

// Secrets reach server code through process.env (as a whole object and by a
// dynamic key) without a declaration in cloudflare.config.ts, and
// `redirect: 'error'` fetches work through the installed fetch and through a
// patch assigned after it, which rebuilds a Request from the init as vinext's
// caching fetch does.
const redirectWorker = `
import { installWorkersFetch } from ${JSON.stringify(wrapper)};
import { configuredMastermindStore } from ${JSON.stringify(storeClient)};

installWorkersFetch();
const network = globalThis.fetch;
globalThis.fetch = (input, init) => network(new Request(input, init));

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/env') {
        const name = url.searchParams.get('name');
        return Response.json({
          store: configuredMastermindStore() !== null,
          dynamic: process.env[name] === url.searchParams.get('expect'),
          listed: Object.keys(process.env).includes(name),
        });
      }
      if (url.pathname === '/store') {
        const store = configuredMastermindStore();
        return Response.json({
          set: await store.set('fleet:nonce', '1', { ttlMs: 1000, nx: true }),
        });
      }
      const response = await fetch('https://origin.test' + url.pathname, {
        redirect: 'error',
      });
      return new Response(await response.text(), { status: response.status });
    } catch (error) {
      return new Response(String(error), { status: 500 });
    }
  },
};
`;

test(
  'Workers runtime exposes undeclared secrets and emulates redirect error',
  { timeout: 120_000 },
  async (t) => {
    const scratch = await mkdtemp(join(tmpdir(), 'web-vinext-redirect-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await writeFile(join(scratch, 'worker.ts'), redirectWorker);
    // Disposable fixture values, bound as secrets that no config declares.
    const token = 'fixture-store-token-0123456789abcdef';
    await writeFile(
      join(scratch, '.dev.vars'),
      `MASTERMIND_STORE_URL=https://store.test\nMASTERMIND_STORE_TOKEN=${token}\n`
    );
    const seen = [];
    const origin = await startScratchWorker(t, scratch, async (request) => {
      const url = new URL(request.url);
      seen.push(`${request.method} ${url.host}${url.pathname}`);
      if (url.host === 'store.test') {
        assert.equal(request.headers.get('authorization'), `Bearer ${token}`);
        return Response.json({ ok: true, results: [true] });
      }
      if (url.pathname === '/moved') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://elsewhere.test/' },
        });
      }
      return new Response('origin body', { status: 200 });
    });
    const call = async (path) => {
      const response = await fetch(`${origin}${path}`);
      return { status: response.status, body: await response.text() };
    };

    const env = await call(
      `/env?name=MASTERMIND_STORE_TOKEN&expect=${encodeURIComponent(token)}`
    );
    assert.deepEqual(JSON.parse(env.body), {
      store: true,
      dynamic: true,
      listed: true,
    });
    assert.deepEqual(await call('/store'), {
      status: 200,
      body: JSON.stringify({ set: true }),
    });
    assert.deepEqual(await call('/data'), {
      status: 200,
      body: 'origin body',
    });
    const moved = await call('/moved');
    assert.equal(moved.status, 500);
    assert.match(moved.body, /^TypeError: fetch failed: redirect/u);
    assert.deepEqual(seen, [
      'POST store.test/v1/ops',
      'GET origin.test/data',
      'GET origin.test/moved',
    ]);
  }
);
