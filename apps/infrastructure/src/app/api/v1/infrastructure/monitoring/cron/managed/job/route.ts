import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { updateManagedExternalCronJob } from '@/lib/infrastructure/managed-external-cron-monitoring';
import { authorizeInfrastructureOperator } from '../../../blue-green/authorization';

const payloadSchema = z
  .object({
    enabled: z.boolean().optional(),
    externalAppId: z.string().trim().min(1),
    jobKey: z.string().trim().min(1),
    schedule: z.string().trim().min(1).optional(),
    scheduleTimezone: z.string().trim().min(1).optional(),
    wsId: z.string().uuid(),
  })
  .refine(
    (payload) =>
      typeof payload.enabled === 'boolean' ||
      typeof payload.schedule === 'string',
    {
      message: 'enabled or schedule is required',
    }
  )
  .refine((payload) => !payload.scheduleTimezone || Boolean(payload.schedule), {
    message: 'scheduleTimezone requires schedule',
  });

export async function PATCH(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    const status = await updateManagedExternalCronJob(payload);

    return NextResponse.json({
      message: 'Updated managed external cron job.',
      status,
    });
  } catch (error) {
    serverLogger.error('Failed to update managed external cron job:', error);
    return NextResponse.json(
      {
        message:
          error instanceof z.ZodError
            ? 'Invalid managed external cron update request'
            : 'Failed to update managed external cron job',
      },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
