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

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Unknown error';
}

function getValidationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (!issue) return 'Invalid stress-test abort request payload.';
    const field = issue.path.join('.');
    return field
      ? `Invalid stress-test abort request payload: ${field}: ${issue.message}`
      : `Invalid stress-test abort request payload: ${issue.message}`;
  }

  if (error instanceof SyntaxError) {
    return 'Invalid stress-test abort request JSON.';
  }

  return null;
}

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ code, message }, { status });
}

async function parseAbortPayload(request: Request) {
  try {
    return payloadSchema.parse(await request.json());
  } catch (error) {
    if (
      error instanceof SyntaxError &&
      !request.headers.get('content-type')?.includes('application/json')
    ) {
      return payloadSchema.parse({});
    }

    throw error;
  }
}

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
        let payload: z.infer<typeof payloadSchema>;
        try {
          payload = await parseAbortPayload(request);
        } catch (error) {
          const message = getValidationMessage(error);
          if (message) {
            return jsonError(message, 400, 'STRESS_TEST_ABORT_INVALID_REQUEST');
          }
          throw error;
        }

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

        let abortRequest: ReturnType<typeof queueStressTestAbortFile>;
        try {
          abortRequest = queueStressTestAbortFile({
            reason: payload.reason ?? null,
            requestedBy: authorization.user.id,
            runId,
          });
        } catch (error) {
          const message = `Unable to write stress-test control files: ${getErrorMessage(error)}`;
          serverLogger.error(
            'Failed to queue infrastructure stress test abort control file',
            error
          );
          return jsonError(message, 500, 'STRESS_TEST_CONTROL_WRITE_FAILED');
        }

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
