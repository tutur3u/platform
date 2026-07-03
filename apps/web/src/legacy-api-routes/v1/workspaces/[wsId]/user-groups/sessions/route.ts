import type { WorkspaceUserGroupSessionDescriptionJson } from '@tuturuuu/internal-api';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { resolveUserGroupRouteWorkspaceId } from '@/lib/user-groups/route-helpers';
import {
  createUserGroupSession,
  listUserGroupSessions,
} from '@/lib/user-groups/session-schedule';

const SessionFileSchema = z.object({
  name: z.string().trim().max(255).nullable().optional(),
  storagePath: z.string().trim().min(1).max(1024),
});

const DescriptionJsonSchema = z
  .custom<WorkspaceUserGroupSessionDescriptionJson | null>()
  .optional();

const RecurrenceSchema = z.object({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .transform((days) => Array.from(new Set(days)).sort()),
  intervalWeeks: z.number().int().min(1).max(52).optional(),
  untilDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const CreateSessionSchema = z
  .object({
    description: z.string().max(10_000).nullable().optional(),
    descriptionJson: DescriptionJsonSchema,
    endTimezone: z.string().trim().min(1).max(128),
    endsAt: z.string().datetime(),
    files: z.array(SessionFileSchema).max(50).optional(),
    groupId: z.string().uuid(),
    recurrence: RecurrenceSchema.nullable().optional(),
    startTimezone: z.string().trim().min(1).max(128),
    startsAt: z.string().datetime(),
    tagIds: z.array(z.string().uuid()).max(50).optional(),
    tagNames: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    title: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'Session end time must be after start time',
    path: ['endsAt'],
  });

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ request: req, wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group sessions' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const groupId = url.searchParams.get('groupId');
  const from = url.searchParams.get('from');
  const includeMissing = url.searchParams.get('includeMissing') === 'true';
  const to = url.searchParams.get('to');

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const result = await listUserGroupSessions({
      from,
      groupId,
      includeMissing,
      supabase,
      to,
      wsId: normalizedWsId,
    });

    return NextResponse.json(result);
  } catch (error) {
    serverLogger.error('Failed to list user group sessions', { error });
    return NextResponse.json(
      { message: 'Failed to list user group sessions' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ request: req, wsId });
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

  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await createUserGroupSession({
      payload: parsed.data,
      supabase,
      wsId: normalizedWsId,
    });

    if (!data) {
      return NextResponse.json(
        { message: 'User group not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    serverLogger.error('Failed to create user group session', { error });
    return NextResponse.json(
      { message: 'Failed to create user group session' },
      { status: 500 }
    );
  }
}
