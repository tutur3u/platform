import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { createDevboxLease } from '@/lib/devboxes/store';

const CreateLeaseSchema = z.object({
  profile: z.string().trim().min(1).optional(),
  runnerId: z.string().trim().min(1).optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const parsed = CreateLeaseSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await createDevboxLease({
        actorId: authorization.user.id,
        ...parsed.data,
      }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create devbox lease',
      },
      { status: 500 }
    );
  }
}
