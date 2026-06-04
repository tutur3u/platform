import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import {
  createQueuedStressTestRun,
  persistStressTestRun,
  queueStressTestRunFile,
  readStressTestSnapshot,
} from '@/lib/infrastructure/stress-testing';
import {
  authorizeInfrastructureStressTestManager,
  authorizeInfrastructureViewer,
} from '../blue-green/authorization';

const payloadSchema = z.object({
  concurrency: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
  maxRequestsPerSecond: z.number().int().positive().optional(),
  path: z.string().min(1).max(500).optional(),
  profileId: z.enum(['smoke', 'steady', 'spike', 'ramp']),
  rampSeconds: z.number().int().min(0).optional(),
  targetId: z.string().min(1).max(120),
});

export async function GET(request: Request) {
  return withRequestLogDrain(
    { request, route: '/api/v1/infrastructure/monitoring/stress-tests' },
    async () => {
      const authorization = await authorizeInfrastructureViewer(request);
      if (!authorization.ok) return authorization.response;

      const manager = await authorizeInfrastructureStressTestManager(request);
      return NextResponse.json(
        await readStressTestSnapshot({ canManage: manager.ok })
      );
    }
  );
}

export async function POST(request: Request) {
  return withRequestLogDrain(
    { request, route: '/api/v1/infrastructure/monitoring/stress-tests' },
    async () => {
      const authorization =
        await authorizeInfrastructureStressTestManager(request);
      if (!authorization.ok) return authorization.response;

      try {
        const payload = payloadSchema.parse(await request.json());
        const snapshot = await readStressTestSnapshot({ canManage: true });
        const activeRun = snapshot.activeRun;

        if (activeRun?.target.id === payload.targetId) {
          return NextResponse.json(
            { message: 'A stress test is already active for this target.' },
            { status: 409 }
          );
        }

        const run = createQueuedStressTestRun({
          payload,
          requestedBy: authorization.user.id,
          requestedByEmail: authorization.user.email ?? null,
        });
        queueStressTestRunFile(run);
        await persistStressTestRun(run);

        return NextResponse.json({
          message: 'Queued stress test for the native runner.',
          run,
        });
      } catch (error) {
        serverLogger.error('Failed to queue infrastructure stress test', error);
        return NextResponse.json(
          { message: 'Failed to queue stress test' },
          { status: 500 }
        );
      }
    }
  );
}
