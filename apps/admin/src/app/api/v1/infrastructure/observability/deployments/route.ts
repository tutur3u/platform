import { readObservabilityDeployments } from '@/lib/infrastructure/observability';
import { handleObservabilityRequest } from '../_shared';

export async function GET(request: Request) {
  return handleObservabilityRequest(request, 'deployments', (filters) =>
    readObservabilityDeployments(filters)
  );
}
