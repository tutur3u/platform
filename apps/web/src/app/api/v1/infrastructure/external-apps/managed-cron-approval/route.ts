import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { upsertManagedCronWhitelistedDomain } from '@/lib/managed-cron/domain-repository';
import { requireExternalAppRegistryAdmin } from '../access';

const approvalSchema = z.object({
  origin: z.string().trim().url().max(512),
});

export async function POST(request: Request) {
  const access = await requireExternalAppRegistryAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const parsed = approvalSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid managed cron approval payload' },
      { status: 400 }
    );
  }

  try {
    const domain = await upsertManagedCronWhitelistedDomain({
      actorId: access.user.id,
      description: 'Approved for external app managed scheduler callbacks.',
      domain: parsed.data.origin,
      enabled: true,
    });

    return NextResponse.json({
      domain: domain?.domain ?? new URL(parsed.data.origin).hostname,
      enabled: true,
    });
  } catch (error) {
    serverLogger.error('Failed to approve external app managed cron domain', {
      error,
      origin: parsed.data.origin,
    });

    return NextResponse.json(
      { error: 'Failed to approve managed cron domain' },
      { status: 400 }
    );
  }
}
