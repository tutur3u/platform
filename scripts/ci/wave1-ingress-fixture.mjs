// Test-only Cloudflare topology fixtures for ingress-admitted staging Workers.
import { ingressTarget } from './wave1-ingress-topology.mjs';

export const fixtureZoneId = 'a'.repeat(32);
export const fixtureStaffGroupId = '33333333-3333-4333-8333-333333333333';
export const fixtureHealthTokenId = '77777777-7777-4777-8777-777777777777';
export const fixtureAppIds = {
  'calendar.staging.tutur3u.com': '11111111-1111-4111-8111-111111111111',
  'tutur3u.com': '22222222-2222-4222-8222-222222222222',
};
const list = (result) => ({
  success: true,
  result,
  result_info: { total_pages: 1 },
});

/** A topology that passes every §6.1 check for the app's ingress target. */
export function healthyTopology(app, phase = 'staff') {
  const target = ingressTarget(app);
  const topology = {
    domains: list([
      {
        hostname: target.host,
        service: target.worker,
        zone_name: 'tutur3u.com',
        environment: 'production',
      },
      {
        hostname: 'calendar.tuturuuu.com',
        service: 'tuturuuu-calendar',
        zone_name: 'tuturuuu.com',
      },
    ]),
    routes: list([{ pattern: 'docs.tutur3u.com/*', script: 'docs' }]),
    hostRecords: list([
      {
        type: 'AAAA',
        name: target.host,
        content: '100::',
        proxied: true,
        meta: { read_only: true },
      },
    ]),
    wildcardRecords: list([]),
    app: {
      success: true,
      result: {
        type: 'self_hosted',
        domain: target.host,
        destinations: [{ type: 'public', uri: target.host }],
        options_preflight_bypass: target.issuer,
      },
    },
    policies: list([
      {
        id: 'staff',
        name: 'staging-staff',
        decision: 'allow',
        include: [{ group: { id: fixtureStaffGroupId } }],
      },
      {
        id: 'ci',
        name: 'staging-ci-health',
        decision: 'non_identity',
        include: [{ service_token: { token_id: fixtureHealthTokenId } }],
      },
    ]),
    subdomain: {
      success: true,
      result: { enabled: false, previews_enabled: false },
    },
  };
  // Bootstrap (R-b): no allow policy, only the CI health service token.
  if (phase === 'bootstrap')
    topology.policies.result = topology.policies.result.filter(
      (policy) => policy.decision === 'non_identity'
    );
  return topology;
}

/** Routes a fixture URL to its observation, or null when it is not topology. */
export function topologyResponse(url, topology) {
  const path = url.pathname;
  if (path.endsWith('/workers/domains')) return topology.domains;
  if (path.endsWith('/workers/routes')) return topology.routes;
  if (path.endsWith('/dns_records'))
    return url.searchParams.has('name.exact')
      ? topology.hostRecords
      : topology.wildcardRecords;
  if (path.endsWith('/policies')) return topology.policies;
  if (/\/access\/apps\/[a-f0-9-]{36}$/u.test(path)) return topology.app;
  return null;
}
