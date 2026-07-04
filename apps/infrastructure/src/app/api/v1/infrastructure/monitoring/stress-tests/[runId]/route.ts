import { NextResponse } from 'next/server';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { readStressTestRun } from '@/lib/infrastructure/stress-testing';
import { authorizeInfrastructureViewer } from '../../blue-green/authorization';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/monitoring/stress-tests/[runId]',
    },
    async () => {
      const authorization = await authorizeInfrastructureViewer(request);
      if (!authorization.ok) return authorization.response;

      try {
        const run = await readStressTestRun(runId);
        if (!run) {
          return NextResponse.json(
            { message: 'Stress test run not found' },
            { status: 404 }
          );
        }

        return NextResponse.json(run);
      } catch (error) {
        console.error('Failed to load infrastructure stress test', error);
        return NextResponse.json(
          { message: 'Failed to load stress test run' },
          { status: 500 }
        );
      }
    }
  );
}
