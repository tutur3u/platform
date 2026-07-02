import { readObservabilityAnalytics } from '@/lib/infrastructure/observability';
import { handleObservabilityRequest } from '../_shared';

export async function GET(request: Request) {
  return handleObservabilityRequest(request, 'analytics', (filters) =>
    readObservabilityAnalytics(filters)
  );
}
