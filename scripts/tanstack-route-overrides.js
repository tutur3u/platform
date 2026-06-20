const fs = require('node:fs');

const VALID_ROUTE_STATUSES = new Set([
  'accepted-removal',
  'legacy-next',
  'migrated',
]);
const VALID_TARGET_OWNERS = new Set(['rust-backend', 'tanstack-start']);

function readRouteOverrides(overridesPath, fsImpl = fs) {
  if (!overridesPath || !fsImpl.existsSync(overridesPath)) {
    return new Map();
  }

  const parsed = JSON.parse(fsImpl.readFileSync(overridesPath, 'utf8'));
  const routes = parsed.routes ?? {};

  return new Map(Object.entries(routes));
}

function applyRouteOverrides(routes, overrides = new Map()) {
  if (overrides.size === 0) {
    return routes;
  }

  const routeIds = new Set(routes.map((route) => route.id));
  const errors = [];

  for (const [routeId, override] of overrides) {
    if (!routeIds.has(routeId)) {
      errors.push(`Route override references an unknown route: ${routeId}`);
      continue;
    }

    if (override.status && !VALID_ROUTE_STATUSES.has(override.status)) {
      errors.push(
        `Route override ${routeId} has unsupported status: ${override.status}`
      );
    }

    if (
      override.targetOwner &&
      !VALID_TARGET_OWNERS.has(override.targetOwner)
    ) {
      errors.push(
        `Route override ${routeId} has unsupported targetOwner: ${override.targetOwner}`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return routes.map((route) => {
    const override = overrides.get(route.id);

    if (!override) {
      return route;
    }

    return {
      ...route,
      status: override.status ?? route.status,
      targetOwner: override.targetOwner ?? route.targetOwner,
    };
  });
}

module.exports = {
  applyRouteOverrides,
  readRouteOverrides,
};
