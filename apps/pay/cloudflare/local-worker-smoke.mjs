import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
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

// Runs emitted output without a TypeScript loader or provider credentials.
const app = fileURLToPath(new URL('../', import.meta.url));
const profiles = JSON.parse(
  await readFile(new URL('./native-profiles.json', import.meta.url))
);
const name = process.env.VITE_PAY_NATIVE_PROFILE || 'staging';
assert.ok(Object.hasOwn(profiles, name), 'Unknown Pay smoke profile');
const profile = profiles[name];

test(
  `emitted ${name} Pay Worker with denied egress`,
  { timeout: 120000 },
  async (t) => {
    const emitted = readNativeRuntimeConfig(app);
    assert.equal(emitted.config.name, profile.workerName);
    assert.equal(emitted.config.workers_dev, false);
    assert.equal(emitted.config.assets.run_worker_first, true);
    const scratch = await mkdtemp(join(tmpdir(), 'pay-local-smoke-'));
    let worker;
    t.after(async () => {
      await worker?.dispose();
      await rm(scratch, { recursive: true, force: true });
    });
    await cp(join(app, 'dist'), join(scratch, 'dist'), { recursive: true });
    const envFile = join(scratch, 'synthetic.env');
    await writeFile(envFile, '', { mode: 0o600 });
    let egress = 0;
    const webhookSecret = randomBytes(32).toString('hex');
    const sdk = createRequire(new URL('../package.json', import.meta.url))(
      'wrangler'
    );
    worker = await sdk.unstable_startWorker({
      config: join(scratch, relative(app, emitted.configPath)),
      bindings: {
        POLAR_WEBHOOK_SECRET: { type: 'secret_text', value: webhookSecret },
      },
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
        registry: join(scratch, 'registry'),
        server: { hostname: '127.0.0.1', port: 0 },
        origin: { secure: true },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth forbidden');
        },
        outboundService: () => {
          assert.ok(++egress <= 20, 'Outbound attempt budget exceeded');
          return new Response('{"error":"smoke egress denied"}', {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    await worker.ready;
    const listener = new URL((await worker.url).origin);
    let probes = 0;
    const call = (host, path, headers = {}, method = 'GET', body) =>
      new Promise((resolve, reject) => {
        assert.ok(++probes <= 300, 'Inbound probe budget exceeded');
        httpRequest(
          {
            hostname: listener.hostname,
            port: listener.port,
            method,
            path,
            headers: { host, ...headers },
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
                  new Error('Smoke response byte budget exceeded')
                );
                return;
              }
              chunks.push(chunk);
            });
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
          }
        )
          .on('error', reject)
          .end(body);
      });
    const production = name === 'production';
    const host = production ? 'tuturuuu.com' : profile.rootHost;
    const base = production ? '/pay' : '';
    assert.equal((await call('unknown.invalid', `${base}/`)).status, 404);
    assert.equal((await call('tuturuuu.com', '/pay-extra')).status, 404);
    if (!production)
      assert.equal((await call('tuturuuu.com', '/pay')).status, 404);
    if (production) {
      const legacy = await call(profile.rootHost, '/?smoke=1', {
        accept: 'text/html',
      });
      assert.equal(legacy.status, 301);
      assert.equal(legacy.headers.location, 'https://tuturuuu.com/pay?smoke=1');
      const slash = await call(host, '/pay/?smoke=1');
      assert.equal(slash.status, 301);
      // Wrangler rewrites same-host Location schemes to the local listener protocol.
      // The source policy test separately requires the production HTTPS URL.
      assert.equal(
        slash.headers.location,
        `${listener.protocol}//tuturuuu.com/pay?smoke=1`
      );
    }
    const identity = await call(host, `${base}/api/build-info`);
    assert.equal(identity.status, 200, `build-info status ${identity.status}`);
    assert.equal(JSON.parse(identity.body).appName, 'pay');
    const root = await call(host, base || '/');
    assert.ok(root.status < 500, `root status ${root.status}`);
    // customer.created has no business callback in Pay: verifies the actual route
    // without database/provider effects. The secret and identity are disposable.
    const timestamp = Math.floor(Date.now() / 1000);
    const now = new Date().toISOString();
    const body = JSON.stringify(
      {
        type: 'customer.created',
        timestamp: now,
        data: {
          id: 'synthetic',
          created_at: now,
          modified_at: null,
          metadata: {},
          email: 'fixture@example.invalid',
          email_verified: false,
          type: 'individual',
          name: null,
          billing_name: null,
          billing_address: null,
          tax_id: null,
          organization_id: 'synthetic',
          deleted_at: null,
          avatar_url: null,
        },
      },
      null,
      2
    );
    const signature = createHmac('sha256', webhookSecret)
      .update(`synthetic.${timestamp}.${body}`)
      .digest('base64');
    const webhookHeaders = {
      'content-type': 'application/json',
      'webhook-id': 'synthetic',
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    };
    const paths = production
      ? [
          [host, base],
          [profile.rootHost, ''],
        ]
      : [[host, base]];
    for (const [webhookHost, webhookBase] of paths) {
      const path = `${webhookBase}/api/payment/webhooks`;
      const valid = await call(webhookHost, path, webhookHeaders, 'POST', body);
      assert.equal(
        valid.status,
        200,
        'Synthetic signed delivery must reach the real verifier'
      );
      assert.deepEqual(JSON.parse(valid.body), { received: true });
      const tampered = await call(
        webhookHost,
        path,
        webhookHeaders,
        'POST',
        `${body} `
      );
      assert.equal(tampered.status, 403);
      assert.deepEqual(JSON.parse(tampered.body), { received: false });
      const unsigned = await call(webhookHost, path, {}, 'POST', body);
      assert.equal(unsigned.status, 403);
    }
    const robots = await call(host, `${base}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.equal(
      robots.body,
      await readFile(join(app, 'public/robots.txt'), 'utf8')
    );
    const assets = (await readdir(join(app, 'dist/client/assets'))).filter(
      (file) => /\.(js|css|woff2?)$/.test(file)
    );
    assert.ok(
      assets.some((file) => file.endsWith('.js')),
      'Missing JS'
    );
    assert.ok(
      assets.some((file) => file.endsWith('.css')),
      'Missing CSS'
    );
    const manifestText = await readFile(
      join(app, 'dist/server/__vite_rsc_assets_manifest.js'),
      'utf8'
    );
    const manifest = JSON.parse(
      manifestText.replace(/^export default /, '').replace(/;\s*$/, '')
    );
    const checkUrls = (value) => {
      if (typeof value === 'string' && value.startsWith('/')) {
        assert.ok(
          value.startsWith(`${base}/assets/`),
          `Unscoped compiled asset URL: ${value}`
        );
        assert.ok(
          assets.includes(value.slice(`${base}/assets/`.length)),
          `Missing compiled asset: ${value}`
        );
      } else if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) checkUrls(nested);
      }
    };
    checkUrls(manifest);
    for (const file of assets) {
      const asset = await call(host, `${base}/assets/${file}`);
      assert.equal(asset.status, 200, file);
      const mime = asset.headers['content-type'] || '';
      assert.ok(!mime.includes('text/html'), file);
      if (file.endsWith('.js'))
        assert.match(mime, /javascript|ecmascript/, file);
      if (file.endsWith('.css')) assert.match(mime, /text\/css/, file);
      assert.equal(asset.headers['x-content-type-options'], 'nosniff');
    }
    assert.equal(
      (await call(host, `${base}/assets/smoke-missing.js`)).status,
      404
    );
    t.diagnostic(
      `${assets.length} JS/CSS/font assets; public robots; host/mount/redirect/identity probes; ${egress} denied egress attempts`
    );
  }
);
