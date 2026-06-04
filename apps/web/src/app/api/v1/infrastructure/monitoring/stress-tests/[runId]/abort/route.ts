import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import {
  persistStressTestRun,
  queueStressTestAbortFile,
  readStressTestRun,
} from '@/lib/infrastructure/stress-testing';
import { authorizeInfrastructureStressTestManager } from '../../../blue-green/authorization';

const payloadSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/monitoring/stress-tests/[runId]/abort',
    },
    async () => {
      const authorization =
        await authorizeInfrastructureStressTestManager(request);
      if (!authorization.ok) return authorization.response;

      try {
        const payload = payloadSchema.parse(
          await request.json().catch(() => ({}))
        );
        const run = await readStressTestRun(runId);
        if (!run) {
          return NextResponse.json(
            { message: 'Stress test run not found' },
            { status: 404 }
          );
        }

        if (run.status !== 'queued' && run.status !== 'running') {
          return NextResponse.json(
            { message: 'Stress test run is not active.' },
            { status: 409 }
          );
        }

        const abortRequest = queueStressTestAbortFile({
          reason: payload.reason ?? null,
          requestedBy: authorization.user.id,
          runId,
        });
        const nextRun = {
          ...run,
          abortReason: payload.reason ?? 'Operator requested abort.',
          abortRequestedAt: abortRequest.requestedAt,
          updatedAt: abortRequest.requestedAt,
        };
        await persistStressTestRun(nextRun);

        return NextResponse.json({
          message: 'Queued stress test abort request.',
          run: nextRun,
        });
      } catch (error) {
        serverLogger.error('Failed to abort infrastructure stress test', error);
        return NextResponse.json(
          { message: 'Failed to abort stress test' },
          { status: 500 }
        );
      }
    }
  );
}
