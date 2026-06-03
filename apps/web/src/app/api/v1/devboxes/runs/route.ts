import { evaluateDevboxCommandPolicy } from '@tuturuuu/devbox';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { createDevboxRun, listDevboxRuns } from '@/lib/devboxes/store';

const CreateRunSchema = z.object({
  command: z.array(z.string().trim().min(1)).min(1),
  env: z.record(z.string(), z.string()).optional(),
  envFiles: z.array(z.string().trim().min(1)).optional(),
  keep: z.boolean().optional(),
  leaseId: z.string().trim().min(1).optional(),
  leaseMode: z.enum(['auto', 'existing']).optional(),
  previewPorts: z.array(z.number().int().positive()).optional(),
  reuse: z.boolean().optional(),
  runnerId: z.string().trim().min(1).optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    return NextResponse.json(await listDevboxRuns(authorization.user.id));
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Failed to list devbox runs',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const parsed = CreateRunSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const policy = evaluateDevboxCommandPolicy(parsed.data.command);
  if (!policy.allowed) {
    return NextResponse.json(
      { message: policy.reason ?? 'Command is blocked' },
      { status: 400 }
    );
  }

  try {
    const response = await createDevboxRun({
      actorId: authorization.user.id,
      ...parsed.data,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to create devbox run',
      },
      { status: 500 }
    );
  }
}
