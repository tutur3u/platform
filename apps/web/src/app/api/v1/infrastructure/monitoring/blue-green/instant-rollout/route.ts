import { NextResponse } from 'next/server';
import { queueBlueGreenInstantRolloutRequest } from '@/lib/infrastructure/blue-green-monitoring-controls';
import { authorizeInfrastructureViewer } from '../authorization';

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const queuedRequest = queueBlueGreenInstantRolloutRequest({
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message: 'Queued an instant standby sync request for the watcher.',
      request: queuedRequest,
    });
  } catch (error) {
    console.error('Failed to queue instant standby sync request:', error);
    return NextResponse.json(
      { message: 'Failed to queue instant standby sync request' },
      { status: 500 }
    );
  }
}
