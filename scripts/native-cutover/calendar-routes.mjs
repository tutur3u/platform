import assert from 'node:assert/strict';

export const calendarRoutePatterns = {
  native: 'calendar.tuturuuu.com/*',
  acme: 'calendar.tuturuuu.com/.well-known/acme-challenge/*',
};

export function calendarRouteHandles(routes) {
  return Object.fromEntries(
    Object.entries(calendarRoutePatterns).map(([kind, pattern]) => {
      const matches = routes.filter((route) => route.pattern === pattern);
      assert.ok(matches.length <= 1, `Ambiguous Calendar ${kind} route`);
      const route = matches[0];
      if (!route) return [kind, null];
      assert.match(route.id ?? '', /^[a-f0-9]{32}$/);
      const script = route.script === '' ? null : (route.script ?? null);
      assert.equal(
        script,
        kind === 'native' ? 'tuturuuu-calendar' : null,
        `Unexpected Calendar ${kind} route owner`
      );
      return [kind, { id: route.id, pattern, script }];
    })
  );
}

export function calendarRollbackRoutes(handles, { createdAcmeRouteId } = {}) {
  const routes = Object.values(
    calendarRouteHandles(Object.values(handles).filter(Boolean))
  );
  assert.ok(routes.every(Boolean), 'Both Calendar route IDs must be captured');
  assert.notEqual(routes[0].id, routes[1].id, 'Calendar route IDs must differ');
  if (createdAcmeRouteId === undefined) return [routes[0]];
  assert.equal(
    createdAcmeRouteId,
    routes[1].id,
    'ACME route creation receipt must match'
  );
  // Restore Vercel before removing the cutover-owned scriptless exception.
  return routes;
}
