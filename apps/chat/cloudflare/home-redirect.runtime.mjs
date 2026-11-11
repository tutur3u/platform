import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const userId = '11111111-1111-4111-8111-111111111111';
const signer = 'synthetic-chat-runtime-signer';

// Disposable credentials accepted only by this isolated Worker. The provider
// account-authority response is synthetic; all other outbound traffic is denied.
function session() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: userId,
    email: null,
    iat: now,
    exp: now + 3600,
    jti: randomUUID(),
    origin_app: 'web',
    target_app: 'chat',
    scopes: ['internal-app:session'],
  })}`;
  return `ttr_app_${content}.${createHmac('sha256', signer).update(content).digest('base64url')}`;
}

test(
  'production home redirects before RSC streaming at root and /chat',
  { timeout: 120000 },
  async (t) => {
    const { configPath } = readNativeRuntimeConfig(app);
    const scratch = await mkdtemp(join(tmpdir(), 'chat-home-runtime-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const envFile = join(scratch, 'empty.env');
    await writeFile(envFile, '', { mode: 0o600 });
    const registry = join(scratch, 'registry');
    await mkdir(registry);
    const values = {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
      SUPABASE_SECRET_KEY: 'synthetic-chat-server-key',
      TUTURUUU_APP_COORDINATION_SECRET: signer,
      INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
    };
    const worker = await require('wrangler').unstable_startWorker({
      config: configPath,
      envFiles: [envFile],
      sendMetrics: false,
      bindings: Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          { type: 'plain_text', value },
        ])
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
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: (req) => {
          const url = new URL(req.url);
          if (
            url.hostname === 'synthetic.supabase.invalid' &&
            url.pathname === `/auth/v1/admin/users/${userId}`
          )
            return Response.json({
              id: userId,
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: '2026-01-01T00:00:00Z',
            });
          return Response.json({ error: 'Synthetic denial' }, { status: 401 });
        },
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const origin = await worker.url;
    const token = session();
    const cookie = `tuturuuu_app_session=${token}; tuturuuu_web_app_session=${token}`;
    const call = (host, path, headers = {}, method = 'GET') =>
      new Promise((resolve, reject) => {
        request(
          {
            hostname: origin.hostname,
            port: origin.port,
            path,
            method,
            headers: { host, ...headers },
          },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks),
              })
            );
          }
        )
          .on('error', reject)
          .end();
      });
    const assets = await readdir(join(app, 'dist/client/assets'));
    const files = [
      'media/logos/transparent.png',
      'robots.txt',
      ...['.js', '.css'].map((suffix) => {
        const file = assets.find((name) => name.endsWith(suffix));
        assert.ok(file, `Missing built ${suffix} asset`);
        return `assets/${file}`;
      }),
    ];
    for (const [host, base] of [
      ['chat.tuturuuu.com', ''],
      ['tuturuuu.com', '/chat'],
    ]) {
      await t.test(
        `${host}${base}: auth, API and asset boundaries`,
        async () => {
          for (const path of [base || '/', `${base}/`]) {
            const signed = await call(host, path, { cookie });
            // A 200 containing an errored Flight stream must never count as success.
            assert.equal(signed.status, 307);
            assert.equal(
              new URL(signed.headers.location, `https://${host}`).pathname,
              base && path.endsWith('/') ? base : `${base}/personal`
            );
            assert.equal(signed.body.length, 0);
            const anonymous = await call(host, path);
            assert.equal(anonymous.status, 307);
            assert.equal(
              new URL(anonymous.headers.location, `https://${host}`).pathname,
              `${base}/login`
            );
          }
          const login = await call(host, `${base}/login?refresh=1`, { cookie });
          assert.equal(login.status, 307);
          const central = new URL(login.headers.location);
          // workerd's local HTTP transport rewrites same-host absolute redirects.
          assert.equal(
            central.origin,
            base ? 'http://tuturuuu.com' : 'https://tuturuuu.com'
          );
          assert.equal(central.pathname, '/login');
          const verifier = new URL(central.searchParams.get('returnUrl'));
          assert.equal(verifier.origin, `https://${host}`);
          assert.equal(verifier.pathname, `${base}/verify-token`);
          const info = await call(host, `${base}/api/build-info`);
          assert.equal(info.status, 200);
          assert.equal(JSON.parse(info.body).appName, 'chat');
          for (const file of files) {
            const response = await call(host, `${base}/${file}`);
            assert.equal(response.status, 200, `${base}/${file}`);
            assert.deepEqual(
              response.body,
              await readFile(join(app, 'dist/client', file))
            );
            if (file.endsWith('.js'))
              assert.match(response.headers['content-type'], /javascript/);
            if (file.endsWith('.css'))
              assert.match(response.headers['content-type'], /css/);
          }
          const missing = await call(host, `${base}/assets/__missing__.js`);
          assert.equal(missing.status, 404);
        }
      );
    }
    const foreign = await call(
      'tuturuuu.com',
      '/chat/api/mutation',
      { cookie, origin: 'https://evil.invalid' },
      'POST'
    );
    assert.equal(foreign.status, 403);
    const mint = await call(
      'tuturuuu.com',
      '/chat/api/auth/verify-app-token',
      {},
      'POST'
    );
    assert.equal(mint.status, 409);
    assert.equal(JSON.parse(mint.body).code, 'APP_SESSION_MOUNTED');
    assert.equal(mint.headers['set-cookie'], undefined);
    assert.equal((await call('tuturuuu.com', '/')).status, 404);
    assert.equal((await call('unknown.invalid', '/chat')).status, 404);
  }
);
