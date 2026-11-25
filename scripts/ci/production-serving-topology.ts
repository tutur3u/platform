import {
  productionPublicationPolicy,
  productionServingTopology,
} from '../../tuturuuu.ci.ts';

// A reviewed record of the Custom Domains and zone routes that already serve
// an admitted wave-1 Worker. The wave-1 production publisher requires the
// Worker's observed topology to equal this record before and after its
// upload; an app without a record must stay route-free.
export type ServingTopologyEntry = {
  reason: string;
  customDomains: readonly string[];
  routes: readonly string[];
};
export type ProductionServingTopology = Record<string, ServingTopologyEntry>;

const hostname = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const routePattern = /^(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[\w./*-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedUnique(
  value: unknown,
  pattern: RegExp,
  label: string
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || !pattern.test(entry)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`Invalid serving topology ${label}`);
  }
  return [...value].sort();
}

export function validateProductionServingTopology(
  topology: unknown,
  policy: Record<string, { state: string }> = productionPublicationPolicy
): Map<string, ServingTopologyEntry> {
  if (!isRecord(topology)) throw new Error('Expected serving topology records');
  const entries = new Map<string, ServingTopologyEntry>();
  for (const [app, entry] of Object.entries(topology)) {
    if (policy[app]?.state !== 'admitted') {
      throw new Error(`Serving topology needs an admitted app: ${app}`);
    }
    if (
      !isRecord(entry) ||
      Object.keys(entry).sort().join() !== 'customDomains,reason,routes' ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      /[\r\n]/.test(entry.reason)
    ) {
      throw new Error(`Malformed serving topology record: ${app}`);
    }
    const customDomains = sortedUnique(
      entry.customDomains,
      hostname,
      `${app} customDomains`
    );
    const routes = sortedUnique(entry.routes, routePattern, `${app} routes`);
    if (!customDomains.length && !routes.length) {
      throw new Error(`Empty serving topology record: ${app}`);
    }
    entries.set(app, { reason: entry.reason, customDomains, routes });
  }
  return entries;
}

/** The reviewed serving topology for an app, or null when it must be route-free. */
export function productionServingTopologyFor(
  app: string
): ServingTopologyEntry | null {
  return (
    validateProductionServingTopology(productionServingTopology).get(app) ??
    null
  );
}

type ObservedDomain = { hostname?: unknown };
type ObservedRoute = { pattern?: unknown };

/**
 * Compares the Worker's observed Custom Domains and routes with its reviewed
 * record. Returns a refusal message, or null when the topology is admitted.
 */
export function servingTopologyRefusal(
  allowance: ServingTopologyEntry | null,
  domains: readonly ObservedDomain[],
  routes: readonly ObservedRoute[]
): string | null {
  if (!allowance) {
    if (domains.length)
      return 'Worker already has a Custom Domain; record a reviewed productionServingTopology entry or use the release owner';
    if (routes.length)
      return 'Worker already has a route; record a reviewed productionServingTopology entry or use the release owner';
    return null;
  }
  const observedDomains = domains.map(({ hostname: name }) => name).sort();
  const observedRoutes = routes.map(({ pattern }) => pattern).sort();
  if (
    JSON.stringify(observedDomains) !== JSON.stringify(allowance.customDomains)
  )
    return 'Worker Custom Domains differ from its reviewed productionServingTopology';
  if (JSON.stringify(observedRoutes) !== JSON.stringify(allowance.routes))
    return 'Worker routes differ from its reviewed productionServingTopology';
  return null;
}
