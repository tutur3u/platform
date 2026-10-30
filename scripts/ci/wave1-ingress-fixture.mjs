// Test-only Cloudflare topology fixtures for ingress-admitted staging Workers.
import { ingressTarget } from './wave1-ingress-topology.mjs';

export const fixtureZoneId = 'a'.repeat(32);
export const fixtureAppIds = {
  'calendar.staging.tutur3u.com': '11111111-1111-4111-8111-111111111111',
  'web.staging.tutur3u.com': '22222222-2222-4222-8222-222222222222',
};
const list = (result) => ({
  success: true,
  result,
  result_info: { total_pages: 1 },
});

/** A topology that passes every §6.1 check for the app's ingress target. */
export function healthyTopology(app) {
  const target = ingressTarget(app);
  return {
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
      { type: 'AAAA', name: target.host, content: '100::', proxied: true },
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
        include: [{ group: { id: 'g' } }],
      },
      {
        id: 'ci',
        name: 'staging-ci-health',
        decision: 'non_identity',
        include: [{ service_token: { token_id: 't' } }],
      },
    ]),
    subdomain: {
      success: true,
      result: { enabled: false, previews_enabled: false },
    },
  };
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
