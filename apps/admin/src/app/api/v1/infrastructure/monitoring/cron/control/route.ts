import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateCronMonitoringControl } from '@/lib/infrastructure/cron-monitoring';
import { authorizeInfrastructureOperator } from '../../blue-green/authorization';

const payloadSchema = z.object({
  enabled: z.boolean(),
  jobId: z.string().trim().min(1).optional(),
});

export async function PUT(request: Request) {
  const authorization = await authorizeInfrastructureOperator(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    const control = updateCronMonitoringControl({
      enabled: payload.enabled,
      updatedBy: authorization.user.id,
      updatedByEmail: authorization.user.email ?? null,
      jobId: payload.jobId ?? null,
    });

    return NextResponse.json({
      control,
      message: payload.jobId
        ? payload.enabled
          ? 'Enabled native cron job.'
          : 'Disabled native cron job.'
        : payload.enabled
          ? 'Enabled native cron execution.'
          : 'Disabled native cron execution.',
    });
  } catch (error) {
    console.error('Failed to update cron monitoring control:', error);
    return NextResponse.json(
      { message: 'Failed to update cron monitoring control' },
      { status: 500 }
    );
  }
}
