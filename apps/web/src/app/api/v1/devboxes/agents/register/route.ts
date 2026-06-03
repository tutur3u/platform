import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { registerDevboxAgent } from '@/lib/devboxes/store';

const RegisterAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const parsed = RegisterAgentSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await registerDevboxAgent({
        actorId: authorization.user.id,
        name: parsed.data.name,
      }),
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to register devbox runner',
      },
      { status: 500 }
    );
  }
}
