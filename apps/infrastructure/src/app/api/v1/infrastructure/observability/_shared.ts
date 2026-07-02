import { NextResponse } from 'next/server';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { parseObservabilityFilters } from '@/lib/infrastructure/observability';
import { authorizeInfrastructureViewer } from '../monitoring/blue-green/authorization';

type Loader<T> = (filters: ReturnType<typeof parseObservabilityFilters>) => T;

export async function handleObservabilityRequest<T>(
  request: Request,
  name: string,
  loader: Loader<Promise<T>>
) {
  return withRequestLogDrain(
    { request, route: `/api/v1/infrastructure/observability/${name}` },
    async () => {
      const authorization = await authorizeInfrastructureViewer(request);
      if (!authorization.ok) {
        return authorization.response;
      }

      try {
        const filters = parseObservabilityFilters(
          new URL(request.url).searchParams
        );
        return NextResponse.json(await loader(filters));
      } catch {
        return NextResponse.json(
          { message: `Failed to load observability ${name}` },
          { status: 500 }
        );
      }
    }
  );
}
