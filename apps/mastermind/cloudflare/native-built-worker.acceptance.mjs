import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { fleetResponseFixture } from '../src/fleet/fleet-fixture.ts';
import { createFleetGrantee } from './fleet-admission.acceptance-cases.mjs';

function documentScripts(html) {
  const dom = new JSDOM(html);
  try {
    return [...dom.window.document.querySelectorAll('script')];
  } finally {
    dom.window.close();
  }
}

/** Every <script> in the document must carry the response's CSP nonce. */
function assertNonceHydration(response, html) {
  const policy = response.headers.get('Content-Security-Policy') ?? '';
  const nonce = /script-src 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/.exec(
    policy
  )?.[1];
  assert.ok(nonce, `nonce script policy expected: ${policy}`);
  assert.ok(!policy.includes('unsafe-inline'));
  const scripts = documentScripts(html);
  assert.ok(scripts.length > 0, 'hydration scripts expected');
  for (const script of scripts) {
    assert.equal(
      script.getAttribute('nonce'),
      nonce,
      `unstamped script: ${script.outerHTML}`
    );
  }
  return nonce;
}

test('nonce hydration reads every script from the document parser', () => {
  const nonce = 'abc+/=';
  const response = {
    headers: {
      get: () => `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    },
  };
  const stamped = [
    '<!doctype html><html><head>',
    `<script nonce="${nonce}" src="/a.js"></script>`,
    `<script\nnonce="${nonce}">window.__ok=1</script>`,
    '</head><body></body></html>',
  ].join('');
  assert.equal(assertNonceHydration(response, stamped), nonce);
  assert.throws(
    () =>
      assertNonceHydration(
        response,
        `<script nonce="${nonce}"></script><SCRIPT src="/x.js"></SCRIPT>`
      ),
    /unstamped script/
  );
  assert.throws(
    () =>
      assertNonceHydration(
        response,
        `<script nonce="${nonce}"></script><script nonce="other"></script>`
      ),
    /unstamped script/
  );
});

test(
  'sealed emitted Worker enforces admission and renders the bilingual command center',
  {
    timeout: 120000,
  },
  async (t) => {
    assert.equal(process.env.CI, 'true', 'CI emitted artifact only');
    const app = fileURLToPath(new URL('../', import.meta.url));
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.assets.run_worker_first, true);
    const scratch = await mkdtemp(join(tmpdir(), 'mastermind-runtime-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const envFile = join(scratch, 'synthetic.env');
    await writeFile(envFile, '', { mode: 0o600 });
    const registry = join(scratch, 'registry');
    await mkdir(registry);
    const secret = randomBytes(48).toString('hex');
    const email = 'owner@example.invalid';
    const seconds = Math.floor(Date.now() / 1000);
    // The owner's session carries Web's MFA (aal2) proof.
    const mfa = { sessionId: 'web-session', verifiedAt: seconds - 60 };
    const claims = {
      aud: 'tuturuuu-api',
      iss: 'tuturuuu',
      typ: 'app_coordination',
      sub: 'owner',
      email,
      target_app: 'mastermind',
      origin_app: 'web',
      scopes: ['internal-app:session'],
      iat: seconds,
      exp: seconds + 300,
      jti: randomUUID(),
      mfa,
    };
    const b64 = (value) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const sign = (payload) => {
      const content = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
      return `ttr_app_${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
    };
    const session = sign(claims);
    const { mfa: _mfa, ...withoutMfa } = claims;
    const sessionWithoutMfa = sign({ ...withoutMfa, jti: randomUUID() });
    const grantee = createFleetGrantee({ app, secret });
    let handoffRedemptions = 0;
    const plain = (value) => ({ type: 'plain_text', value });
    const require = createRequire(join(app, 'package.json'));
    let rootAccess = true;
    let permissionReads = 0;
    let fleetReads = 0;
    const workerOptions = {
      config: join(scratch, relative(app, configPath)),
      envFiles: [envFile],
      sendMetrics: false,
      bindings: {
        MASTERMIND_OWNER_EMAIL: plain(email),
        OWNER_IDS: plain('owner'),
        TUTURUUU_APP_COORDINATION_SECRET: {
          type: 'secret_text',
          value: secret,
        },
      },
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
        // Match the hosted request scheme without changing the loopback listener.
        origin: { secure: true },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth forbidden');
        },
        outboundService: async (request) => {
          if (request.url === 'https://tuturuuu.com/api/v1/mastermind/access') {
            permissionReads++;
            assert.equal(
              request.headers.get('Authorization'),
              `Bearer ${session}`
            );
            return Response.json({ enabled: rootAccess });
          }
          if (
            request.url === 'https://tuturuuu.com/api/v1/mastermind/fleet/state'
          ) {
            fleetReads++;
            assert.equal(
              request.headers.get('Authorization'),
              `Bearer ${session}`
            );
            assert.equal(
              request.headers.get('x-mastermind-fleet-features'),
              'login,review'
            );
            return Response.json(fleetResponseFixture(Date.now()));
          }
          if (
            request.url ===
            'https://tuturuuu.com/api/v1/auth/cross-app-token/verify'
          ) {
            handoffRedemptions++;
            return Response.json({ valid: false }, { status: 401 });
          }
          const fleet = grantee.serve(request);
          if (fleet) return fleet;
          throw new Error('Application data reads forbidden');
        },
      },
    };
    const worker =
      await require('wrangler').unstable_startWorker(workerOptions);
    t.after(() => worker.dispose());
    await worker.ready;
    const {
      TUTURUUU_APP_COORDINATION_SECRET: _secret,
      ...missingSecretBindings
    } = workerOptions.bindings;
    const misconfigured = await require('wrangler').unstable_startWorker({
      ...workerOptions,
      bindings: missingSecretBindings,
    });
    t.after(() => misconfigured.dispose());
    await misconfigured.ready;
    const unavailable = await misconfigured.fetch(
      'https://mastermind.tuturuuu.com/'
    );
    assert.equal(unavailable.status, 503);
    assert.equal(await unavailable.text(), 'Service unavailable');
    const anonymousRoot = await worker.fetch(
      'https://mastermind.tuturuuu.com/',
      { redirect: 'manual' }
    );
    assert.equal(anonymousRoot.status, 303);
    assert.equal(anonymousRoot.headers.get('Location'), '/login');
    const headers = { Authorization: `Bearer ${session}` };
    for (const host of [
      'preview.mastermind.example.invalid',
      'mastermind.account.workers.dev',
    ]) {
      assert.equal(
        (await worker.fetch(`https://${host}/en`, { headers })).status,
        403
      );
    }
    assert.equal(
      (await worker.fetch('https://mastermind.tuturuuu.com/en')).status,
      403
    );
    // Access headers are never authority: without a session they open nothing.
    for (const path of ['/en', '/_serverFn/answer', '/assets/probe.js']) {
      assert.equal(
        (
          await worker.fetch(`https://mastermind.tuturuuu.com${path}`, {
            headers: {
              'Cf-Access-Jwt-Assertion': [
                'eyJhbGciOiJSUzI1NiJ9',
                'e30',
                'sig',
              ].join('.'),
              'Cf-Access-Authenticated-User-Email': email,
            },
          })
        ).status,
        403
      );
    }
    // Signed out, the root and sign-in go to Tuturuuu sign-in, never Access.
    // (Node's fetch overrides Sec-Fetch-Mode with `cors`, so navigation-mode
    // redirects stay covered by the unit tests.)
    const signedOutRoot = await worker.fetch(
      'https://mastermind.tuturuuu.com/',
      { redirect: 'manual' }
    );
    assert.equal(signedOutRoot.status, 303);
    assert.equal(signedOutRoot.headers.get('Location'), '/login');
    const signIn = await worker.fetch(
      'https://mastermind.tuturuuu.com/login?nextUrl=%2Fvi',
      { redirect: 'manual' }
    );
    assert.equal(signIn.status, 303);
    assert.ok(
      (signIn.headers.get('Location') ?? '').startsWith(
        'https://tuturuuu.com/login?returnUrl='
      )
    );
    assert.match(
      signIn.headers.getSetCookie().join('\n'),
      /^__Host-mastermind_login_state=[\w-]{22}; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/
    );
    // Only a callback carrying this browser's login state reaches Web.
    const state = /^__Host-mastermind_login_state=([\w-]+);/.exec(
      signIn.headers.getSetCookie().join('\n')
    )?.[1];
    const callback = (cookie) =>
      worker.fetch(
        `https://mastermind.tuturuuu.com/verify-token?token=${'a'.repeat(64)}&nextUrl=${encodeURIComponent(`/en?mm_state=${state}`)}`,
        {
          headers: cookie
            ? { cookie: `__Host-mastermind_login_state=${cookie}` }
            : {},
          redirect: 'manual',
        }
      );
    for (const cookie of [undefined, 'other-state']) {
      const refused = await callback(cookie);
      assert.equal(refused.status, 403);
      assert.equal(handoffRedemptions, 0);
    }
    const matched = await callback(state);
    assert.equal(matched.status, 403);
    assert.equal(handoffRedemptions, 1);
    // An owner session without MFA is refused with the MFA notice.
    const noMfa = await worker.fetch('https://mastermind.tuturuuu.com/en', {
      headers: {
        Authorization: `Bearer ${sessionWithoutMfa}`,
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'manual',
    });
    assert.equal(noMfa.status, 403);
    assert.match(await noMfa.text(), /multi-factor authentication/);
    for (const path of ['/mastermind', '/mastermind/en']) {
      assert.equal(
        (await worker.fetch(`https://tuturuuu.com${path}`, { headers })).status,
        403
      );
    }
    const root = await worker.fetch('https://mastermind.tuturuuu.com/', {
      headers,
      redirect: 'manual',
    });
    assert.equal(root.status, 303);
    assert.equal(root.headers.get('Location'), '/en');
    const nonces = new Set();
    for (const locale of ['en', 'vi']) {
      const response = await worker.fetch(
        `https://mastermind.tuturuuu.com/${locale}`,
        { headers }
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      const html = await response.text();
      nonces.add(assertNonceHydration(response, html));
      assert.ok(html.includes(email));
      assert.ok(
        html.includes(
          locale === 'en' ? 'Command center' : 'Trung tâm điều khiển'
        )
      );
      assert.ok(html.includes('Roll back the Calendar Worker deploy?'));
      assert.ok(html.includes('ABCD-1234'));
    }
    assert.equal(nonces.size, 2, 'each response has its own nonce');
    assert.equal(fleetReads, 2);
    const crossSite = await worker.fetch(
      'https://mastermind.tuturuuu.com/_serverFn/answer',
      {
        method: 'POST',
        headers: { ...headers, Origin: 'https://tuturuuu.com' },
      }
    );
    assert.equal(crossSite.status, 405);
    assert.equal(fleetReads, 2);
    await grantee.verify(worker, {
      ownerHeaders: headers,
      ownerStateReads: () => fleetReads,
      ownerChecks: () => permissionReads,
    });
    const readsBeforeRevocation = permissionReads;
    rootAccess = false;
    assert.equal(
      (await worker.fetch('https://mastermind.tuturuuu.com/en', { headers }))
        .status,
      403
    );
    assert.equal(permissionReads, readsBeforeRevocation + 1);
  }
);
