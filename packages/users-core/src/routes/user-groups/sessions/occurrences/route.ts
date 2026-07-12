import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { repairUserGroupSessionOccurrence } from '@tuturuuu/users-core/lib/user-groups/session-schedule';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const RepairOccurrenceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupId: z.string().uuid(),
  seriesId: z.string().uuid(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
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

  const parsed = RepairOccurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await repairUserGroupSessionOccurrence({
      date: parsed.data.date,
      groupId: parsed.data.groupId,
      seriesId: parsed.data.seriesId,
      supabase,
      wsId: normalizedWsId,
    });

    if (!data) {
      return NextResponse.json(
        { message: 'User group session series not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'not_expected_series_date'
    ) {
      return NextResponse.json(
        { message: 'Date is not expected by this recurring schedule' },
        { status: 400 }
      );
    }

    console.error('Failed to repair user group session occurrence', {
      error,
    });
    return NextResponse.json(
      { message: 'Failed to repair user group session occurrence' },
      { status: 500 }
    );
  }
}
