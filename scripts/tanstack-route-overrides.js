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

  const routesById = new Map(routes.map((route) => [route.id, route]));
  const errors = [];

  for (const [routeId, override] of overrides) {
    const route = routesById.get(routeId);

    if (!route) {
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

    if (override.methods) {
      if (route.methods.length === 0) {
        errors.push(
          `Route override ${routeId} cannot define method ownership for a route without exported methods.`
        );
        continue;
      }

      const exportedMethods = new Set(route.methods);

      for (const [method, methodOverride] of Object.entries(override.methods)) {
        if (!methodOverride || typeof methodOverride !== 'object') {
          errors.push(
            `Route override ${routeId} method ${method} must be an object.`
          );
          continue;
        }

        if (!exportedMethods.has(method)) {
          errors.push(
            `Route override ${routeId} references an unknown exported method: ${method}`
          );
        }

        if (
          methodOverride.status &&
          !VALID_ROUTE_STATUSES.has(methodOverride.status)
        ) {
          errors.push(
            `Route override ${routeId} method ${method} has unsupported status: ${methodOverride.status}`
          );
        }

        if (
          methodOverride.targetOwner &&
          !VALID_TARGET_OWNERS.has(methodOverride.targetOwner)
        ) {
          errors.push(
            `Route override ${routeId} method ${method} has unsupported targetOwner: ${methodOverride.targetOwner}`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return routes.flatMap((route) => {
    const override = overrides.get(route.id);

    if (!override) {
      return route;
    }

    if (override.methods) {
      return route.methods.map((method) => {
        const methodOverride = override.methods[method] ?? {};
        const methodStatus =
          methodOverride.status ?? override.status ?? route.status;
        const methodTargetOwner =
          methodOverride.targetOwner ??
          override.targetOwner ??
          route.targetOwner;

        return {
          ...route,
          id: `${route.kind}:${method}:${route.routePath}:${route.sourceFile}`,
          method,
          methods: [method],
          parentId: route.id,
          status: methodStatus,
          targetOwner: methodTargetOwner,
        };
      });
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
