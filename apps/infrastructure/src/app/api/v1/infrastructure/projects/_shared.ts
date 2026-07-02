import { NextResponse } from 'next/server';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import {
  authorizeInfrastructureOperator,
  authorizeInfrastructureViewer,
} from '../monitoring/blue-green/authorization';

type InfrastructureProjectAccess = 'operator' | 'viewer';

export async function handleInfrastructureProjectRequest<T>(
  request: Request,
  route: string,
  handler: () => Promise<T>,
  options: { access?: InfrastructureProjectAccess } = {}
) {
  return withRequestLogDrain({ request, route }, async () => {
    const authorization =
      options.access === 'operator'
        ? await authorizeInfrastructureOperator(request)
        : await authorizeInfrastructureViewer(request);

    if (!authorization.ok) {
      return authorization.response;
    }

    try {
      return NextResponse.json(await handler());
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to process infrastructure project request',
        },
        { status: 400 }
      );
    }
  });
}

export async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string');
}
