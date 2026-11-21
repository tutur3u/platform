// Generated route registries that record what the Web app serves. Each is
// derived from route source: a handler's path, its methods and, for the API
// registry, a hash of its source. A change to a route file therefore changes
// the registry even when no route is added, and a registry that was not
// regenerated fails its own CI check only on the next push that happens to
// trigger it. Every generator has a build-free `--check`; the gate runs the
// ones a change can affect (paths in scripts/ci/check-map.json).

/** `command` is run with Bun from `cwd`; `refresh` rewrites the registry. */
const ROUTE_REGISTRY_CHECKS = [
  {
    id: 'api-registry',
    label: 'API route registry (apps/api/generated)',
    cwd: 'apps/api',
    args: ['scripts/generate.ts', '--check'],
    refresh: 'bun run --cwd apps/api generate',
  },
  {
    id: 'web-route-manifest',
    label: 'Web route manifest (apps/web/start-route-manifest.json)',
    cwd: 'apps/web',
    args: ['cloudflare/generate-inventory.ts', '--check'],
    refresh: 'bun apps/web/cloudflare/generate-inventory.ts',
  },
  {
    id: 'gateway-routes',
    label: 'gateway route table (apps/gateway/src/web-routes.generated.json)',
    cwd: 'apps/web',
    args: ['cloudflare/vinext/gateway-routes.ts', '--check'],
    refresh: 'bun apps/web/cloudflare/vinext/gateway-routes.ts',
  },
];

/** The registry checks among the selected local checks, as gate steps. */
function routeRegistrySteps(selected) {
  return ROUTE_REGISTRY_CHECKS.filter((check) => selected.has(check.id)).map(
    ({ id, label, cwd, args, refresh }) => ({
      id,
      label,
      command: 'bun',
      args,
      cwd,
      fixHint: `Stale registry: run \`${refresh}\` and commit the result.`,
    })
  );
}

module.exports = { ROUTE_REGISTRY_CHECKS, routeRegistrySteps };
