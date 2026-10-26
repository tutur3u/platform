// Emitted-runtime regression for the Tasks offline fallback, run on the
// sealed native build (`test:runtime`): the offline worker precaches the exact
// /offline.html, so the Worker must answer it and its stylesheet with 200 and
// their exact bytes, never a redirect, with every outbound request denied.
// The emitted config must also serve assets with html_handling 'none'.
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

test('emitted Tasks Worker serves the exact offline fallback URLs', {
  timeout: 120000,
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
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });

  const egress = [];
  const worker = await require('wrangler').unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
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
  const origin = new URL((await worker.url).origin);
  // Tasks is root-only: probes carry the canonical Host (fetch() drops it).
  const get = (path) =>
    new Promise((resolve, reject) => {
      httpRequest(
        {
          host: origin.hostname,
          port: origin.port,
          path,
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

  for (const [path, type] of EXACT_ASSETS) {
    const response = await get(path);
    assert.equal(response.status, 200, `${path} must not redirect`);
    assert.equal(response.headers.location, undefined, path);
    assert.match(response.headers['content-type'] ?? '', type, path);
    assert.deepEqual(
      response.body,
      await readFile(join(app, 'dist/client', path)),
      `${path} bytes`
    );
  }
  assert.deepEqual(egress, []);
});
