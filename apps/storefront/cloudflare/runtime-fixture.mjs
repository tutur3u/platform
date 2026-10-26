import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

export async function startFixtureWorker(
  t,
  { bindings = {}, outboundService } = {}
) {
  assert.equal(process.env.CI, 'true', 'Requires an emitted native artifact');
  const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const { configPath, config } = readNativeRuntimeConfig(app);
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'storefront-policy-'))
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
  const require = createRequire(join(app, 'package.json'));
  const worker = await require('wrangler').unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: Object.fromEntries(
      Object.entries({
        INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
        ...bindings,
      }).map(([key, value]) => [key, { type: 'plain_text', value }])
    ),
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
      auth() {
        throw new Error('Provider authentication is forbidden');
      },
      outboundService:
        outboundService ??
        (() => new Response('fixture denial', { status: 401 })),
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const origin = (await worker.url).origin;
  return {
    config,
    origin,
    request(
      path,
      { method = 'GET', headers = {}, host = 'store.tuturuuu.com' } = {}
    ) {
      return new Promise((resolve, reject) => {
        const target = new URL(path, origin);
        const req = httpRequest(
          {
            hostname: target.hostname,
            port: target.port,
            path: target.pathname + target.search,
            method,
            headers: { ...headers, host },
          },
          (res) => {
            res.resume();
            res.on('end', () =>
              resolve({ status: res.statusCode, headers: res.headers })
            );
          }
        );
        req.on('error', reject);
        req.end();
      });
    },
  };
}
