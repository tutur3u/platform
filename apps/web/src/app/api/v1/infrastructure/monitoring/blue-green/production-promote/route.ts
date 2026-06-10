import { NextResponse } from 'next/server';
import { queueBlueGreenProductionPromoteRequest } from '@/lib/infrastructure/blue-green-monitoring-controls';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../authorization';

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const queuedRequest = queueBlueGreenProductionPromoteRequest({
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message:
        'Queued a production promotion request for the blue/green watcher.',
      request: queuedRequest,
    });
  } catch (error) {
    serverLogger.error('Failed to queue production promotion request:', error);
    return NextResponse.json(
      { message: 'Failed to queue production promotion request' },
      { status: 500 }
    );
  }
}
