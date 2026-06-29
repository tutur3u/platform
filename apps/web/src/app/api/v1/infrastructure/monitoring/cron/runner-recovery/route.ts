import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queueCronRunnerRecoveryRequest } from '@/lib/infrastructure/cron-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../../blue-green/authorization';

const payloadSchema = z.object({
  action: z.enum(['ensure', 'restart']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const parsed = payloadSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid cron runner recovery request' },
      { status: 400 }
    );
  }

  try {
    const queuedRequest = queueCronRunnerRecoveryRequest({
      action: parsed.data.action,
      reason:
        parsed.data.reason ??
        (parsed.data.action === 'restart'
          ? 'operator-requested-restart'
          : 'operator-requested-ensure'),
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message:
        parsed.data.action === 'restart'
          ? 'Queued cron runner restart for the Docker watcher.'
          : 'Queued cron runner service ensure for the Docker watcher.',
      request: queuedRequest,
    });
  } catch (error) {
    serverLogger.error('Failed to queue cron runner recovery request:', error);
    return NextResponse.json(
      { message: 'Failed to queue cron runner recovery request' },
      { status: 500 }
    );
  }
}
