import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { FLEET_SERVER_FUNCTION_IDS } from '../src/native/fleet-admission.ts';

/**
 * Fleet grantee cases for the sealed emitted Worker. The acceptance fixture
 * routes Fleet API requests here and runs `verify` on its started Worker, so
 * the cases need no Worker of their own.
 */
const host = 'https://mastermind.tuturuuu.com';
const email = 'ops@example.invalid';

/** The build's default ID for a server function without a pinned ID. */
const hashedId = (file, variable) =>
  createHash('sha256')
    .update(`${file}--${variable}_createServerFn_handler`)
    .digest('hex');

const emptyDigest = {
  sections: [],
  totals: {
    projects: 0,
    lanes: 0,
    byState: {
      planned: 0,
      running: 0,
      blocked: 0,
      ready: 0,
      done: 0,
      paused: 0,
    },
  },
};

export function createFleetGrantee({ app, secret }) {
  const seconds = Math.floor(Date.now() / 1000);
  const b64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: 'grantee',
    email,
    target_app: 'mastermind',
    origin_app: 'web',
    scopes: ['internal-app:session'],
    iat: seconds,
    exp: seconds + 300,
    jti: randomUUID(),
  })}`;
  const session = `ttr_app_${content}.${createHmac('sha256', secret)
    .update(content)
    .digest('base64url')}`;
  const reads = new Map();
  const count = (key) => reads.get(key) ?? 0;
  let grant = { enabled: true, tier: 'observer' };

  // Serialize RPC payloads with the seroval the Start client uses. The
  // isolated linker (bunfig.toml) keeps each package's dependencies beside it.
  const reactStart = realpathSync(
    join(app, 'node_modules/@tanstack/react-start')
  );
  const clientCore = realpathSync(join(reactStart, '..', 'start-client-core'));
  const { toJSONAsync } = createRequire(join(clientCore, 'package.json'))(
    'seroval'
  );

  /** A fixture response for a Fleet API request, or null for any other URL. */
  function serve(request) {
    const url = new URL(request.url);
    if (
      url.origin !== 'https://tuturuuu.com' ||
      !url.pathname.startsWith('/api/v1/fleet/')
    )
      return null;
    assert.equal(request.headers.get('Authorization'), `Bearer ${session}`);
    const key = `${request.method} ${url.pathname}`;
    reads.set(key, count(key) + 1);
    switch (key) {
      case 'GET /api/v1/fleet/access':
        return Response.json(
          grant.enabled
            ? {
                enabled: true,
                tier: grant.tier,
                projects: ['web'],
                capabilities: ['status.read', 'ask', 'intent.request'],
                stopped: false,
              }
            : {
                enabled: false,
                tier: null,
                projects: [],
                capabilities: [],
                stopped: false,
              }
        );
      case 'GET /api/v1/fleet/digest':
        return Response.json(emptyDigest);
      case 'GET /api/v1/fleet/intents':
        return Response.json({ intents: [], nextBefore: null });
      case 'POST /api/v1/fleet/intents':
        return Response.json({ id: randomUUID() }, { status: 201 });
      case 'POST /api/v1/fleet/identity/link-codes':
        return Response.json(
          { code: 'c'.repeat(43), expiresIn: 600 },
          { status: 201 }
        );
      case 'POST /api/v1/fleet/identity/confirm':
        return Response.json({
          linked: false,
          channel: 'zalo',
          accountLabel: 'Ops desk',
        });
    }
    throw new Error(`Unexpected Fleet read ${key}`);
  }

  async function verify(
    worker,
    { ownerHeaders, ownerStateReads, ownerChecks }
  ) {
    // The verified session is the whole identity; no Access header is sent.
    const headers = async () => ({ Authorization: `Bearer ${session}` });
    const rpc = async (as, id, method, data) => {
      const url = new URL(`${host}/_serverFn/${id}`);
      const init = {
        ...(as === 'owner' ? ownerHeaders : await headers()),
        'x-tsr-serverFn': 'true',
        accept: 'application/json',
        Origin: host,
        'Sec-Fetch-Site': 'same-origin',
      };
      let body;
      if (data !== undefined) {
        const payload = JSON.stringify(await toJSONAsync({ data }));
        if (method === 'GET') url.searchParams.set('payload', payload);
        else {
          body = payload;
          init['content-type'] = 'application/json';
        }
      }
      const response = await worker.fetch(url, { method, headers: init, body });
      await response.arrayBuffer();
      return response.status;
    };
    const page = async (path, init = {}) =>
      worker.fetch(`${host}${path}`, {
        redirect: 'manual',
        ...init,
        headers: { ...(await headers()), ...init.headers },
      });

    const stateReads = ownerStateReads();
    const checks = ownerChecks();

    // The Fleet page renders without the command center loader or owner data.
    for (const [locale, title] of [
      ['en', 'Fleet access'],
      ['vi', 'Quyền truy cập đội máy'],
    ]) {
      const response = await page(
        locale === 'en' ? '/fleet-access' : `/${locale}/fleet-access`
      );
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(title));
      assert.ok(!html.includes('owner@example.invalid'));
    }

    // Each pinned Fleet ID exists in the build and runs with the grantee bearer.
    const calls = [
      ['fleetAccessFn', 'GET', undefined, 'GET /api/v1/fleet/access'],
      ['fleetDigestFn', 'GET', undefined, 'GET /api/v1/fleet/digest'],
      ['fleetIntentsFn', 'GET', {}, 'GET /api/v1/fleet/intents'],
      [
        'submitFleetIntentFn',
        'POST',
        {
          kind: 'status_question',
          payload: { projectKey: 'web', topic: 'status' },
        },
        'POST /api/v1/fleet/intents',
      ],
      [
        'issueFleetLinkCodeFn',
        'POST',
        undefined,
        'POST /api/v1/fleet/identity/link-codes',
      ],
      [
        'confirmFleetLinkFn',
        'POST',
        {
          linkId: randomUUID(),
          confirmationCode: 'c'.repeat(43),
          preview: true,
        },
        'POST /api/v1/fleet/identity/confirm',
      ],
    ];
    assert.deepEqual(
      calls.map(([name]) => `fleet-access.${name}`).sort(),
      [...FLEET_SERVER_FUNCTION_IDS].sort()
    );
    for (const [name, method, data, upstream] of calls) {
      const before = count(upstream);
      assert.equal(
        await rpc('grantee', `fleet-access.${name}`, method, data),
        200,
        name
      );
      assert.ok(count(upstream) > before, `${name} reached ${upstream}`);
    }

    // Owner RPCs keep hashed IDs: real for the owner, denied to the grantee.
    const loadFleet = hashedId('src/fleet/server.ts', 'loadFleet');
    const answer = hashedId('src/fleet/server.ts', 'answerFleetDecision');
    assert.equal(await rpc('owner', loadFleet, 'GET'), 200);
    assert.equal(ownerStateReads(), stateReads + 1);
    const ownerChecksAfterOwner = ownerChecks();
    for (const [id, method] of [
      [loadFleet, 'GET'],
      [answer, 'POST'],
      ['fleet-access.loadFleet', 'GET'],
    ]) {
      assert.equal(await rpc('grantee', id, method, {}), 403, id);
    }
    for (const path of ['/', '/ship', '/vi', '/settings']) {
      const response = await page(path, {
        headers: { 'Sec-Fetch-Mode': 'navigate' },
      });
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get('Location'), null);
    }
    assert.equal((await page('/fleet-access', { method: 'HEAD' })).status, 403);
    assert.equal(ownerStateReads(), stateReads + 1);
    assert.equal(ownerChecks(), ownerChecksAfterOwner);
    assert.ok(ownerChecksAfterOwner > checks);

    // A forged Access identity naming the owner elevates nothing.
    const forged = {
      'Cf-Access-Jwt-Assertion': ['eyJhbGciOiJSUzI1NiJ9', 'e30', 'sig'].join(
        '.'
      ),
      'Cf-Access-Authenticated-User-Email': 'owner@example.invalid',
    };
    assert.equal((await page('/ship', { headers: forged })).status, 403);
    assert.equal(
      (await page('/fleet-access', { headers: forged })).status,
      200
    );
    assert.equal(ownerChecks(), ownerChecksAfterOwner);

    // A grantee's sign-in returns only to the Fleet page.
    const login = await page('/login?nextUrl=%2Fen');
    assert.equal(login.status, 303);
    const returnUrl = new URL(
      new URL(login.headers.get('Location') ?? '').searchParams.get(
        'returnUrl'
      ) ?? ''
    );
    const next = new URL(
      returnUrl.searchParams.get('nextUrl') ?? '',
      'https://mastermind.tuturuuu.com'
    );
    assert.equal(next.pathname, '/fleet-access');
    assert.match(next.searchParams.get('mm_state') ?? '', /^[\w-]{22}$/);

    // The Owner tier and a revoked grant deny the next request.
    for (const next of [
      { enabled: true, tier: 'owner' },
      { enabled: false, tier: null },
    ]) {
      grant = next;
      assert.equal((await page('/fleet-access')).status, 403);
      assert.equal(
        await rpc('grantee', 'fleet-access.fleetDigestFn', 'GET'),
        403
      );
    }
    grant = { enabled: true, tier: 'observer' };
  }

  return { serve, verify };
}
