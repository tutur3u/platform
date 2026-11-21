import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

// Public addresses of a Worker. Zone routes are unsupported; custom domains
// must match the recorded ones exactly, each attached to the production
// environment. Messages never quote server values. Returns the observed
// routes and domains for the snapshot.
export function verifyPublicRoutes(raw, identity) {
  const domains = raw.domains.filter(
    (domain) => domain.service === identity.name
  );
  const routes = raw.zoneRoutes
    .filter(({ route }) => route.script === identity.name)
    .map(({ zone, route }) => ({ zone, pattern: route.pattern }));
  const expectedDomains = identity.routes.map((route) => {
    assert.ok(
      route.customDomain === true && route.zone === undefined,
      'settings snapshot profile supports only custom-domain routes'
    );
    return route.pattern;
  });
  assert.ok(routes.length === 0, 'unexpected Worker routes');
  assert.ok(
    isDeepStrictEqual(
      domains.map((domain) => domain.hostname).sort(),
      [...expectedDomains].sort()
    ),
    'unexpected Worker custom domains'
  );
  for (const domain of domains)
    assert.ok(
      (domain.environment ?? 'production') === 'production',
      'Worker custom domain is attached to another environment'
    );
  return { routes, domains };
}
