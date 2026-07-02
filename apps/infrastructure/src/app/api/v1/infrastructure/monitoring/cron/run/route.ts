import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  queueCronRunRequest,
  readCronMonitoringSnapshot,
} from '@/lib/infrastructure/cron-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureOperator } from '../../blue-green/authorization';

const payloadSchema = z.object({
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    const snapshot = readCronMonitoringSnapshot();
    const job = snapshot.jobs.find(
      (candidate) => candidate.id === payload.jobId
    );

    if (!job) {
      return NextResponse.json(
        { message: 'Cron job not found' },
        { status: 404 }
      );
    }

    const queuedRequest = queueCronRunRequest({
      jobId: payload.jobId,
      requestedBy: authorization.user.id,
      requestedByEmail: authorization.user.email ?? null,
    });

    return NextResponse.json({
      message: snapshot.enabled
        ? 'Queued cron job for the native runner.'
        : 'Queued cron job. It will run when cron execution is re-enabled.',
      request: queuedRequest,
    });
  } catch (error) {
    serverLogger.error('Failed to queue cron run request:', error);
    return NextResponse.json(
      { message: 'Failed to queue cron run request' },
      { status: 500 }
    );
  }
}
