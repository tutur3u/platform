import { readObservabilityResources } from '@/lib/infrastructure/observability';
import { handleObservabilityRequest } from '../_shared';

export async function GET(request: Request) {
  return handleObservabilityRequest(request, 'resources', (filters) =>
    readObservabilityResources(filters)
  );
}
