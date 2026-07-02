import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { runManagedExternalCronJobNow } from '@/lib/infrastructure/managed-external-cron-monitoring';
import { authorizeInfrastructureOperator } from '../../../blue-green/authorization';

const payloadSchema = z.object({
  externalAppId: z.string().trim().min(1),
  jobKey: z.string().trim().min(1),
  wsId: z.string().uuid(),
});

export async function POST(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    const result = await runManagedExternalCronJobNow(payload);

    return NextResponse.json({
      message: 'Ran managed external cron job.',
      result,
    });
  } catch (error) {
    serverLogger.error('Failed to run managed external cron job:', error);
    const invalidRequest = error instanceof z.ZodError;
    const notFound =
      error instanceof Error && error.message === 'Managed cron job not found';
    const message = invalidRequest
      ? 'Invalid managed external cron run request'
      : notFound
        ? 'Managed cron job not found'
        : 'Failed to run managed external cron job';

    return NextResponse.json(
      { message },
      {
        status: invalidRequest ? 400 : notFound ? 404 : 500,
      }
    );
  }
}
