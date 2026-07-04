import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import {
  addAIWhitelistDomain,
  listAIWhitelistDomains,
} from '@/lib/ai-whitelist/domain-repository';

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
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const { searchParams } = new URL(request.url);
    const domains = await listAIWhitelistDomains({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
    });

    return NextResponse.json(domains);
  } catch (error) {
    console.error('Error listing AI whitelist domains:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const payload = createDomainSchema.parse(await request.json());
    const domain = await addAIWhitelistDomain({
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

    console.error('Error creating AI whitelist domain:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
