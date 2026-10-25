import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { after, before, test as nodeTest } from 'node:test';
import {
  ASSURANCE_READS,
  ASSURANCE_SUBJECT,
} from './meet-native-assurance.mjs';
import { createMeetGraph } from './meet-native-graph.mjs';
import { readMeetRegistry } from './meet-native-graph-files.mjs';
import { createMeetPolicy, PROBE_NEGATIVES } from './meet-native-policy.mjs';
import { rejectMeetServerFailure } from './meet-native-response-diagnostics.mjs';
import { privateDiagnosticJSON } from './native-wrangler-diagnostics.mjs';
import { diagnosticError } from './native-wrangler-evidence.mjs';

assert.equal(
  process.env.NATIVE_FIXTURE_CASE,
  'meet-emitted-v1',
  'Run through meet-native-launcher.mjs'
);
assert.match(
  process.env.GITHUB_SHA ?? '',
  /^[a-f0-9]{40}$/,
  'exact source SHA is required'
);
const { plan, prepared } = JSON.parse(
  await readFile(process.env.NATIVE_PLAN_FILE, 'utf8')
);
assert.equal(plan.sourceSHA, process.env.GITHUB_SHA);
const secret = randomUUID() + randomUUID();
const probeToken = randomUUID() + randomUUID();
const policies = {
  app: createMeetPolicy('app', { assuranceKey: secret }),
  probe: createMeetPolicy('probe'),
};
const { forwarded, unexpected } = policies.app;
const serverFailures = [];
const caseBudget = new AsyncLocalStorage();
let serverFailuresTruncated = false;
let runtime,
  graph,
  primary,
  hasPrimary = false,
  completed = 0,
  registry;
function recordPrimary(error) {
  if (!hasPrimary) {
    hasPrimary = true;
    primary = error;
  }
}
function test(name, options, run) {
  nodeTest(name, options, (context) =>
    caseBudget.run(context.signal, async () => {
      try {
        await run();
        completed++;
      } catch (error) {
        recordPrimary(error);
        throw error;
      }
    })
  );
}

function session(target) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'tuturuuu-api',
    iss: 'tuturuuu',
    typ: 'app_coordination',
    sub: ASSURANCE_SUBJECT,
    email: null,
    exp: now + 300,
    iat: now,
    jti: randomUUID(),
    origin_app: 'web',
    target_app: target,
    scopes: ['internal-app:session'],
  })}`;
  return `ttr_app_${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

const signedCookie = () =>
  `tuturuuu_app_session=${session('meet')}; tuturuuu_web_app_session=${session('web')}`;
const fetchWorker = async (path, options = {}) => {
  const response = await runtime.fetchApp(
    new URL(path, 'https://meet.tuturuuu.com').href,
    {
      ...options,
      redirect: 'manual',
    }
  );
  if (response.status === 500) {
    await rejectMeetServerFailure(response, path, {
      signal: caseBudget.getStore(),
      recordPrimary,
      recordFact(fact) {
        if (serverFailures.length < 4) serverFailures.push(fact);
        else serverFailuresTruncated = true;
      },
    });
  }
  return response;
};

const fetchProbe = (path) =>
  runtime.fetchProbe(`https://meet-ci-probe.invalid${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { authorization: `Bearer ${probeToken}` },
  });
before(async () => {
  try {
    graph = await createMeetGraph(plan, prepared, {
      policies,
      secret,
      probeToken,
    });
    runtime = await graph.start();
    assert.equal(policies.app.assurance.length, 0);
    assert.equal(policies.probe.assurance.length, 0);
    registry = await readMeetRegistry(prepared, 0);
  } catch (error) {
    recordPrimary(error);
    throw error;
  }
});
after(async () => {
  const result = await graph?.finish(...(hasPrimary ? [primary] : []));
  const errors = result?.errors ?? (hasPrimary ? [primary] : []);
  const receipt = {
    schema: 1,
    sourceSHA: plan.sourceSHA,
    completed,
    lifecycle: result?.receipt ?? {
      roles: [],
      errors: errors.map(diagnosticError),
      phases: [],
    },
    registry,
    supplier: graph?.supplier,
    serverFailures,
    serverFailuresTruncated,
    policies: {
      appControls: policies.app.controls.length,
      probeControls: policies.probe.controls.length,
      forwarded: forwarded.length,
      assuranceReads: policies.app.assurance.length,
      probeAssuranceReads: policies.probe.assurance.length,
      unexpected: [...unexpected, ...policies.probe.unexpected],
    },
    internalCleanup: 'UNKNOWN',
    descendantClosure: 'UNKNOWN',
  };
  try {
    const bytes = privateDiagnosticJSON(receipt);
    await writeFile(process.env.NATIVE_RECEIPT_FILE, bytes, {
      flag: 'wx',
      mode: 0o600,
    });
    assert.equal(
      await readFile(process.env.NATIVE_RECEIPT_FILE, 'utf8'),
      bytes
    );
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      'Meet primary/readiness/disposal/receipt failure'
    );
});

test('native Start renders bilingual callback HTML and serves its emitted client module', {
  timeout: 30000,
}, async () => {
  for (const [path, locale] of [
    ['/verify-token', 'en'],
    ['/vi/verify-token', 'vi'],
    ['https://tuturuuu.com/meet/verify-token', 'en'],
    ['https://tuturuuu.com/meet/vi/verify-token', 'vi'],
  ]) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    assert.match(
      html,
      /<h1\b[^>]*>[\s\S]*?<svg\b/,
      'callback logo must be server rendered'
    );
    const module = /<script\b[^>]*src="([^"]+)"[^>]*>/g;
    const sources = [...html.matchAll(module)].map((match) => match[1]);
    const target = new URL(path, 'https://meet.tuturuuu.com');
    const assetBase =
      target.hostname === 'tuturuuu.com' ? '/meet/assets/' : '/assets/';
    const asset = sources.find(
      (src) => src.startsWith(assetBase) && /\.js(?:\?|$)/.test(src)
    );
    if (target.hostname === 'tuturuuu.com') {
      assert.match(html, /globalThis\.__tuturuuuAppBase="\/meet"/);
    }
    assert.ok(asset, 'SSR must reference an emitted hydration module');
    const script = await fetchWorker(new URL(asset, target).href);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);
    assert.ok((await script.text()).length > 0);
    const head = await fetchWorker(path, { method: 'HEAD' });
    assert.equal(head.status, 200, path);
    assert.match(head.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(await head.text(), '');
  }
  assert.deepEqual(unexpected, [], 'SSR must not contact production providers');
});

test('login redirects through canonical SSO and rejects an external next destination', {
  timeout: 30000,
}, async () => {
  for (const path of ['/login', '/vi/login']) {
    const response = await fetchWorker(
      `${path}?next=https%3A%2F%2Funtrusted.invalid%2F`
    );
    assert.ok([302, 303, 307, 308].includes(response.status));
    const login = new URL(response.headers.get('location'));
    assert.equal(login.origin, 'https://tuturuuu.com');
    assert.equal(login.pathname, '/login');
    const callback = new URL(login.searchParams.get('returnUrl'));
    assert.equal(callback.origin, 'https://meet.tuturuuu.com');
    assert.equal(callback.pathname, '/verify-token');
    assert.equal(callback.searchParams.get('nextUrl'), '/');
  }
  assert.deepEqual(unexpected, []);
});

test('unsigned personal meetings preserve the authentication boundary in both locales', {
  timeout: 30000,
}, async () => {
  for (const path of ['/personal/meetings', '/vi/personal/meetings']) {
    const response = await fetchWorker(path);
    assert.equal(response.status, 307, path);
    assert.match(
      new URL(response.headers.get('location'), 'https://meet.tuturuuu.com')
        .pathname,
      /\/login$/
    );
    await response.text();
  }
  assert.deepEqual(unexpected, []);
});

test('emitted public brand asset preserves its exact committed bytes', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/media/branding/brand-mark-light.svg');
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    readFileSync(
      new URL(
        '../../apps/meet/public/media/branding/brand-mark-light.svg',
        import.meta.url
      )
    )
  );
  assert.deepEqual(unexpected, []);
});

test('native local auth handler clears all satellite cookies without reaching the API fallback', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: signedCookie() },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const cookies = response.headers.getSetCookie();
  for (const name of [
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_app_session_refresh',
  ]) {
    assert.ok(
      cookies.some(
        (value) =>
          value.startsWith(`${name}=`) &&
          /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(value)
      ),
      name
    );
  }
  assert.deepEqual(forwarded, []);
  assert.equal(policies.app.assurance.length, 2);
  assert.deepEqual(unexpected, []);
});

test('authenticated unknown API forwards method, query, body and cookies and preserves upstream response', {
  timeout: 30000,
}, async () => {
  const cookie = signedCookie();
  const response = await fetchWorker(
    '/api/v1/meet-ci-rewrite?repeat=one&repeat=two',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'https://meet.tuturuuu.com',
        'Content-Type': 'application/json',
      },
      body: '{"fixture":true}',
    }
  );
  assert.equal(response.status, 207);
  assert.deepEqual(await response.json(), { fixture: 'central-web-api' });
  assert.equal(forwarded.length, 1);
  assert.equal(policies.app.assurance.length, 5);
  assert.equal(forwarded[0].method, 'POST');
  assert.equal(forwarded[0].query, '?repeat=one&repeat=two');
  assert.equal(forwarded[0].body, '{"fixture":true}');
  assert.match(forwarded[0].cookie ?? '', /tuturuuu_app_session=ttr_app_/);
  assert.ok(
    response.headers
      .getSetCookie()
      .some((value) => value.startsWith('meet_ci_upstream=one;'))
  );
  assert.deepEqual(unexpected, []);
});

test('anonymous protected API cannot fall through to upstream or SPA HTML', {
  timeout: 30000,
}, async () => {
  const count = forwarded.length;
  const response = await fetchWorker('/api/v1/meet-ci-rewrite');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type') ?? '', /json/);
  await response.text();
  assert.equal(forwarded.length, count);
  assert.deepEqual(unexpected, []);
});

test('emitted Worker serves exact source identity and retains Live admission guards', {
  timeout: 30000,
}, async () => {
  const response = await fetchWorker('/api/build-info');
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.appName, 'meet');
  assert.equal(info.commitHash, process.env.GITHUB_SHA);
  assert.equal(
    info.environment,
    process.env.GITHUB_REF === 'refs/heads/production'
      ? 'production'
      : 'preview'
  );
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const health = await fetchWorker('/.well-known/meeting-runtime');
  assert.deepEqual(await health.json(), { version: 1 });
  for (const [headers, status] of [
    [{}, 403],
    [{ Origin: 'https://untrusted.invalid', Upgrade: 'websocket' }, 403],
    [{ Origin: 'https://meet.tuturuuu.com', Upgrade: 'websocket' }, 400],
    [
      {
        Origin: 'https://meet.tuturuuu.com',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': 'meet-live, auth.invalid',
      },
      401,
    ],
  ]) {
    const denied = await fetchWorker('/live-connect', { headers });
    assert.equal(denied.status, status);
    await denied.text();
  }
  const mountedInfo = await fetchWorker(
    'https://tuturuuu.com/meet/api/build-info'
  );
  assert.equal(mountedInfo.status, 200);
  assert.equal((await mountedInfo.json()).commitHash, process.env.GITHUB_SHA);
  for (const path of ['/api/build-info', '/meeting', '/meet-together']) {
    const outside = await fetchWorker(`https://tuturuuu.com${path}`);
    assert.equal(outside.status, 404);
    await outside.text();
  }
  const mountedLive = await fetchWorker(
    'https://tuturuuu.com/meet/live-connect',
    {
      headers: { Origin: 'https://meet.tuturuuu.com', Upgrade: 'websocket' },
    }
  );
  assert.equal(mountedLive.status, 403);
  await mountedLive.text();
  assert.deepEqual(unexpected, []);
});

test('emitted Live class constructs against disposable SQLite and denies absent sessions', {
  timeout: 30000,
}, async () => {
  const response = await fetchProbe(`/live-empty?name=ci-${randomUUID()}`);
  assert.equal(response.status, 401);
  await response.text();
  assert.deepEqual(unexpected, []);
});

test('emitted private provider entrypoint rejects invalid transport before billable egress', {
  timeout: 30000,
}, async () => {
  const response = await fetchProbe('/provider-invalid');
  assert.equal(response.status, 403);
  await response.text();
  assert.deepEqual(unexpected, []);
});

test('app default HTTP hook denies an authenticated nonfixture API forward', {
  timeout: 30000,
}, async () => {
  const before = forwarded.length;
  policies.app.expectDenial(
    'POST',
    'https://tuturuuu.com/api/v1/meet-ci-denied'
  );
  const response = await fetchWorker('/api/v1/meet-ci-denied', {
    method: 'POST',
    headers: {
      Cookie: signedCookie(),
      Origin: 'https://meet.tuturuuu.com',
      'Content-Type': 'application/json',
    },
    body: '{"fixture":true}',
  });
  assert.equal(response.status, 599);
  assert.equal(await response.text(), 'Unexpected fixture egress');
  assert.equal(forwarded.length, before);
  assert.equal(policies.app.assurance.length, ASSURANCE_READS);
  policies.app.assertControls(1);
  policies.probe.assertControls(0);
});

test('probe HTTP hook denies nonfixture, private, loopback and lookalike destinations', {
  timeout: 30000,
}, async () => {
  const targets = [
    'https://untrusted.invalid/nonfixture',
    'http://tuturuuu.com/api/v1/meet-ci-rewrite',
    'http://127.0.0.1/',
    'http://localhost/',
    'http://10.0.0.1/',
    'http://169.254.169.254/',
    'https://tuturuuu.com:444/api/v1/meet-ci-rewrite',
    'https://tuturuuu.com.untrusted.invalid/api/v1/meet-ci-rewrite',
    'https://tuturuuu.com/api/v1/meet-ci-rewrite-lookalike',
  ];
  assert.equal(targets.length, PROBE_NEGATIVES);
  for (const [index, target] of targets.entries()) {
    policies.probe.expectDenial('GET', target);
    const response = await fetchProbe(`/egress-denied/${index}`);
    assert.equal(response.status, 599, target);
    assert.equal(await response.text(), 'Unexpected fixture egress');
    policies.probe.assertControls(index + 1);
  }
  policies.app.assertControls(1);
});

test('named provider execution uses app HTTP denial while invalid transport makes zero attempts', {
  timeout: 30000,
}, async () => {
  policies.app.expectDenial(
    'POST',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-ci:generateContent'
  );
  const response = await fetchProbe('/provider-egress-denied');
  assert.equal(response.status, 599);
  assert.deepEqual(await response.json(), {
    error: { message: 'Meeting provider request failed' },
  });
  assert.equal(policies.app.assurance.length, ASSURANCE_READS);
  assert.equal(policies.probe.assurance.length, 0);
  policies.app.assertControls(2);
  policies.probe.assertControls(PROBE_NEGATIVES);
  const count = policies.app.controls.length;
  const invalid = await fetchProbe('/provider-invalid');
  assert.equal(invalid.status, 403);
  await invalid.text();
  assert.equal(policies.app.controls.length, count);
  assert.deepEqual(unexpected, []);
});
