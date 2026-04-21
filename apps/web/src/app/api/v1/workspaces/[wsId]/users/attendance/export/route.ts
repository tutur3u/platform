import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'Start date must be before or equal to end date',
    path: ['endDate'],
  });

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type AttendanceExportRow = {
  date: string;
  status: string;
  notes: string;
  user: {
    id: string;
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
  group: {
    id: string;
    name?: string | null;
  } | null;
};

export async function GET(request: Request, { params }: Params) {
  const { wsId: requestedWorkspaceId } = await params;

  const workspace = await getWorkspace(requestedWorkspaceId);
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const permissions = await getPermissions({
    wsId: workspace.id,
    request,
  });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('check_user_attendance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to export attendance' },
      { status: 403 }
    );
  }

  const searchParams = Object.fromEntries(
    new URL(request.url).searchParams.entries()
  );
  const parsedSearchParams = SearchParamsSchema.safeParse(searchParams);

  if (!parsedSearchParams.success) {
    return NextResponse.json(
      {
        message: 'Invalid search params',
        issues: parsedSearchParams.error.issues,
      },
      { status: 400 }
    );
  }

  const { startDate, endDate, offset, limit } = parsedSearchParams.data;
  const canViewPrivateInfo = permissions.containsPermission(
    'view_users_private_info'
  );

  const sbAdmin = await createAdminClient();
  const userFields = canViewPrivateInfo
    ? 'id, display_name, full_name, email'
    : 'id, display_name, full_name';

  const { data, error, count } = await sbAdmin
    .from('user_group_attendance')
    .select(
      `
        date,
        status,
        notes,
        user:workspace_users!inner(${userFields}),
        group:workspace_user_groups!inner(id, name)
      `,
      { count: 'exact' }
    )
    .eq('workspace_user_groups.ws_id', workspace.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error exporting workspace attendance:', error);
    return NextResponse.json(
      { message: 'Error exporting attendance' },
      { status: 500 }
    );
  }

  const rows = ((data ?? []) as AttendanceExportRow[]).map((row) => {
    const userName =
      row.user?.full_name?.trim() ||
      row.user?.display_name?.trim() ||
      row.user?.email?.trim() ||
      row.user?.id ||
      '';

    return {
      date: row.date,
      status: row.status,
      notes: row.notes ?? '',
      userId: row.user?.id ?? '',
      userName,
      userDisplayName: row.user?.display_name ?? null,
      userFullName: row.user?.full_name ?? null,
      userEmail: canViewPrivateInfo ? (row.user?.email ?? null) : null,
      groupId: row.group?.id ?? '',
      groupName: row.group?.name ?? null,
    };
  });

  return NextResponse.json({
    data: rows,
    count: count ?? 0,
    nextOffset:
      rows.length > 0 && offset + rows.length < (count ?? 0)
        ? offset + rows.length
        : undefined,
  });
}
