import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getManagedCronAdminUser } from '@/lib/managed-cron/authorization';
import {
  deleteManagedCronWhitelistedDomain,
  updateManagedCronWhitelistedDomainEnabled,
} from '@/lib/managed-cron/domain-repository';

const updateDomainSchema = z.object({
  enabled: z.boolean(),
});

function forbiddenResponse() {
  return NextResponse.json(
    { message: 'You are not allowed to perform this action' },
    { status: 403 }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const user = await getManagedCronAdminUser(request);
  if (!user) return forbiddenResponse();

  try {
    const { domain } = await params;
    const payload = updateDomainSchema.parse(await request.json());

    await updateManagedCronWhitelistedDomainEnabled({
      actorId: user.id,
      domain,
      enabled: payload.enabled,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid whitelist domain payload' },
        { status: 400 }
      );
    }

    serverLogger.error('Error updating managed cron whitelist domain', error);
    return NextResponse.json(
      { message: 'Failed to update managed cron whitelist domain' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const user = await getManagedCronAdminUser(request);
  if (!user) return forbiddenResponse();

  try {
    const { domain } = await params;
    await deleteManagedCronWhitelistedDomain(domain);

    return NextResponse.json({ success: true });
  } catch (error) {
    serverLogger.error('Error deleting managed cron whitelist domain', error);
    return NextResponse.json(
      { message: 'Failed to delete managed cron whitelist domain' },
      { status: 500 }
    );
  }
}
