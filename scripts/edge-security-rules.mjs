import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const directory = new URL(
  '../infra/cloudflare/edge-security/',
  import.meta.url
);
const protectedHosts = ['finance.tuturuuu.com', 'finance-staging.tuturuuu.com'];
const quote = (value) => JSON.stringify(value);
const set = (values) => `{${values.map(quote).join(' ')}}`;
const hostExpression = (hosts) => `http.host in ${set(hosts)}`;
const exclusion = `not (${hostExpression(protectedHosts)})`;
const pathExpression = (exact, prefixes) =>
  [
    ...(exact.length ? [`http.request.uri.path in ${set(exact)}`] : []),
    ...prefixes.map(
      (prefix) => `starts_with(http.request.uri.path, ${quote(prefix)})`
    ),
  ].join(' or ');

function exactKeys(value, keys, name) {
  assert(value && typeof value === 'object' && !Array.isArray(value), name);
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    `${name}: unknown/missing field`
  );
}

function strings(values, pattern, name, allowEmpty = false) {
  assert(Array.isArray(values) && (allowEmpty || values.length > 0), name);
  assert.equal(new Set(values).size, values.length, `${name}: duplicate`);
  for (const value of values)
    assert(typeof value === 'string' && pattern.test(value), name);
}

export function validatePolicy(policy) {
  exactKeys(
    policy,
    [
      'version',
      'status',
      'zone',
      'plan',
      'excludedHosts',
      'applicationHosts',
      'applicationMachinePrefixes',
      'applicationMachineExact',
      'serviceMachines',
      'probe',
      'rateLimit',
      'prerequisites',
    ],
    'policy'
  );
  assert.equal(policy.version, 1);
  assert.equal(policy.status, 'draft-disabled');
  assert.equal(policy.zone, 'tuturuuu.com');
  assert.equal(policy.plan, 'Pro');
  assert.deepEqual(policy.excludedHosts, protectedHosts);
  const hostPattern = /^(?:[a-z0-9-]+\.)*tuturuuu\.com$/;
  const pathPattern = /^\/[A-Za-z0-9_./-]*$/;
  strings(policy.applicationHosts, hostPattern, 'applicationHosts');
  strings(
    policy.applicationMachinePrefixes,
    pathPattern,
    'applicationMachinePrefixes'
  );
  strings(
    policy.applicationMachineExact,
    pathPattern,
    'applicationMachineExact'
  );
  assert.deepEqual(policy.applicationMachinePrefixes, [
    '/api/',
    '/_next/',
    '/.well-known/',
  ]);
  assert(policy.applicationMachineExact.includes('/api'));
  assert(policy.applicationMachineExact.includes('/verify-token'));
  assert(
    Array.isArray(policy.serviceMachines) && policy.serviceMachines.length > 0
  );
  for (const service of policy.serviceMachines) {
    exactKeys(service, ['host', 'exact', 'prefixes'], 'service');
    strings([service.host], hostPattern, 'service.host');
    strings(service.exact, pathPattern, 'service.exact');
    strings(service.prefixes, pathPattern, 'service.prefixes', true);
    assert(
      !policy.applicationHosts.includes(service.host),
      'service/app overlap'
    );
    assert(!service.prefixes.includes('/'), 'unbounded service skip');
  }
  exactKeys(
    policy.probe,
    ['hosts', 'methods', 'paths', 'header', 'secretPlaceholder'],
    'probe'
  );
  strings(policy.probe.hosts, hostPattern, 'probe.hosts');
  assert.deepEqual(policy.probe.methods, ['GET', 'HEAD']);
  assert.deepEqual(policy.probe.paths, ['/api/build-info', '/', '/en', '/vi']);
  assert.equal(policy.probe.header, 'x-tuturuuu-edge-probe');
  assert(
    policy.probe.secretPlaceholder === '__EDGE_PROBE_SECRET_REQUIRED__',
    'Probe secret must remain a placeholder in the public proposal'
  );
  exactKeys(
    policy.rateLimit,
    [
      'hosts',
      'prefixes',
      'excludedPrefixes',
      'characteristics',
      'period',
      'requestsPerPeriod',
      'mitigationTimeout',
      'existingRuleCount',
      'maximumRuleCount',
    ],
    'rateLimit'
  );
  strings(policy.rateLimit.hosts, hostPattern, 'rateLimit.hosts');
  strings(policy.rateLimit.prefixes, pathPattern, 'rateLimit.prefixes');
  assert.deepEqual(policy.rateLimit.prefixes, ['/api/']);
  assert.deepEqual(policy.rateLimit.excludedPrefixes, [
    '/api/webhooks/',
    '/api/cron/',
  ]);
  assert.deepEqual(policy.rateLimit.characteristics, ['ip.src', 'cf.colo.id']);
  assert.equal(policy.rateLimit.period, 60);
  assert(
    Number.isInteger(policy.rateLimit.requestsPerPeriod) &&
      policy.rateLimit.requestsPerPeriod >= 6000
  );
  assert.equal(policy.rateLimit.mitigationTimeout, 10);
  assert.equal(policy.rateLimit.maximumRuleCount, 2);
  assert.equal(policy.rateLimit.existingRuleCount, 1);
  assert(
    policy.rateLimit.existingRuleCount + 1 <= policy.rateLimit.maximumRuleCount
  );
  const allHosts = [
    ...policy.applicationHosts,
    ...policy.serviceMachines.map((entry) => entry.host),
    ...policy.probe.hosts,
    ...policy.rateLimit.hosts,
  ];
  assert(
    !allHosts.some((host) => protectedHosts.includes(host)),
    'Finance scope is held'
  );
  for (const host of [...policy.probe.hosts, ...policy.rateLimit.hosts]) {
    assert(policy.applicationHosts.includes(host), 'unknown candidate app');
  }
  strings(policy.prerequisites, /\S/, 'prerequisites');
  return policy;
}

export function machineExpression(policy) {
  const app = `(${hostExpression(policy.applicationHosts)} and (${pathExpression(policy.applicationMachineExact, policy.applicationMachinePrefixes)}))`;
  const services = policy.serviceMachines.map(
    (service) =>
      `(http.host eq ${quote(service.host)} and (${pathExpression(service.exact, service.prefixes)}))`
  );
  return `(${exclusion} and (${[app, ...services].join(' or ')}))`;
}

function rule(ref, description, expression, action, extra = {}) {
  assert(
    Buffer.byteLength(expression, 'utf8') <= 4096,
    `${ref}: expression exceeds 4096 bytes`
  );
  return { ref, description, expression, action, enabled: false, ...extra };
}

export function compilePolicy(input) {
  const policy = validatePolicy(input);
  const machine = machineExpression(policy);
  const probe = `(${exclusion} and ${hostExpression(policy.probe.hosts)} and http.request.method in ${set(policy.probe.methods)} and http.request.uri.path in ${set(policy.probe.paths)} and any(http.request.headers[${quote(policy.probe.header)}][*] eq ${quote(policy.probe.secretPlaceholder)}))`;
  const transportSkip = {
    products: ['bic', 'securityLevel'],
    phases: ['http_request_sbfm'],
  };
  const ratelimit = policy.rateLimit;
  const rateExpression = `(${exclusion} and ${hostExpression(ratelimit.hosts)} and (${pathExpression([], ratelimit.prefixes)}) and not (${pathExpression([], ratelimit.excludedPrefixes)}))`;
  return {
    'custom.json': {
      name: 'Edge machine transport proposal',
      kind: 'zone',
      phase: 'http_request_firewall_custom',
      rules: [
        rule(
          'edge_probe_transport',
          'Secret-header probe template; private substitution required',
          probe,
          'skip',
          {
            action_parameters: transportSkip,
            logging: { enabled: true },
          }
        ),
        rule(
          'edge_machine_transport',
          'Transport exemption only; origin auth and WAF remain enforced',
          machine,
          'skip',
          {
            action_parameters: transportSkip,
            logging: { enabled: true },
          }
        ),
      ],
    },
    'configuration.json': {
      name: 'Edge browser and machine BIC proposal',
      kind: 'zone',
      phase: 'http_config_settings',
      rules: [
        rule(
          'edge_browser_bic',
          'Browser pages retain BIC',
          `(${exclusion} and ${hostExpression(policy.applicationHosts)} and not ${machine})`,
          'set_config',
          {
            action_parameters: { bic: true },
          }
        ),
        rule(
          'edge_machine_bic',
          'Machine transport avoids browser checks',
          machine,
          'set_config',
          {
            action_parameters: { bic: false, security_level: 'off' },
          }
        ),
      ],
    },
    'rate-limit.json': {
      name: 'Edge high-threshold machine flood proposal',
      kind: 'zone',
      phase: 'http_ratelimit',
      rules: [
        rule(
          'edge_machine_flood',
          'Candidate only: shared-IP effects require measurement',
          rateExpression,
          'block',
          {
            ratelimit: {
              characteristics: ratelimit.characteristics,
              period: ratelimit.period,
              requests_per_period: ratelimit.requestsPerPeriod,
              mitigation_timeout: ratelimit.mitigationTimeout,
            },
          }
        ),
      ],
    },
  };
}

export function classifyRequest(policy, request) {
  const { host, path } = request;
  if (protectedHosts.includes(host)) return 'held';
  const matches = (exact, prefixes) =>
    exact.includes(path) || prefixes.some((prefix) => path.startsWith(prefix));
  if (policy.applicationHosts.includes(host)) {
    return matches(
      policy.applicationMachineExact,
      policy.applicationMachinePrefixes
    )
      ? 'machine'
      : 'browser';
  }
  return policy.serviceMachines.some(
    (service) =>
      service.host === host && matches(service.exact, service.prefixes)
  )
    ? 'machine'
    : 'unclassified';
}

export function matchesProbe(policy, request, expectedSecret) {
  if (
    typeof expectedSecret !== 'string' ||
    expectedSecret.length < 32 ||
    expectedSecret === policy.probe.secretPlaceholder
  )
    return false;
  return (
    !protectedHosts.includes(request.host) &&
    policy.probe.hosts.includes(request.host) &&
    policy.probe.paths.includes(request.path) &&
    policy.probe.methods.includes(request.method) &&
    request.headers?.[policy.probe.header] === expectedSecret
  );
}

export function validateCompiled(policy, compiled) {
  assert(
    isDeepStrictEqual(compiled, compilePolicy(policy)),
    'Compiled proposals differ; regenerate from policy'
  );
  for (const ruleset of Object.values(compiled)) {
    for (const candidate of ruleset.rules) {
      assert.equal(
        candidate.enabled,
        false,
        'Draft rules must remain disabled'
      );
      assert(
        !candidate.expression.includes(' matches '),
        'Pro does not provide regex'
      );
      assert(
        !candidate.expression.includes('http.user_agent'),
        'No UA identity exemption'
      );
      assert(
        !candidate.expression.includes('ip.src'),
        'No IP identity exemption'
      );
      if (candidate.action === 'skip') {
        assert.deepEqual(candidate.action_parameters.phases, [
          'http_request_sbfm',
        ]);
        assert.deepEqual(candidate.action_parameters.products, [
          'bic',
          'securityLevel',
        ]);
        assert.equal(candidate.logging.enabled, true);
      }
    }
  }
}

export function loadPolicy() {
  return JSON.parse(readFileSync(new URL('policy.json', directory), 'utf8'));
}

export function validateWebhookOrigins(data) {
  assert.equal(data.version, 1);
  assert.equal(data.mode, 'observe-only');
  assert.equal(data.signatureRequired, true);
  assert.equal(data.ipMatchGrantsAuthentication, false);
  assert.deepEqual(
    data.providers.map((provider) => provider.name),
    ['Square', 'Polar']
  );
  for (const provider of data.providers) {
    assert(new URL(provider.source).protocol === 'https:');
    assert(
      provider.authentication.length > 0 &&
        provider.beforeEnforcement.length > 0
    );
    for (const host of provider.hosts) {
      assert(!protectedHosts.includes(host), 'Finance webhook scope held');
    }
    for (const cidr of [
      ...provider.productionCidrs,
      ...provider.sandboxCidrs,
    ]) {
      const [address, mask] = cidr.split('/');
      assert.equal(isIP(address), 4);
      assert(['24', '32'].includes(mask));
    }
    assert(!provider.productionCidrs.includes('0.0.0.0/0'));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(
    args.length <= 1 && (!args.length || args[0] === '--write'),
    'Usage: node scripts/edge-security-rules.mjs [--write]'
  );
  const policy = loadPolicy();
  const expected = compilePolicy(policy);
  if (args[0] === '--write') {
    for (const [name, data] of Object.entries(expected)) {
      writeFileSync(
        new URL(`rulesets/${name}`, directory),
        `${JSON.stringify(data, null, 2)}\n`
      );
    }
  }
  const actual = Object.fromEntries(
    Object.keys(expected).map((name) => [
      name,
      JSON.parse(readFileSync(new URL(`rulesets/${name}`, directory), 'utf8')),
    ])
  );
  validateCompiled(policy, actual);
  validateWebhookOrigins(
    JSON.parse(readFileSync(new URL('webhook-origins.json', directory), 'utf8'))
  );
  console.log(
    'Edge proposals valid: 5 disabled rules; no provider access or apply operation.'
  );
}
