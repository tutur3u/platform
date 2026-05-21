import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { listUserGroupActivityEventsForRange } from '@/lib/user-group-activity/data';

const SearchParamsSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  groupId: z.string().optional(),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  affectedUserQuery: z.string().optional(),
  actorQuery: z.string().optional(),
  query: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;
  const parsedParams = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );

  if (!parsedParams.success) {
    return NextResponse.json(
      { message: 'Invalid user group activity query parameters' },
      { status: 400 }
    );
  }

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('manage_workspace_audit_logs')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const data = await listUserGroupActivityEventsForRange({
      wsId,
      ...parsedParams.data,
    });

    return NextResponse.json(data);
  } catch (error) {
    serverLogger.error('Error fetching user group activity logs:', error);

    return NextResponse.json(
      { message: 'Error fetching user group activity logs' },
      { status: 500 }
    );
  }
}
