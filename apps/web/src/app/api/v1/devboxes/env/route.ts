import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { updateDevboxEnv } from '@/lib/devboxes/store';

const EnvSchema = z.object({
  leaseId: z.string().trim().min(1),
  removals: z.array(z.string().trim().min(1)).optional(),
  updates: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const parsed = EnvSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  return NextResponse.json(
    await updateDevboxEnv({
      actorId: authorization.user.id,
      ...parsed.data,
    })
  );
}
