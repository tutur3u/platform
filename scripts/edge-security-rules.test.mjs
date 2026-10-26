import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyRequest,
  compilePolicy,
  loadPolicy,
  matchesProbe,
  stripProbeHeader,
  validateCompiled,
  validatePolicy,
  validateWebhookOrigins,
} from './edge-security-rules.mjs';

test('draft compiles into bounded disabled Pro proposals', () => {
  const policy = loadPolicy();
  const compiled = Object.fromEntries(
    [
      'custom.json',
      'configuration.json',
      'rate-limit.json',
      'late-transform.json',
    ].map((name) => [
      name,
      JSON.parse(
        readFileSync(
          new URL(
            `../infra/cloudflare/edge-security/rulesets/${name}`,
            import.meta.url
          ),
          'utf8'
        )
      ),
    ])
  );
  validateCompiled(policy, compiled);
  assert.equal(
    Object.values(compiled).flatMap((entry) => entry.rules).length,
    6
  );
  const probe = compiled['custom.json'].rules[0];
  assert(
    probe.expression.includes(
      'any(http.request.headers["x-tuturuuu-edge-probe"][*] eq "__EDGE_PROBE_SECRET_CURRENT_REQUIRED__")'
    )
  );
  assert(probe.expression.includes('http.request.method in {"GET" "HEAD"}'));
  assert(
    probe.expression.includes(
      'http.request.uri.path in {"/api/build-info" "/" "/en" "/vi"}'
    )
  );
  const flood = compiled['rate-limit.json'].rules[0];
  assert.equal(flood.action, 'block');
  assert.equal(flood.ratelimit.requests_per_period, 20);
  assert.equal(flood.ratelimit.mitigation_timeout, 60);
  for (const prefix of ['/api/v1/auth/', '/api/auth/', '/api/cli/auth/'])
    assert(
      flood.expression.includes(
        `starts_with(http.request.uri.path, "${prefix}")`
      )
    );
  assert(!flood.expression.includes('http.request.headers'));
  assert(
    !flood.expression.includes('starts_with(http.request.uri.path, "/api/")')
  );
  assert.equal(flood.action_parameters.response.status_code, 429);
  assert.deepEqual(JSON.parse(flood.action_parameters.response.content), {
    error: 'AUTH_RATE_LIMITED',
    retryAfter: 60,
  });
  assert.equal(
    compiled['late-transform.json'].phase,
    'http_request_late_transform'
  );
  assert.deepEqual(
    compiled['late-transform.json'].rules[0].action_parameters.headers,
    { 'x-tuturuuu-edge-probe': { operation: 'remove' } }
  );
});

test('page probe exemptions require the exact secret, host, path and read method', () => {
  const policy = loadPolicy();
  const secret = 'fixture-only-probe-secret-32-characters';
  const request = {
    host: 'meet.tuturuuu.com',
    path: '/en',
    method: 'GET',
    headers: { 'x-tuturuuu-edge-probe': secret },
  };
  assert(matchesProbe(policy, request, [secret]));
  for (const invalid of [
    { ...request, headers: {} },
    { ...request, headers: { 'x-tuturuuu-edge-probe': 'wrong' } },
    { ...request, headers: {}, userAgent: 'curl/8.5.0', ip: '192.0.2.1' },
    { ...request, method: 'POST' },
    { ...request, path: '/en/settings' },
    { ...request, host: 'finance.tuturuuu.com' },
  ])
    assert.equal(matchesProbe(policy, invalid, [secret]), false);
  assert.equal(matchesProbe(policy, request, undefined), false);
  assert.equal(
    matchesProbe(policy, request, policy.probe.secretPlaceholders),
    false
  );
});

test('machine callers, browser pages, Finance and unknown hosts remain distinct', () => {
  const policy = loadPolicy();
  const cases = [
    ['tuturuuu.com', '/api/v1/workspaces/ws/tasks', 'machine'],
    ['tuturuuu.com', '/api/auth/mobile/send-otp', 'machine'],
    ['tuturuuu.com', '/api/auth/cli/exchange', 'machine'],
    ['mail.tuturuuu.com', '/api/webhooks/sendgrid', 'machine'],
    ['meet.tuturuuu.com', '/api/cron/process', 'machine'],
    ['meet.tuturuuu.com', '/api/build-info', 'machine'],
    ['colab.tuturuuu.com', '/api/sponsorship/verify', 'machine'],
    ['meet-realtime.tuturuuu.com', '/channels/publish', 'machine'],
    ['meet-realtime.tuturuuu.com', '/collaboration/checkpoint', 'machine'],
    ['meet-realtime.tuturuuu.com', '/realtime', 'machine'],
    ['lettin.tuturuuu.com', '/verify-token', 'machine'],
    ['meet.tuturuuu.com', '/_next/static/chunk.js', 'machine'],
    ['tuturuuu.com', '/en/login', 'browser'],
    ['tuturuuu.com', '/auth/register', 'browser'],
    ['meet.tuturuuu.com', '/auth/login', 'browser'],
    ['meet.tuturuuu.com', '/auth/callback', 'browser'],
    ['meet.tuturuuu.com', '/_next/image', 'browser'],
    ['meet.tuturuuu.com', '/_next/data/build/page.json', 'browser'],
    ['hive.tuturuuu.com', '/realtime', 'machine'],
    ['hive.tuturuuu.com', '/', 'browser'],
    ['store.tuturuuu.com', '/api/v1/storage', 'machine'],
    ['stores.tuturuuu.com', '/api/auth/verify', 'machine'],
    ['api.tuturuuu.com', '/api/auth/verify', 'machine'],
    ['colab.tuturuuu.com', '/auth/login', 'machine'],
    ['colab.tuturuuu.com', '/auth/callback', 'machine'],
    ['tuturuuu.com', '/.well-known/assetlinks.json', 'machine'],
    ['meet.tuturuuu.com', '/api-looks-like-a-page', 'browser'],
    ['finance.tuturuuu.com', '/api/build-info', 'held'],
    ['finance-staging.tuturuuu.com', '/en', 'held'],
    ['attacker.tuturuuu.com', '/api/v1/tasks', 'unclassified'],
    ['tuturuuu.com.evil.example', '/api/v1/tasks', 'unclassified'],
    ['workspaces.r2.storage.tuturuuu.com', '/private/object', 'unclassified'],
  ];
  for (const [host, path, expected] of cases) {
    assert.equal(
      classifyRequest(policy, {
        host,
        path,
        userAgent: 'Tuturuuu-Internal-API/1.0',
        authorization: 'Bearer fake',
      }),
      expected,
      `${host}${path}`
    );
  }
});

test('rotation accepts at most two values and strips all probe header variants before origin', () => {
  const policy = loadPolicy();
  const oldValue = 'fixture-only-old-probe-secret-32-characters';
  const newValue = 'fixture-only-new-probe-secret-32-characters';
  const request = {
    host: 'meet.tuturuuu.com',
    path: '/en',
    method: 'GET',
    headers: {
      'x-tuturuuu-edge-probe': oldValue,
      Authorization: 'Bearer fixture',
    },
  };
  assert(matchesProbe(policy, request, [oldValue, newValue]));
  assert(
    matchesProbe(
      policy,
      { ...request, headers: { 'x-tuturuuu-edge-probe': newValue } },
      [oldValue, newValue]
    )
  );
  assert.equal(matchesProbe(policy, request, [newValue]), false);
  assert.equal(
    matchesProbe(policy, request, [
      oldValue,
      newValue,
      'fixture-only-third-probe-secret-32-characters',
    ]),
    false
  );
  assert.deepEqual(stripProbeHeader(policy, request), {
    Authorization: 'Bearer fixture',
  });
  assert.deepEqual(
    stripProbeHeader(policy, {
      ...request,
      headers: { 'X-Tuturuuu-Edge-Probe': 'unmatched', Cookie: 'fixture' },
    }),
    { Cookie: 'fixture' }
  );
  assert.deepEqual(
    stripProbeHeader(policy, { ...request, host: 'finance.tuturuuu.com' }),
    request.headers
  );
});

test('negative controls reject Finance, accidental broad scopes and unsupported Pro features', () => {
  const changes = [
    (policy) => policy.applicationHosts.push('finance.tuturuuu.com'),
    (policy) => policy.probe.hosts.push('finance-staging.tuturuuu.com'),
    (policy) => {
      policy.excludedHosts = [];
    },
    (policy) => policy.applicationMachinePrefixes.push('/'),
    (policy) => {
      policy.applicationMachinePrefixes[1] = '/_next/';
    },
    (policy) => policy.applicationMachineExact.push('/auth/callback'),
    (policy) => {
      policy.urlNormalization.scope = 'incoming';
    },
    (policy) => {
      policy.urlNormalization.reReadBeforeApply = false;
    },
    (policy) => {
      policy.originLock.workersDev = true;
    },
    (policy) => {
      policy.originLock.previewUrls = true;
    },
    (policy) => {
      policy.originLock.vercel.requireEdgeInjectedSecret = false;
    },
    (policy) => {
      policy.originLock.vercel.protectAllDeploymentAliases = false;
    },
    (policy) => {
      policy.entrypointCustody.skipBeforeBlockOrChallenge = false;
    },
    (policy) => {
      policy.rateLimit.client429AcceptanceRequired = false;
    },
    (policy) => {
      policy.probe.stripBeforeOrigin = false;
    },
    (policy) => {
      policy.probe.rotation.overlapMinutes = 0;
    },
    (policy) => policy.serviceMachines[0].prefixes.push('/'),
    (policy) => {
      policy.rateLimit.characteristics = [
        'http.request.headers["authorization"]',
      ];
    },
    (policy) => {
      policy.rateLimit.requestsPerPeriod = 6000;
    },
    (policy) => {
      policy.rateLimit.existingRuleCount = 2;
    },
    (policy) => {
      policy.probe.secretPlaceholders = ['published-real-value'];
    },
    (policy) => {
      policy.probe.header = 'user-agent';
    },
    (policy) => {
      policy.rateLimit.action = 'log';
    },
    (policy) => {
      policy.serviceMachines[0].host = 'unknown.example';
    },
  ];
  for (const change of changes) {
    const policy = structuredClone(loadPolicy());
    change(policy);
    assert.throws(() => validatePolicy(policy));
  }
});

test('validator catches enabling, drift and dangerous skip expansion in actual JSON artifacts', () => {
  const policy = loadPolicy();
  for (const mutate of [
    (data) => {
      data['custom.json'].rules[0].enabled = true;
    },
    (data) =>
      data['custom.json'].rules[1].action_parameters.phases.push(
        'http_ratelimit'
      ),
    (data) =>
      data['custom.json'].rules[1].action_parameters.phases.push(
        'http_request_firewall_managed'
      ),
    (data) => {
      data['custom.json'].rules[1].expression =
        'http.user_agent eq "curl/8.5.0"';
    },
    (data) => {
      data['configuration.json'].rules[0].action_parameters.ai_labyrinth =
        false;
    },
    (data) => {
      data['rate-limit.json'].rules[0].action = 'log';
    },
    (data) => {
      delete data['late-transform.json'];
    },
    (data) => {
      data['late-transform.json'].rules[0].action_parameters.headers[
        'x-tuturuuu-edge-probe'
      ].operation = 'set';
    },
  ]) {
    const compiled = compilePolicy(policy);
    mutate(compiled);
    assert.throws(() => validateCompiled(policy, compiled));
  }
});

test('published webhook origin lists cannot replace signature authentication or start enforced', () => {
  const data = JSON.parse(
    readFileSync(
      new URL(
        '../infra/cloudflare/edge-security/webhook-origins.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  validateWebhookOrigins(data);
  for (const mutate of [
    (value) => {
      value.signatureRequired = false;
    },
    (value) => {
      value.ipMatchGrantsAuthentication = true;
    },
    (value) => {
      value.mode = 'enforce';
    },
    (value) => value.providers[0].productionCidrs.push('0.0.0.0/0'),
    (value) => value.providers[0].hosts.push('finance.tuturuuu.com'),
  ]) {
    const value = structuredClone(data);
    mutate(value);
    assert.throws(() => validateWebhookOrigins(value));
  }
});
