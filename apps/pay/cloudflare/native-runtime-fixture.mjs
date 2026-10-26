import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

export const app = await realpath(
  fileURLToPath(new URL('../', import.meta.url))
);
export const modes = [
  { origin: 'https://pay.tuturuuu.com', base: '' },
  { origin: 'https://pay-staging.tuturuuu.com', base: '' },
];

export async function payRuntime(t, options = {}) {
  assert.equal(process.env.CI, 'true', 'Requires an emitted native build');
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.name, 'tuturuuu-pay-vite-staging');
  assert.equal(config.no_bundle, true);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.deepEqual(config.compatibility_flags, [
    'nodejs_compat',
    'global_fetch_strictly_public',
  ]);
  const profile = JSON.parse(
    await readFile(join(app, 'cloudflare/staging-profile.json'), 'utf8')
  );
  assert.equal(profile.POLAR_SANDBOX, 'true');
  assert.deepEqual(config.vars, profile);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'pay-native-')));
  let worker;
  t.after(async () => {
    try {
      await worker?.dispose();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  const unexpected = [];
  const fixtureOrigin = 'https://pay-fixture.invalid';
  const plain = (value) => ({ type: 'plain_text', value });
  const secret = randomBytes(32).toString('hex');
  let operations = 0;
  const require = createRequire(join(app, 'package.json'));
  const sdk = require('wrangler');
  worker = await sdk.unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: plain(fixtureOrigin),
      PAY_APP_URL: plain(options.payOrigin),
      POLAR_SANDBOX: plain('true'),
      POLAR_ACCESS_TOKEN: {
        type: 'secret_text',
        value: 'fixture-sandbox-only',
      },
      POLAR_WEBHOOK_SECRET: {
        type: 'secret_text',
        value: Buffer.from(secret).toString('base64'),
      },
      NEXT_PUBLIC_SUPABASE_URL: plain(fixtureOrigin),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('fixture-public-key'),
      SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
      TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
    },
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false,
      origin: { secure: true },
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
        throw new Error('Provider authentication forbidden');
      },
      outboundService: async (request) => {
        assert.ok(++operations <= 100, 'Outbound operation budget exceeded');
        unexpected.push({ method: request.method, url: request.url });
        return new Response('Unadmitted fixture egress', { status: 599 });
      },
    },
  });
  await worker.ready;
  let requests = 0;
  const listener = new URL((await worker.url).origin);
  const rawFetch = async (url, init = {}) => {
    assert.ok(++requests <= 600, 'Runtime request budget exceeded');
    const input = new Request(url, init);
    assert.ok(
      ['GET', 'HEAD'].includes(input.method),
      'Raw Host probes are public reads'
    );
    assert.ok(
      !input.headers.has('cookie') && !input.headers.has('authorization'),
      'Raw Host probes must be anonymous'
    );
    const target = new URL(input.url);
    const body = Buffer.from(await input.arrayBuffer());
    const headers = Object.fromEntries(input.headers);
    headers.host = target.host;
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: listener.hostname,
          port: listener.port,
          path: target.pathname + target.search,
          method: input.method,
          headers,
          signal: t.signal,
        },
        (response) => {
          const chunks = [];
          let bytes = 0;
          response.on('error', reject);
          response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > 16 * 1024 * 1024) {
              response.destroy(
                new Error('Runtime response byte budget exceeded')
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const outputHeaders = new Headers();
            for (
              let index = 0;
              index < response.rawHeaders.length;
              index += 2
            ) {
              outputHeaders.append(
                response.rawHeaders[index],
                response.rawHeaders[index + 1]
              );
            }
            const status = response.statusCode ?? 500;
            resolve(
              new Response(
                input.method === 'HEAD' || [204, 205, 304].includes(status)
                  ? null
                  : Buffer.concat(chunks),
                { status, headers: outputHeaders }
              )
            );
          });
        }
      );
      request.on('error', reject);
      request.end(body.length ? body : undefined);
    });
  };
  const fetch = (url, init = {}) => {
    assert.ok(++requests <= 600, 'Runtime request budget exceeded');
    return worker.fetch(url, { redirect: 'manual', signal: t.signal, ...init });
  };
  return { worker, source, fetch, rawFetch, unexpected, secret };
}

export async function payBrowserListener(t, runtime, mode) {
  let origin;
  let count = 0;
  const server = createServer(async (request, response) => {
    try {
      if (++count > 100 || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const target = new URL(request.url, mode.origin);
      const output = await runtime.fetch(target.href, {
        method: request.method,
      });
      const headers = Object.fromEntries(output.headers);
      delete headers['content-encoding'];
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      const location = output.headers.get('location');
      if (location) {
        const destination = new URL(location, target);
        const owned =
          mode.base === '' ||
          destination.pathname === mode.base ||
          destination.pathname.startsWith(`${mode.base}/`);
        if (destination.origin === mode.origin && owned) {
          headers.location = new URL(
            destination.pathname + destination.search + destination.hash,
            origin
          ).href;
        }
      }
      const cookies = output.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      response.writeHead(output.status, headers);
      response.end(Buffer.from(await output.arrayBuffer()));
    } catch {
      response.writeHead(500).end('Fixture transport failed');
    }
  });
  t.after(async () => {
    if (!server.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return origin;
}
