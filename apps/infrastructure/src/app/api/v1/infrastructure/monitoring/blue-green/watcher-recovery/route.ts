import { NextResponse } from 'next/server';
import { queueBlueGreenWatcherRecoveryRequest } from '@/lib/infrastructure/blue-green-monitoring-controls';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../authorization';

interface WatcherRecoveryBody {
  projectBranch?: string | null;
  projectId?: string;
  reason?: string;
  watcherBranch?: string | null;
  watcherHealth?: string | null;
}

function readText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as WatcherRecoveryBody;
    const projectId = readText(body.projectId);
    const reason = readText(body.reason);

    if (!projectId || !reason) {
      return NextResponse.json(
        { message: 'projectId and reason are required' },
        { status: 400 }
      );
    }

    const recoveryRequest = queueBlueGreenWatcherRecoveryRequest({
      projectBranch: readText(body.projectBranch),
      projectId,
      reason,
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
      watcherBranch: readText(body.watcherBranch),
      watcherHealth: readText(body.watcherHealth),
    });

    return NextResponse.json({
      message: 'Queued watcher recovery for the Docker web supervisor.',
      request: recoveryRequest,
    });
  } catch (error) {
    serverLogger.error('Failed to queue watcher recovery request:', error);
    return NextResponse.json(
      { message: 'Failed to queue watcher recovery request' },
      { status: 500 }
    );
  }
}
