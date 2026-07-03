import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { createDevboxPreview } from '@/lib/devboxes/store';

const PreviewSchema = z.object({
  leaseId: z.string().trim().min(1),
  port: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const parsed = PreviewSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  return NextResponse.json(await createDevboxPreview(parsed.data));
}
