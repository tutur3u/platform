import type {
  HealthRange,
  HealthStatus,
} from '@/lib/observability-health/summary';

export const STATUS_BADGE: Record<
  HealthStatus,
  'error' | 'secondary' | 'success' | 'warning'
> = {
  critical: 'error',
  healthy: 'success',
  unavailable: 'secondary',
  warning: 'warning',
};

export function healthHref(
  baseHref: string,
  range: HealthRange,
  service: string | null
) {
  const query = new URLSearchParams({ range });
  if (service) query.set('service', service);
  return `${baseHref}?${query.toString()}`;
}
