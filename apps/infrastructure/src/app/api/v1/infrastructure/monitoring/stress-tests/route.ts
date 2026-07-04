import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
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

const CONTROL_WRITE_FAILURE_MESSAGE =
  'Unable to queue stress-test control request.';

function getValidationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (!issue) return 'Invalid stress-test request payload.';
    const field = issue.path.join('.');
    return field
      ? `Invalid stress-test request payload: ${field}: ${issue.message}`
      : `Invalid stress-test request payload: ${issue.message}`;
  }

  if (error instanceof SyntaxError) {
    return 'Invalid stress-test request JSON.';
  }

  return null;
}

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ code, message }, { status });
}

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
        let payload: z.infer<typeof payloadSchema>;
        try {
          payload = payloadSchema.parse(await request.json());
        } catch (error) {
          const message = getValidationMessage(error);
          if (message) {
            return jsonError(message, 400, 'STRESS_TEST_INVALID_REQUEST');
          }
          throw error;
        }

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

        try {
          queueStressTestRunFile(run);
        } catch (error) {
          console.error(
            'Failed to queue infrastructure stress test control file',
            error
          );
          return jsonError(
            CONTROL_WRITE_FAILURE_MESSAGE,
            500,
            'STRESS_TEST_CONTROL_WRITE_FAILED'
          );
        }

        await persistStressTestRun(run);

        return NextResponse.json({
          message: 'Queued stress test for the native runner.',
          run,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Stress test target is not allowlisted.'
        ) {
          return jsonError(
            error.message,
            400,
            'STRESS_TEST_TARGET_NOT_ALLOWLISTED'
          );
        }

        console.error('Failed to queue infrastructure stress test', error);
        return NextResponse.json(
          { message: 'Failed to queue stress test' },
          { status: 500 }
        );
      }
    }
  );
}
