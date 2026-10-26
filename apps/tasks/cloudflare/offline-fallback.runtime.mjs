// Emitted-runtime regression for the Tasks offline fallback, run on the
// sealed native build (`test:runtime`). The offline worker precaches the exact
// /offline.html, so the Worker must answer it and its stylesheet with 200 and
// their exact bytes, with every outbound request denied. The app's asset
// fetch follows redirects, which would hide a redirecting asset policy, so a
// probe Worker also reads the ASSETS binding directly (redirect: 'manual')
// under the sealed config's assets block, and a negative control proves the
// default html_handling redirects /offline.html to /offline.
import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
const ROOT_HOST = 'tasks.tuturuuu.com';
const EXACT_ASSETS = [
  ['/offline.html', /^text\/html\b/u],
  ['/offline.css', /^text\/css\b/u],
];

// Reads the ASSETS binding directly, without following redirects.
const ASSET_PROBE = `export default {
  fetch(request, env) {
    return env.ASSETS.fetch(new Request(request.url, { redirect: 'manual' }));
  },
};
`;

function get(origin, path) {
  return new Promise((resolve, reject) => {
    httpRequest(
      {
        host: origin.hostname,
        port: origin.port,
        path,
        // Tasks is root-only: probes carry the canonical Host (fetch() drops it).
        headers: { host: ROOT_HOST },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    )
      .on('error', reject)
      .end();
  });
}

async function expectExactAssets(origin) {
  for (const [path, type] of EXACT_ASSETS) {
    const response = await get(origin, path);
    assert.equal(response.status, 200, `${path} must not redirect`);
    assert.equal(response.headers.location, undefined, path);
    assert.match(response.headers['content-type'] ?? '', type, path);
    assert.deepEqual(
      response.body,
      await readFile(join(app, 'dist/client', path)),
      `${path} bytes`
    );
  }
}

test('emitted Tasks Worker serves the exact offline fallback URLs', {
  timeout: 180000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Run only after the native build, never as a source-only unit test'
  );
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.assets.html_handling, 'none');

  // A disposable copy, so runtime state never touches the sealed output.
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'tasks-offline-'))
  );
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const scratchConfig = join(scratch, relative(app, configPath));
  const egress = [];

  async function start(config, name) {
    const registry = join(scratch, `registry-${name}`);
    await mkdir(registry, { mode: 0o700 });
    const worker = await require('wrangler').unstable_startWorker({
      config,
      envFiles: [envFile],
      sendMetrics: false,
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth is forbidden in this runtime test');
        },
        outboundService: (request) => {
          egress.push(new URL(request.url).origin);
          return new Response('denied by the runtime test', { status: 599 });
        },
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    return new URL((await worker.url).origin);
  }

  // The probe keeps the sealed config's exact assets block; only `main`
  // changes, and the negative control also drops html_handling.
  async function probeConfig(name, assets) {
    const dir = join(scratchConfig, '..');
    await writeFile(join(dir, `${name}.mjs`), ASSET_PROBE);
    const probe = join(dir, `${name}.json`);
    await writeFile(
      probe,
      JSON.stringify({ ...config, name, main: `${name}.mjs`, assets })
    );
    return probe;
  }

  await t.test('the Worker answers them with their exact bytes', async () => {
    await expectExactAssets(await start(scratchConfig, 'app'));
  });

  await t.test(
    'the sealed asset policy serves them without a redirect',
    async () => {
      const probe = await probeConfig('asset-probe', config.assets);
      await expectExactAssets(await start(probe, 'probe'));
    }
  );

  await t.test(
    'negative control: the default html_handling redirects /offline.html',
    async () => {
      const { html_handling: _, ...assets } = config.assets;
      const probe = await probeConfig('asset-probe-default', assets);
      const response = await get(
        await start(probe, 'default'),
        '/offline.html'
      );
      assert.equal(response.status, 307);
      assert.match(response.headers.location ?? '', /\/offline$/u);
    }
  );

  assert.deepEqual(egress, []);
});
