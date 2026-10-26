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
      assert.equal(
        route.script ?? null,
        kind === 'native' ? 'tuturuuu-calendar' : null,
        `Unexpected Calendar ${kind} route owner`
      );
      return [kind, { id: route.id, pattern, script: route.script ?? null }];
    })
  );
}

export function calendarRollbackRoutes(handles) {
  const routes = Object.values(
    calendarRouteHandles(Object.values(handles).filter(Boolean))
  );
  assert.ok(routes.every(Boolean), 'Both Calendar route IDs must be captured');
  assert.notEqual(routes[0].id, routes[1].id, 'Calendar route IDs must differ');
  // Restore Vercel before removing the now-redundant scriptless exception.
  return routes;
}
