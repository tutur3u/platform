import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

const AttendanceSchema = z.object({
  user_id: z.guid(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'NONE']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

const BatchAttendanceSchema = z.array(AttendanceSchema);

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  if (!z.guid().safeParse(groupId).success) {
    return NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ message: 'Date is required' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user groups' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_group_attendance')
    .select('user_id, status, notes')
    .eq('group_id', groupId)
    .eq('date', date);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching attendance' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  if (!z.guid().safeParse(groupId).success) {
    return NextResponse.json({ message: 'Invalid groupId' }, { status: 400 });
  }

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('check_user_attendance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update attendance' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = BatchAttendanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const date = payload[0]?.date;

  if (!date) {
    return NextResponse.json({ message: 'Date is required' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  const toDelete = payload
    .filter((p) => p.status === 'NONE')
    .map((p) => p.user_id);
  const toUpsert = payload
    .filter((p) => p.status !== 'NONE')
    .map((p) => ({
      group_id: groupId,
      date: p.date,
      user_id: p.user_id,
      status: p.status,
      notes: p.notes ?? '',
    }));

  if (toDelete.length > 0) {
    const { error: delError } = await sbAdmin
      .from('user_group_attendance')
      .delete()
      .eq('group_id', groupId)
      .eq('date', date)
      .in('user_id', toDelete);
    if (delError) {
      console.error(delError);
      return NextResponse.json(
        { message: 'Error deleting attendance' },
        { status: 500 }
      );
    }
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await sbAdmin
      .from('user_group_attendance')
      .upsert(toUpsert);
    if (upsertError) {
      console.error(upsertError);
      return NextResponse.json(
        { message: 'Error upserting attendance' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}
