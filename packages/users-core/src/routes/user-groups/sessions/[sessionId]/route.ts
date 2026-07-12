import type { WorkspaceUserGroupSessionDescriptionJson } from '@tuturuuu/internal-api';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { updateUserGroupSession } from '@tuturuuu/users-core/lib/user-groups/session-schedule';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SessionFileSchema = z.object({
  name: z.string().trim().max(255).nullable().optional(),
  storagePath: z.string().trim().min(1).max(1024),
});

const DescriptionJsonSchema = z
  .custom<WorkspaceUserGroupSessionDescriptionJson | null>()
  .optional();

const UpdateSessionSchema = z
  .object({
    description: z.string().max(10_000).nullable().optional(),
    descriptionJson: DescriptionJsonSchema,
    endTimezone: z.string().trim().min(1).max(128).optional(),
    endsAt: z.string().datetime().optional(),
    files: z.array(SessionFileSchema).max(50).optional(),
    scope: z.enum(['once', 'future']).optional(),
    startTimezone: z.string().trim().min(1).max(128).optional(),
    startsAt: z.string().datetime().optional(),
    tagIds: z.array(z.string().uuid()).max(50).optional(),
    tagNames: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    title: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (value) =>
      !value.startsAt ||
      !value.endsAt ||
      new Date(value.endsAt) > new Date(value.startsAt),
    {
      message: 'Session end time must be after start time',
      path: ['endsAt'],
    }
  );

interface Params {
  params: Promise<{
    sessionId: string;
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { sessionId, wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('update_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group sessions' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = UpdateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await updateUserGroupSession({
      payload: parsed.data,
      sessionId,
      supabase,
      wsId: normalizedWsId,
    });

    if (!data) {
      return NextResponse.json(
        { message: 'User group session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    console.error('Failed to update user group session', { error });
    return NextResponse.json(
      { message: 'Failed to update user group session' },
      { status: 500 }
    );
  }
}
