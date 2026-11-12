export type RouteClassification = 'ADMIN' | 'CRON' | 'PRELOGIN' | 'PUBLIC';

// Exact canonical route patterns and methods; prefixes never grant exceptions.
export const ROUTE_EXCEPTIONS: readonly {
  path: string;
  method: string;
  classification: Exclude<RouteClassification, 'ADMIN'>;
}[] = [
  { path: '/login', method: 'GET', classification: 'PRELOGIN' },
  { path: '/api/auth/logout', method: 'POST', classification: 'PRELOGIN' },
  {
    path: '/api/cron/infrastructure/docker-recovery-alerts',
    method: 'GET',
    classification: 'CRON',
  },
  {
    path: '/api/cron/infrastructure/sample-resources',
    method: 'GET',
    classification: 'CRON',
  },
  {
    path: '/api/cron/infrastructure/sync-trust-cache',
    method: 'GET',
    classification: 'CRON',
  },
];

export function classifyInfrastructureRoute(
  path: string,
  method: string
): RouteClassification {
  return (
    ROUTE_EXCEPTIONS.find(
      (entry) => entry.path === path && entry.method === method
    )?.classification ?? 'ADMIN'
  );
}
