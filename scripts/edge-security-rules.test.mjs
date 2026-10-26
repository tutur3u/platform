import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyRequest,
  compilePolicy,
  loadPolicy,
  matchesProbe,
  validateCompiled,
  validatePolicy,
  validateWebhookOrigins,
} from './edge-security-rules.mjs';

test('draft compiles into bounded disabled Pro proposals', () => {
  const policy = loadPolicy();
  const compiled = Object.fromEntries(
    ['custom.json', 'configuration.json', 'rate-limit.json'].map((name) => [
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
    5
  );
  const probe = compiled['custom.json'].rules[0];
  assert(
    probe.expression.includes(
      'any(http.request.headers["x-tuturuuu-edge-probe"][*] eq "__EDGE_PROBE_SECRET_REQUIRED__")'
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
  assert.equal(flood.ratelimit.requests_per_period, 6000);
  assert.equal(flood.ratelimit.mitigation_timeout, 10);
  assert(
    flood.expression.includes(
      'not (starts_with(http.request.uri.path, "/api/webhooks/")'
    )
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
  assert(matchesProbe(policy, request, secret));
  for (const invalid of [
    { ...request, headers: {} },
    { ...request, headers: { 'x-tuturuuu-edge-probe': 'wrong' } },
    { ...request, headers: {}, userAgent: 'curl/8.5.0', ip: '192.0.2.1' },
    { ...request, method: 'POST' },
    { ...request, path: '/en/settings' },
    { ...request, host: 'finance.tuturuuu.com' },
  ])
    assert.equal(matchesProbe(policy, invalid, secret), false);
  assert.equal(matchesProbe(policy, request, undefined), false);
  assert.equal(
    matchesProbe(policy, request, policy.probe.secretPlaceholder),
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

test('negative controls reject Finance, accidental broad scopes and unsupported Pro features', () => {
  const changes = [
    (policy) => policy.applicationHosts.push('finance.tuturuuu.com'),
    (policy) => policy.probe.hosts.push('finance-staging.tuturuuu.com'),
    (policy) => {
      policy.excludedHosts = [];
    },
    (policy) => policy.applicationMachinePrefixes.push('/'),
    (policy) => policy.serviceMachines[0].prefixes.push('/'),
    (policy) => {
      policy.rateLimit.characteristics = [
        'http.request.headers["authorization"]',
      ];
    },
    (policy) => {
      policy.rateLimit.requestsPerPeriod = 10;
    },
    (policy) => {
      policy.rateLimit.existingRuleCount = 2;
    },
    (policy) => {
      policy.probe.secretPlaceholder = 'published-real-value';
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
