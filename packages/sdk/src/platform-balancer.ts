import type { BalancerRun } from '@tuturuuu/devbox';
import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';

const PUBLISH_BATCH = 50;

/**
 * Publishes controller run records to the Infrastructure read model. The
 * server keeps only a newer revision from the same publisher, so retrying a
 * publication is always safe.
 */
export async function publishBalancerRuns(
  options: InternalApiClientOptions,
  runs: BalancerRun[]
) {
  const api = createInternalApiClient(options);
  const outcomes: { runId: string; applied: boolean }[] = [];
  for (let index = 0; index < runs.length; index += PUBLISH_BATCH) {
    const batch = runs.slice(index, index + PUBLISH_BATCH);
    const response = await api.json<{
      outcomes: { runId: string; applied: boolean }[];
    }>('/api/v1/infrastructure/balancer/runs', {
      body: JSON.stringify({ runs: batch }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    outcomes.push(...response.outcomes);
  }
  return outcomes;
}
