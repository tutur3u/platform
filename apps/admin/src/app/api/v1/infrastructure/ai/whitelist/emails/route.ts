import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import {
  addAIWhitelistEmail,
  listAIWhitelistEmails,
} from '@/lib/ai-whitelist/email-repository';

const createEmailSchema = z.object({
  email: z.email(),
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
    const emails = await listAIWhitelistEmails({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
    });

    return NextResponse.json(emails);
  } catch (error) {
    console.error('Error listing AI whitelist emails:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const payload = createEmailSchema.parse(await request.json());
    const email = await addAIWhitelistEmail({
      email: payload.email,
      enabled: payload.enabled ?? true,
    });

    return NextResponse.json({ data: email }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid whitelist email payload' },
        { status: 400 }
      );
    }

    console.error('Error creating AI whitelist email:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
