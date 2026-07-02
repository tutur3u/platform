import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getManagedCronAdminUser } from '@/lib/managed-cron/authorization';
import {
  addManagedCronWhitelistedDomain,
  listManagedCronWhitelistedDomains,
} from '@/lib/managed-cron/domain-repository';

const createDomainSchema = z.object({
  description: z.string().trim().nullable().optional(),
  domain: z.string().trim().min(1).max(253),
  enabled: z.boolean().optional(),
});

function forbiddenResponse() {
  return NextResponse.json(
    { message: 'You are not allowed to perform this action' },
    { status: 403 }
  );
}

export async function GET(request: Request) {
  const user = await getManagedCronAdminUser(request);
  if (!user) return forbiddenResponse();

  try {
    const { searchParams } = new URL(request.url);
    const domains = await listManagedCronWhitelistedDomains({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
    });

    return NextResponse.json(domains);
  } catch (error) {
    serverLogger.error('Error listing managed cron whitelist domains', error);
    return NextResponse.json(
      { message: 'Failed to list managed cron whitelist domains' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getManagedCronAdminUser(request);
  if (!user) return forbiddenResponse();

  try {
    const payload = createDomainSchema.parse(await request.json());
    const domain = await addManagedCronWhitelistedDomain({
      actorId: user.id,
      description: payload.description ?? null,
      domain: payload.domain,
      enabled: payload.enabled ?? true,
    });

    return NextResponse.json({ data: domain }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid whitelist domain payload' },
        { status: 400 }
      );
    }

    serverLogger.error('Error creating managed cron whitelist domain', error);
    return NextResponse.json(
      { message: 'Failed to create managed cron whitelist domain' },
      { status: 500 }
    );
  }
}
