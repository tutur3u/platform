import { listAuditLogEventsForRange } from '@tuturuuu/users-core/database/audit-log-data';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

const SearchParamsSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  eventKind: z.string().optional(),
  source: z.string().optional(),
  affectedUserQuery: z.string().optional(),
  actorQuery: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();

  const { wsId } = await params;
  const parsedParams = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid audit log query parameters' },
      { status: 400 }
    );
  }

  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('manage_workspace_audit_logs')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const data = await listAuditLogEventsForRange({
      wsId,
      ...parsedParams.data,
      canViewPrivateInfo: permissions.containsPermission(
        'view_users_private_info'
      ),
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching workspace user audit logs:', error);

    return NextResponse.json(
      { message: 'Error fetching audit logs' },
      { status: 500 }
    );
  }
}
