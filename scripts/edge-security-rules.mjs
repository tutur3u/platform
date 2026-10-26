import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  validateCatalogBindings,
  validateRolloutPrerequisites,
} from './edge-security-catalog.mjs';

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
      'candidateApplicationHosts',
      'applicationMachinePrefixes',
      'applicationMachineExact',
      'serviceMachines',
      'probe',
      'rateLimit',
      'urlNormalization',
      'originLock',
      'entrypointCustody',
      'behaviorAcknowledgements',
      'framingHeaders',
      'prerequisites',
    ],
    'policy'
  );
  assert.equal(policy.version, 3);
  assert.equal(policy.status, 'draft-disabled');
  assert.equal(policy.zone, 'tuturuuu.com');
  assert.equal(policy.plan, 'Pro');
  assert.deepEqual(policy.excludedHosts, protectedHosts);
  const hostPattern = /^(?:[a-z0-9-]+\.)*tuturuuu\.com$/;
  const pathPattern = /^\/[A-Za-z0-9_./-]*$/;
  strings(policy.applicationHosts, hostPattern, 'applicationHosts');
  strings(
    policy.candidateApplicationHosts,
    hostPattern,
    'candidateApplicationHosts'
  );
  for (const host of [
    'store.tuturuuu.com',
    'stores.tuturuuu.com',
    'api.tuturuuu.com',
  ])
    assert(
      policy.candidateApplicationHosts.includes(host),
      'Required alias missing'
    );
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
    '/_next/static/',
    '/.well-known/',
  ]);
  assert(policy.applicationMachineExact.includes('/api'));
  assert(policy.applicationMachineExact.includes('/verify-token'));
  assert(
    !policy.applicationMachineExact.some((path) => path.startsWith('/auth/'))
  );
  assert.equal(
    new Set(policy.serviceMachines.map((service) => service.host)).size,
    policy.serviceMachines.length
  );
  assert(
    Array.isArray(policy.serviceMachines) && policy.serviceMachines.length > 0
  );
  for (const service of policy.serviceMachines) {
    exactKeys(service, ['host', 'exact', 'prefixes'], 'service');
    strings([service.host], hostPattern, 'service.host');
    strings(service.exact, pathPattern, 'service.exact');
    strings(service.prefixes, pathPattern, 'service.prefixes', true);
    assert(!service.prefixes.includes('/'), 'unbounded service skip');
  }
  exactKeys(
    policy.probe,
    [
      'hosts',
      'methods',
      'paths',
      'header',
      'secretPlaceholders',
      'stripBeforeOrigin',
      'rotation',
    ],
    'probe'
  );
  strings(policy.probe.hosts, hostPattern, 'probe.hosts');
  assert.deepEqual(policy.probe.methods, ['GET', 'HEAD']);
  assert.deepEqual(policy.probe.paths, ['/api/build-info', '/', '/en', '/vi']);
  assert.equal(policy.probe.header, 'x-tuturuuu-edge-probe');
  assert(
    isDeepStrictEqual(policy.probe.secretPlaceholders, [
      '__EDGE_PROBE_SECRET_CURRENT_REQUIRED__',
      '__EDGE_PROBE_SECRET_NEXT_REQUIRED__',
    ]),
    'Probe secrets must remain placeholders in the public proposal'
  );
  assert.equal(policy.probe.stripBeforeOrigin, true);
  exactKeys(
    policy.probe.rotation,
    [
      'maxAcceptedValues',
      'overlapMinutes',
      'classification',
      'rulesetReadersCanReadPlaintext',
    ],
    'probe.rotation'
  );
  assert.equal(policy.probe.rotation.maxAcceptedValues, 2);
  assert.equal(
    policy.probe.rotation.classification,
    'low-value-rotating-transport-exemption'
  );
  assert.equal(policy.probe.rotation.rulesetReadersCanReadPlaintext, true);
  assert(
    Number.isInteger(policy.probe.rotation.overlapMinutes) &&
      policy.probe.rotation.overlapMinutes > 0 &&
      policy.probe.rotation.overlapMinutes <= 15
  );
  exactKeys(
    policy.rateLimit,
    [
      'hosts',
      'prefixes',
      'characteristics',
      'period',
      'requestsPerPeriod',
      'mitigationTimeout',
      'existingRuleCount',
      'maximumRuleCount',
      'mode',
      'client429AcceptanceRequired',
      'excludedExactPaths',
      'excludedPrefixes',
      'serverSideRefreshAcceptanceRequired',
      'pollingAcceptanceRequired',
      'measuredPerIpP99Required',
    ],
    'rateLimit'
  );
  strings(policy.rateLimit.hosts, hostPattern, 'rateLimit.hosts');
  strings(policy.rateLimit.prefixes, pathPattern, 'rateLimit.prefixes');
  assert.deepEqual(policy.rateLimit.prefixes, [
    '/api/v1/auth/',
    '/api/auth/',
    '/api/cli/auth/',
  ]);
  assert.deepEqual(policy.rateLimit.characteristics, ['ip.src', 'cf.colo.id']);
  assert.equal(policy.rateLimit.period, 60);
  assert.equal(policy.rateLimit.requestsPerPeriod, 20);
  assert.equal(policy.rateLimit.mitigationTimeout, 60);
  assert.equal(policy.rateLimit.mode, 'low-threshold-auth-candidate');
  assert.equal(policy.rateLimit.client429AcceptanceRequired, true);
  assert.equal(policy.rateLimit.maximumRuleCount, 2);
  assert.equal(policy.rateLimit.existingRuleCount, 1);
  assert(
    policy.rateLimit.existingRuleCount + 1 <= policy.rateLimit.maximumRuleCount
  );
  const allHosts = [
    ...policy.applicationHosts,
    ...policy.candidateApplicationHosts,
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
  validateCatalogBindings(policy);
  validateRolloutPrerequisites(policy, exactKeys);
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
  const acceptedSecrets = policy.probe.secretPlaceholders
    .map(
      (secret) =>
        `any(http.request.headers[${quote(policy.probe.header)}][*] eq ${quote(secret)})`
    )
    .join(' or ');
  const probe = `(${exclusion} and ${hostExpression(policy.probe.hosts)} and http.request.method in ${set(policy.probe.methods)} and http.request.uri.path in ${set(policy.probe.paths)} and (${acceptedSecrets}))`;
  const transportSkip = {
    products: ['bic', 'securityLevel'],
    phases: ['http_request_sbfm'],
  };
  const ratelimit = policy.rateLimit;
  const rateExpression = `(${exclusion} and ${hostExpression(ratelimit.hosts)} and (${pathExpression([], ratelimit.prefixes)}) and not (${pathExpression(ratelimit.excludedExactPaths, ratelimit.excludedPrefixes)}))`;
  const admittedHosts = [
    ...new Set([
      ...policy.applicationHosts,
      ...policy.serviceMachines.map((service) => service.host),
    ]),
  ];
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
          'Baseline BIC already on; no additional protection',
          `(${exclusion} and ${hostExpression(policy.applicationHosts)} and not ${machine})`,
          'set_config',
          {
            action_parameters: { bic: true },
          }
        ),
        rule(
          'edge_machine_bic',
          'Machine transport opts out of BIC and Under Attack checks',
          machine,
          'set_config',
          {
            action_parameters: { bic: false, security_level: 'off' },
          }
        ),
      ],
    },
    'rate-limit.json': {
      name: 'Edge low-threshold authentication limit proposal',
      kind: 'zone',
      phase: 'http_ratelimit',
      rules: [
        rule(
          'edge_auth_attempts',
          'Pre-auth low threshold; origin lock and client 429 acceptance required',
          rateExpression,
          'block',
          {
            action_parameters: {
              response: {
                status_code: 429,
                content_type: 'application/json',
                content: JSON.stringify({
                  error: 'AUTH_RATE_LIMITED',
                  retryAfter: ratelimit.mitigationTimeout,
                }),
              },
            },
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
    'origin-transform.json': {
      name: 'Set separate origin-lock credential for verified proxied Vercel origins',
      kind: 'zone',
      phase: 'http_request_late_transform',
      rules: [
        rule(
          'edge_set_origin_secret',
          'High-value credential; reader/rotation acceptance required',
          policy.originLock.vercel.proxiedOriginHosts.length
            ? `(${exclusion} and ${hostExpression(policy.originLock.vercel.proxiedOriginHosts)})`
            : 'false',
          'rewrite',
          {
            action_parameters: {
              headers: {
                [policy.originLock.vercel.secretHeader]: {
                  operation: 'set',
                  value: policy.originLock.vercel.secretPlaceholders[0],
                },
              },
            },
          }
        ),
      ],
    },
    'late-transform.json': {
      name: 'Remove probe credential before origin',
      kind: 'zone',
      phase: 'http_request_late_transform',
      rules: [
        rule(
          'edge_strip_probe_header',
          'Remove every probe header value, including unmatched values',
          `(${exclusion} and ${hostExpression(admittedHosts)})`,
          'rewrite',
          {
            action_parameters: {
              headers: { [policy.probe.header]: { operation: 'remove' } },
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
  if (
    policy.serviceMachines.some(
      (service) =>
        service.host === host && matches(service.exact, service.prefixes)
    )
  )
    return 'machine';
  if (policy.applicationHosts.includes(host)) {
    return matches(
      policy.applicationMachineExact,
      policy.applicationMachinePrefixes
    )
      ? 'machine'
      : 'browser';
  }
  return policy.candidateApplicationHosts.includes(host)
    ? 'inactive'
    : 'unclassified';
}

export function matchesProbe(policy, request, expectedSecrets) {
  if (
    !Array.isArray(expectedSecrets) ||
    expectedSecrets.length < 1 ||
    expectedSecrets.length > policy.probe.rotation.maxAcceptedValues ||
    expectedSecrets.some(
      (secret) =>
        typeof secret !== 'string' ||
        secret.length < 32 ||
        policy.probe.secretPlaceholders.includes(secret)
    ) ||
    new Set(expectedSecrets).size !== expectedSecrets.length
  )
    return false;
  return (
    !protectedHosts.includes(request.host) &&
    policy.probe.hosts.includes(request.host) &&
    policy.probe.paths.includes(request.path) &&
    policy.probe.methods.includes(request.method) &&
    expectedSecrets.includes(request.headers?.[policy.probe.header])
  );
}

export function stripProbeHeader(policy, request) {
  const host = request.host;
  if (
    protectedHosts.includes(host) ||
    ![
      ...policy.applicationHosts,
      ...policy.serviceMachines.map((service) => service.host),
    ].includes(host)
  )
    return request.headers;
  return Object.fromEntries(
    Object.entries(request.headers).filter(
      ([name]) => name.toLowerCase() !== policy.probe.header
    )
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
    'Edge proposals valid: 7 disabled rules; no provider access or apply operation.'
  );
}
